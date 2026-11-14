import { createHash } from 'node:crypto';
import * as Path from 'node:path';
import * as fs from 'fs-extra';
import { Parser as N3Parser } from 'n3';
import type { IHdtDocumentLike } from './LineageComputer';
import { keep, PatternMatcher, termKey, tripleToLine } from './QueryPatterns';

/**
 * Statistics on a sampled dataset.
 */
export interface ISampledDatasetStats {
  subjectRate: number;
  triples: number;
  subjects: number;
  matchingInFull: number;
  sampledSubjects: number;
  matching: number;
  other: number;
  lineage: number;
  witnesses: number;
  sampleTriples: number;
  sha256: string;
}

/**
 * The number of matches of a query pattern per dataset, over the full data and over the sample.
 */
export interface IPatternCounts {
  pattern: string;
  full: Record<string, number>;
  sample: Record<string, number>;
}

/**
 * Samples datasets. Per dataset, subjects are sampled at its subject rate. Of a sampled subject, all triples that match
 * a query pattern are kept, and its other triples are kept at the other triples rate.
 * Then, the answer lineage of all queries is added, so that query results equal those over the full data, and one
 * witness triple for each query pattern that matches the full dataset but nothing in the sample, so that the same
 * datasets are relevant to each query pattern as in the full data.
 */
export class DatasetSampler {
  public static readonly PAGE_SIZE = 500_000;

  public constructor(
    public readonly options: {
      documents: Record<string, IHdtDocumentLike>;
      queries: string[];
      subjectRates: Record<string, number>;
      otherTriplesRate: number;
      seed: string;
      lineageDirectory: string;
      outputDirectory: string;
      log: (message: string) => void;
      pageSize?: number;
    },
  ) {}

  /**
   * Sample all datasets into N-Triples files in the output directory.
   */
  public async sampleAll(): Promise<{ datasets: Record<string, ISampledDatasetStats>; patterns: IPatternCounts[] }> {
    const matcher = new PatternMatcher(this.options.queries);
    const fullCounts: Record<string, number>[] = matcher.patterns.map(() => ({}));
    const sampleCounts: Record<string, number>[] = matcher.patterns.map(() => ({}));
    await fs.ensureDir(this.options.outputDirectory);
    const datasets: Record<string, ISampledDatasetStats> = {};
    for (const ds of Object.keys(this.options.documents)) {
      datasets[ds] = await this.sample(ds, matcher, fullCounts, sampleCounts);
      this.options.log(`  ${ds}: ${datasets[ds].sampleTriples} of ${datasets[ds].triples} triples`);
    }
    const patterns = matcher.patterns
      .map((pattern, i) => ({ pattern: pattern.key, full: fullCounts[i], sample: sampleCounts[i] }))
      .sort((a, b) => Math.max(0, ...Object.values(b.full)) - Math.max(0, ...Object.values(a.full)) ||
        a.pattern.localeCompare(b.pattern));
    return { datasets, patterns };
  }

  /**
   * Sample a single dataset.
   * @param ds The dataset name.
   * @param matcher A matcher for the query patterns.
   * @param fullCounts The matches per pattern and dataset over the full data, which is updated.
   * @param sampleCounts The matches per pattern and dataset over the sample, which is updated.
   */
  public async sample(
    ds: string,
    matcher: PatternMatcher,
    fullCounts: Record<string, number>[],
    sampleCounts: Record<string, number>[],
  ): Promise<ISampledDatasetStats> {
    const document = this.options.documents[ds];
    const subjectRate = this.options.subjectRates[ds] ?? 1;
    const add = (counts: Record<string, number>[], indexes: number[]): void => {
      for (const index of indexes) {
        counts[index][ds] = (counts[index][ds] ?? 0) + 1;
      }
    };
    const total = (await document.countTriples()).totalCount;
    const lines = new Set<string>();
    const stats = {
      subjectRate,
      triples: total,
      subjects: 0,
      matchingInFull: 0,
      sampledSubjects: 0,
      matching: 0,
      other: 0,
      lineage: 0,
      witnesses: 0,
    };

    // Sample subjects, and count the matches of each pattern over the full data.
    let current: string | undefined;
    let sampled = false;
    const pageSize = this.options.pageSize ?? DatasetSampler.PAGE_SIZE;
    for (let offset = 0; offset < total; offset += pageSize) {
      const { triples } = await document.searchTriples(undefined, undefined, undefined, { offset, limit: pageSize });
      for (const { subject, predicate, object } of triples) {
        const subjectKey = termKey(subject);
        if (subjectKey !== current) {
          if (subject.termType === 'BlankNode' && subjectRate < 1) {
            throw new Error(`Dataset ${ds} has blank node subjects, which is only supported with a subject rate of 1`);
          }
          current = subjectKey;
          stats.subjects++;
          sampled = keep(this.options.seed, subjectRate, ds, subjectKey);
          if (sampled) {
            stats.sampledSubjects++;
          }
        }
        const matches = matcher.match(subjectKey, termKey(predicate), object);
        if (matches.length > 0) {
          stats.matchingInFull++;
          add(fullCounts, matches);
        }
        if (!sampled) {
          continue;
        }
        const line = tripleToLine(subject, predicate, object);
        if (matches.length > 0) {
          lines.add(line);
          stats.matching++;
          add(sampleCounts, matches);
        } else if (keep(this.options.seed, this.options.otherTriplesRate, 'other', line)) {
          lines.add(line);
          stats.other++;
        }
      }
    }

    // Add the lineage triples that were not sampled.
    const parser = new N3Parser({ format: 'N-Triples' });
    const lineageFiles = (await fs.readdir(this.options.lineageDirectory)).filter(file => file.endsWith(`.${ds}.nt`));
    for (const file of lineageFiles.sort()) {
      const contents = await fs.readFile(Path.join(this.options.lineageDirectory, file), 'utf8');
      for (const line of contents.split('\n').filter(text => text.length > 0).map(text => `${text}\n`)) {
        if (!lines.has(line)) {
          lines.add(line);
          stats.lineage++;
          const [ quad ] = parser.parse(line);
          add(sampleCounts, matcher.match(termKey(quad.subject), termKey(quad.predicate), quad.object));
        }
      }
    }

    // Add a witness for each pattern that matches the full dataset but nothing in the sample.
    for (const pattern of matcher.patterns) {
      if (fullCounts[pattern.index][ds] > 0 && !(sampleCounts[pattern.index][ds] > 0)) {
        const [ subject, predicate, object ] = pattern.terms;
        const { triples: [ quad ] } = await document.searchTriples(subject, predicate, object, { limit: 1 });
        lines.add(tripleToLine(quad.subject, quad.predicate, quad.object));
        stats.witnesses++;
        add(sampleCounts, matcher.match(termKey(quad.subject), termKey(quad.predicate), quad.object));
      }
    }

    const file = Path.join(this.options.outputDirectory, `${ds}.nt`);
    const sorted = [ ...lines ].sort();
    await fs.writeFile(file, sorted.join(''), 'utf8');
    return {
      ...stats,
      sampleTriples: sorted.length,
      sha256: createHash('sha256').update(await fs.readFile(file)).digest('hex'),
    };
  }
}

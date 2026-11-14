import * as Path from 'node:path';
import type * as RDF from '@rdfjs/types';
import * as fs from 'fs-extra';
import type { IQueryEngineLike, ISparqlJsonResults, ISparqlJsonTerm } from './LineageComputer';
import { evaluate, rdfTermToJson } from './LineageComputer';
import { compareStrings, parseQuery, projectedVariables, termKey } from './QueryPatterns';

/**
 * Rows that occur more often in one result than in another, with up to 3 examples.
 */
export interface IRowDifference {
  count: number;
  examples: (string | null)[][];
}

/**
 * The validation of a single query.
 */
export interface IQueryValidation {
  ok: boolean;
  results?: number;
  fullResults?: number;
  limit?: number;
  onlyInSample?: IRowDifference;
  onlyInFull?: IRowDifference;
  published?: { results: number; onlyInSample: IRowDifference; onlyInPublished: IRowDifference };
  error?: string;
}

/**
 * The key of a term in the SPARQL 1.1 Query Results JSON Format, equal to the key of the corresponding RDF term.
 * @param term A term in the SPARQL 1.1 Query Results JSON Format.
 */
export function jsonTermKey(term: ISparqlJsonTerm): string {
  switch (term.type) {
    case 'uri':
      return `<${term.value}>`;
    case 'bnode':
      return `_:${term.value}`;
    default:
      if (term['xml:lang']) {
        return `${JSON.stringify(term.value)}@${term['xml:lang']}`;
      }
      return term.datatype && term.datatype !== 'http://www.w3.org/2001/XMLSchema#string' ?
        `${JSON.stringify(term.value)}^^${term.datatype}` :
        JSON.stringify(term.value);
  }
}

/**
 * Count how often each key occurs.
 * @param keys Keys.
 */
export function countKeys(keys: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const key of keys) {
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * The rows (with multiplicity) that occur more often in a than in b.
 * @param a Counted row keys.
 * @param b Counted row keys.
 */
export function bagDifference(a: Map<string, number>, b: Map<string, number>): IRowDifference {
  let count = 0;
  const examples: (string | null)[][] = [];
  for (const [ key, n ] of a) {
    const extra = n - (b.get(key) ?? 0);
    if (extra > 0) {
      count += extra;
      if (examples.length < 3) {
        examples.push(<(string | null)[]> JSON.parse(key));
      }
    }
  }
  return { count, examples };
}

/**
 * Validates a sample by evaluating each query over the sample and over the full data, with each dataset as a
 * separate source, as in a federation. Queries without LIMIT must have exactly the same results over both, and
 * queries with a LIMIT must have as many results as their expected results.
 * The results over the sample are written as the expected results.
 * They are also compared with the published expected results, whose differences are reported.
 */
export class SampleValidator {
  public constructor(
    public readonly options: {
      sampleEngine: IQueryEngineLike;
      sampleContext: any;
      fullEngine: IQueryEngineLike;
      fullContext: any;
      queries: Record<string, string>;
      evaluationQueries: Record<string, string>;
      publishedResults: Record<string, ISparqlJsonResults | undefined>;
      resultsDirectory: string;
      sampleTimeoutSeconds: number;
      fullTimeoutSeconds: number;
      log: (message: string) => void;
    },
  ) {}

  /**
   * Validate all queries.
   */
  public async validateAll(): Promise<Record<string, IQueryValidation>> {
    await fs.ensureDir(this.options.resultsDirectory);
    const report: Record<string, IQueryValidation> = {};
    for (const id of Object.keys(this.options.queries)) {
      try {
        report[id] = await this.validate(id);
      } catch (error: unknown) {
        report[id] = { ok: false, error: (<Error> error).message };
      }
      this.options.log(`  ${id}: ${SampleValidator.summarize(report[id])}`);
    }
    return report;
  }

  /**
   * Validate a single query.
   * @param id A query id.
   */
  public async validate(id: string): Promise<IQueryValidation> {
    const parsed = parseQuery(this.options.queries[id]);
    const query = this.options.evaluationQueries[id] ?? this.options.queries[id];
    const sample = await evaluate(
      this.options.sampleEngine,
      query,
      this.options.sampleContext,
      this.options.sampleTimeoutSeconds,
    );
    const variables = projectedVariables(parsed, sample);
    const solutionKey = (solution: RDF.Bindings): string => JSON.stringify(variables
      .map(variable => solution.has(variable) ? termKey(solution.get(variable)!) : null));
    const sampleKeys = countKeys(sample.map(solutionKey));
    const resultsFile = Path.join(this.options.resultsDirectory, `${id}.srj`);
    const validation: IQueryValidation = { ok: false, results: sample.length };

    if (parsed.limit === undefined) {
      const full = await evaluate(
        this.options.fullEngine,
        query,
        this.options.fullContext,
        this.options.fullTimeoutSeconds,
      );
      const fullKeys = countKeys(full.map(solutionKey));
      validation.fullResults = full.length;
      validation.onlyInSample = bagDifference(sampleKeys, fullKeys);
      validation.onlyInFull = bagDifference(fullKeys, sampleKeys);
      validation.ok = validation.onlyInSample.count === 0 && validation.onlyInFull.count === 0;

      // The results over the sample, in a stable order, become the expected results.
      const sorted = sample
        .map(solution => ({ solution, key: solutionKey(solution) }))
        .sort((a, b) => compareStrings(a.key, b.key));
      const results: ISparqlJsonResults = {
        head: { vars: variables },
        results: {
          bindings: sorted.map(({ solution }) => Object.fromEntries(variables
            .filter(variable => solution.has(variable))
            .map(variable => [ variable, rdfTermToJson(solution.get(variable)!) ]))),
        },
      };
      await fs.writeFile(resultsFile, JSON.stringify(results), 'utf8');
    } else {
      // The expected result was computed over the full data, and any result of its size is correct.
      const expected = <ISparqlJsonResults> JSON.parse(await fs.readFile(resultsFile, 'utf8'));
      validation.limit = parsed.limit;
      validation.ok = sample.length === expected.results.bindings.length;
    }

    // Differences with the published expected results, which can have defects, such as altered literals.
    const published = this.options.publishedResults[id];
    if (published) {
      const publishedKeys = countKeys(published.results.bindings.map(row => JSON.stringify(variables
        .map(variable => row[variable] ? jsonTermKey(row[variable]) : null))));
      validation.published = {
        results: published.results.bindings.length,
        onlyInSample: bagDifference(sampleKeys, publishedKeys),
        onlyInPublished: bagDifference(publishedKeys, sampleKeys),
      };
    }
    return validation;
  }

  /**
   * A summary of the validation of a query.
   * @param validation The validation of a query.
   */
  public static summarize(validation: IQueryValidation): string {
    if (validation.error) {
      return `failed: ${validation.error}`;
    }
    const comparison = validation.limit === undefined ?
      `${validation.fullResults} over the full data` :
      `LIMIT ${validation.limit}`;
    const published = validation.published ?
      `, published ${validation.published.results} (${validation.published.onlyInSample.count} rows only in sample, ${validation.published.onlyInPublished.count} only in published)` :
      '';
    return `${validation.ok ? 'OK' : 'FAILED'}, ${validation.results} results over the sample, ${comparison}${published}`;
  }
}

import type { EventEmitter } from 'node:events';
import * as Path from 'node:path';
import type * as RDF from '@rdfjs/types';
import * as fs from 'fs-extra';
import { DataFactory } from 'n3';
import type { BlankTerm, IriTerm, LiteralTerm, Ordering, ValuePatternRow, ValuesPattern } from 'sparqljs';
import { Generator, Wildcard } from 'sparqljs';
import {
  collectPatterns,
  compareStrings,
  isVariable,
  mandatoryVariables,
  parseQuery,
  projectedVariables,
  termKey,
  tripleToLine,
} from './QueryPatterns';

/**
 * The parts of an HDT document that are used.
 */
export interface IHdtDocumentLike {
  countTriples: (subject?: RDF.Term, predicate?: RDF.Term, object?: RDF.Term) => Promise<{ totalCount: number }>;
  searchTriples: (
    subject?: RDF.Term,
    predicate?: RDF.Term,
    object?: RDF.Term,
    options?: { offset?: number; limit?: number },
  ) => Promise<{ triples: RDF.Quad[] }>;
}

/**
 * The parts of a Comunica bindings stream that are used.
 */
export type IBindingsStreamLike = EventEmitter & { destroy: (cause?: Error) => void };

/**
 * The parts of a Comunica query engine that are used.
 */
export interface IQueryEngineLike {
  queryBindings: (query: string, context: any) => Promise<IBindingsStreamLike>;
}

/**
 * A term in the SPARQL 1.1 Query Results JSON Format.
 */
export interface ISparqlJsonTerm {
  type: string;
  value: string;
  'xml:lang'?: string;
  datatype?: string;
}

/**
 * Results in the SPARQL 1.1 Query Results JSON Format.
 */
export interface ISparqlJsonResults {
  head: { vars: string[] };
  results: { bindings: Record<string, ISparqlJsonTerm>[] };
}

/**
 * For a LIMIT query whose full result is too expensive to compute, the candidate values for one of its variables:
 * the subjects of the given predicate, which are tried in batches of the given size.
 */
export interface ILimitCandidates {
  variable: string;
  predicate: string;
  batchSize: number;
}

/**
 * Statistics on the lineage of a query.
 */
export interface ILineageStats {
  expectedRows: number;
  unmatchedRows: Record<string, string>[];
  stillUnmatchedRows: number;
  solutions: number;
  triples: Record<string, number>;
  seconds: number;
}

/**
 * Evaluate a query to an array of bindings, failing after the timeout.
 * @param engine A query engine.
 * @param query A query string.
 * @param context A query context.
 * @param timeoutSeconds A timeout in seconds.
 */
export async function evaluate(
  engine: IQueryEngineLike,
  query: string,
  context: any,
  timeoutSeconds: number,
): Promise<RDF.Bindings[]> {
  const stream = await engine.queryBindings(query, context);
  return await new Promise((resolve, reject) => {
    const solutions: RDF.Bindings[] = [];
    const timer = setTimeout(() => {
      stream.destroy();
      reject(new Error(`Query timed out after ${timeoutSeconds} seconds`));
    }, timeoutSeconds * 1_000);
    stream.on('data', (bindings: RDF.Bindings) => solutions.push(bindings));
    stream.on('error', (error: Error) => {
      clearTimeout(timer);
      reject(error);
    });
    stream.on('end', () => {
      clearTimeout(timer);
      resolve(solutions);
    });
  });
}

/**
 * Convert a term in the SPARQL 1.1 Query Results JSON Format to an RDF term.
 * @param term A term in the SPARQL 1.1 Query Results JSON Format.
 */
export function jsonTermToRdf(term: ISparqlJsonTerm): RDF.Term {
  switch (term.type) {
    case 'uri':
      return DataFactory.namedNode(term.value);
    case 'literal':
    case 'typed-literal':
      return DataFactory.literal(
        term.value,
        term['xml:lang'] ?? (term.datatype ? DataFactory.namedNode(term.datatype) : undefined),
      );
    default:
      throw new Error(`Unsupported result term type ${term.type}`);
  }
}

/**
 * Convert an RDF term to a term in the SPARQL 1.1 Query Results JSON Format.
 * @param term An RDF term.
 */
export function rdfTermToJson(term: RDF.Term): ISparqlJsonTerm {
  switch (term.termType) {
    case 'NamedNode':
      return { type: 'uri', value: term.value };
    case 'BlankNode':
      return { type: 'bnode', value: term.value };
    case 'Literal':
      if (term.language) {
        return { type: 'literal', value: term.value, 'xml:lang': term.language };
      }
      return term.datatype.value === 'http://www.w3.org/2001/XMLSchema#string' ?
          { type: 'literal', value: term.value } :
          { type: 'literal', value: term.value, datatype: term.datatype.value };
    default:
      throw new Error(`Unsupported binding term type ${term.termType}`);
  }
}

const TERM_TYPE_ORDER: Record<string, number> = { BlankNode: 1, NamedNode: 2, Literal: 3 };

/**
 * Compare two solutions on the conditions of an ORDER BY, which may only contain variables.
 * @param a A solution.
 * @param b A solution.
 * @param order The ORDER BY conditions of a parsed query.
 */
export function compareOrder(a: RDF.Bindings, b: RDF.Bindings, order: Ordering[]): number {
  for (const { expression, descending } of order) {
    const variable = <Partial<RDF.Variable>> expression;
    if (variable.termType !== 'Variable') {
      throw new Error('Only variables are supported in ORDER BY of queries without published results');
    }
    const x = a.get(variable.value!);
    const y = b.get(variable.value!);
    let result: number;
    if (!x || !y) {
      result = (x ? 1 : 0) - (y ? 1 : 0);
    } else if (x.termType === y.termType) {
      const nx = Number(x.value);
      const ny = Number(y.value);
      if (x.termType === 'Literal' && !Number.isNaN(nx) && !Number.isNaN(ny)) {
        result = nx - ny;
      } else {
        result = compareStrings(x.value, y.value);
      }
    } else {
      result = TERM_TYPE_ORDER[x.termType] - TERM_TYPE_ORDER[y.termType];
    }
    if (result !== 0) {
      return descending ? -result : result;
    }
  }
  return 0;
}

/**
 * Computes the answer lineage of queries over the full datasets: every triple, per dataset, that contributes to a
 * solution.
 * Queries with published expected results get those results bound via VALUES, so that the values of unprojected
 * variables are recovered as well.
 * Queries without published results (the LIMIT queries) are evaluated first, and their result is stored as their
 * expected result.
 */
export class LineageComputer {
  public constructor(
    public readonly options: {
      engine: IQueryEngineLike;
      engineContext: any;
      documents: Record<string, IHdtDocumentLike>;
      queries: Record<string, string>;
      evaluationQueries: Record<string, string>;
      publishedResults: Record<string, ISparqlJsonResults | undefined>;
      limitCandidates: Record<string, ILimitCandidates>;
      timeoutSeconds: number;
      lineageDirectory: string;
      resultsDirectory: string;
      log: (message: string) => void;
    },
  ) {}

  /**
   * Compute the lineage of all queries, writing it as N-Triples per query and dataset, and statistics.
   */
  public async computeAll(): Promise<Record<string, ILineageStats>> {
    await fs.ensureDir(this.options.lineageDirectory);
    await fs.ensureDir(this.options.resultsDirectory);
    const stats: Record<string, ILineageStats> = {};
    for (const id of Object.keys(this.options.queries)) {
      stats[id] = await this.compute(id);
      this.options.log(`  ${id}: ${stats[id].solutions} solutions, lineage ${JSON.stringify(stats[id].triples)}`);
      await fs.writeFile(
        Path.join(this.options.lineageDirectory, 'stats.json'),
        `${JSON.stringify(stats, null, 2)}\n`,
        'utf8',
      );
    }
    return stats;
  }

  /**
   * The query used to evaluate the given query, which may be an equivalent formulation of it.
   * @param id A query id.
   */
  public getEvaluationQuery(id: string): string {
    return this.options.evaluationQueries[id] ?? this.options.queries[id];
  }

  /**
   * Compute the lineage of a single query.
   * @param id A query id.
   */
  public async compute(id: string): Promise<ILineageStats> {
    const start = Date.now();
    const expected = this.options.publishedResults[id] ?? await this.computeExpectedResults(id);
    const rows = LineageComputer.uniqueRows(expected);
    const text = this.getEvaluationQuery(id);
    const solutions = await this.evaluate(LineageComputer.lineageQuery(text, rows));

    // Expected rows whose terms differ from the data (e.g., altered literals) match no solution,
    // so those are retried with their literals unbound, which recovers the actual solutions.
    const rowKey = (row: Record<string, RDF.Term>): string => JSON.stringify(Object.keys(row).sort()
      .map(variable => [ variable, termKey(row[variable]) ]));
    const project = (solution: RDF.Bindings, variables: string[]): Record<string, RDF.Term> => Object
      .fromEntries(variables.filter(variable => solution.has(variable))
        .map(variable => [ variable, solution.get(variable)! ]));
    const matched = new Set(solutions.map(solution => rowKey(project(solution, expected.head.vars))));
    const unmatched = rows.filter(row => !matched.has(rowKey(row)));
    const relaxed = unmatched
      .map(row => Object.fromEntries(Object.entries(row).filter(([ , term ]) => term.termType !== 'Literal')))
      .filter(row => Object.keys(row).length > 0);
    let stillUnmatched = unmatched.length - relaxed.length;
    if (relaxed.length > 0) {
      const retried = await this.evaluate(LineageComputer.lineageQuery(text, relaxed));
      solutions.push(...retried);
      const recovered = new Set(retried.flatMap(solution => relaxed
        .filter(row => rowKey(project(solution, Object.keys(row))) === rowKey(row))
        .map(rowKey)));
      stillUnmatched += relaxed.filter(row => !recovered.has(rowKey(row))).length;
    }
    if (unmatched.length > 0) {
      this.options.log(`  ${id}: ${unmatched.length} expected rows match no solution, ${relaxed.length} retried with their literals unbound, ${stillUnmatched} still without solution`);
    }

    // Find the datasets that contain each triple of each solution.
    const datasets = Object.keys(this.options.documents);
    const triples: Record<string, Set<string>> = Object.fromEntries(datasets.map(ds => [ ds, new Set<string>() ]));
    const patterns = collectPatterns(parseQuery(text).where);
    for (const solution of solutions) {
      for (const pattern of patterns) {
        const terms = [ pattern.subject, pattern.predicate, pattern.object ]
          .map(term => isVariable(term) ? solution.get(term.value) : <RDF.Term> term);
        if (terms.includes(undefined)) {
          continue;
        }
        for (const ds of datasets) {
          if ((await this.options.documents[ds].countTriples(...terms)).totalCount > 0) {
            triples[ds].add(tripleToLine(terms[0]!, terms[1]!, terms[2]!));
          }
        }
      }
    }
    for (const ds of datasets) {
      await fs.writeFile(Path.join(this.options.lineageDirectory, `${id}.${ds}.nt`), [ ...triples[ds] ].join(''), 'utf8');
    }

    return {
      expectedRows: rows.length,
      unmatchedRows: unmatched.map(row => Object.fromEntries(Object.entries(row)
        .map(([ variable, term ]) => [ variable, termKey(term) ]))),
      stillUnmatchedRows: stillUnmatched,
      solutions: solutions.length,
      triples: Object.fromEntries(datasets.filter(ds => triples[ds].size > 0).map(ds => [ ds, triples[ds].size ])),
      seconds: Math.round((Date.now() - start) / 1_000),
    };
  }

  /**
   * Compute the expected results of a query without published results, which has a LIMIT,
   * so that any subset of the solutions of the right size is a correct result.
   * To remain deterministic, all solutions are computed, sorted on the ORDER BY and their values,
   * and the first ones are taken. The result is written to the results directory.
   * @param id A query id.
   */
  public async computeExpectedResults(id: string): Promise<ISparqlJsonResults> {
    this.options.log(`  ${id}: no published results, evaluating the query over the full data`);
    const text = this.getEvaluationQuery(id);
    const parsed = parseQuery(text);
    const { limit, offset = 0, order = []} = parsed;
    const end = limit === undefined ? undefined : offset + limit;
    delete parsed.limit;
    delete parsed.offset;
    const candidates = this.options.limitCandidates[id];
    const solutions = candidates ?
      await this.evaluateOnCandidates(id, text, candidates, end ?? Number.POSITIVE_INFINITY) :
      await this.evaluate(new Generator().stringify(parsed));
    const variables = projectedVariables(parseQuery(this.options.queries[id]), solutions);
    const solutionKey = (solution: RDF.Bindings): string => JSON.stringify(variables
      .map(variable => solution.has(variable) ? termKey(solution.get(variable)!) : ''));
    let keyed = solutions.map(solution => ({ solution, key: solutionKey(solution) }));
    if (parsed.distinct) {
      keyed = [ ...new Map(keyed.map(entry => [ entry.key, entry ])).values() ];
    }
    keyed.sort((a, b) => compareOrder(a.solution, b.solution, order) || compareStrings(a.key, b.key));
    const selected = keyed.slice(offset, end);
    const results: ISparqlJsonResults = {
      head: { vars: variables },
      results: {
        bindings: selected.map(({ solution }) => Object.fromEntries(variables
          .filter(variable => solution.has(variable))
          .map(variable => [ variable, rdfTermToJson(solution.get(variable)!) ]))),
      },
    };
    await fs.writeFile(Path.join(this.options.resultsDirectory, `${id}.srj`), JSON.stringify(results), 'utf8');
    return results;
  }

  /**
   * Evaluate a LIMIT query on batches of candidate values for one variable, in a fixed order,
   * until enough distinct projected rows are found.
   * All these rows are actual solutions, and the outcome is deterministic.
   * @param id A query id.
   * @param text The query to evaluate.
   * @param candidates The candidates configuration.
   * @param needed The number of distinct rows that are needed.
   */
  public async evaluateOnCandidates(
    id: string,
    text: string,
    candidates: ILimitCandidates,
    needed: number,
  ): Promise<RDF.Bindings[]> {
    const subjects = new Map<string, RDF.Term>();
    for (const document of Object.values(this.options.documents)) {
      const { triples } = await document.searchTriples(
        undefined,
        DataFactory.namedNode(candidates.predicate),
        undefined,
        { limit: Number.MAX_SAFE_INTEGER },
      );
      for (const { subject } of triples) {
        subjects.set(termKey(subject), subject);
      }
    }
    const ordered = [ ...subjects.keys() ].sort().map(key => subjects.get(key)!);
    const projection = parseQuery(this.options.queries[id]);
    const solutions: RDF.Bindings[] = [];
    const distinct = new Set<string>();
    let used = 0;
    for (let i = 0; i < ordered.length && distinct.size < needed; i += candidates.batchSize) {
      used = Math.min(ordered.length, i + candidates.batchSize);
      const parsed = parseQuery(text);
      delete parsed.limit;
      delete parsed.offset;
      parsed.where = [
        {
          type: 'values',
          values: ordered.slice(i, i + candidates.batchSize)
            .map(term => ({ [`?${candidates.variable}`]: <IriTerm | BlankTerm | LiteralTerm> term })),
        },
        ...parsed.where,
      ];
      for (const solution of await this.evaluate(new Generator().stringify(parsed))) {
        solutions.push(solution);
        distinct.add(JSON.stringify(projectedVariables(projection, [ solution ])
          .map(variable => solution.has(variable) ? termKey(solution.get(variable)!) : '')));
      }
    }
    this.options.log(`  ${id}: ${distinct.size} distinct rows from the first ${used} of ${ordered.length} candidates for ?${candidates.variable}`);
    return solutions;
  }

  /**
   * Evaluate a query over the full data.
   * @param query A query string.
   */
  public evaluate(query: string): Promise<RDF.Bindings[]> {
    return evaluate(this.options.engine, query, this.options.engineContext, this.options.timeoutSeconds);
  }

  /**
   * The rows of results as maps from variable names to terms, without duplicates.
   * @param results Results in the SPARQL 1.1 Query Results JSON Format.
   */
  public static uniqueRows(results: ISparqlJsonResults): Record<string, RDF.Term>[] {
    const unique = new Map<string, Record<string, ISparqlJsonTerm>>();
    for (const row of results.results.bindings) {
      unique.set(JSON.stringify(Object.entries(row).sort(([ a ], [ b ]) => a.localeCompare(b))), row);
    }
    return [ ...unique.values() ].map(row => Object.fromEntries(Object.entries(row)
      .map(([ variable, term ]) => [ variable, jsonTermToRdf(term) ])));
  }

  /**
   * The query with all variables projected and without solution modifiers, joined with the rows via VALUES.
   * The full rows are joined last, so that their values never end up in solutions of an OPTIONAL that does not
   * match them.
   * The rows projected on the variables outside OPTIONAL and UNION are also joined first, which does not change the
   * solutions, but lets the engine start from them.
   * @param text A query string.
   * @param rows Rows of variable bindings.
   */
  public static lineageQuery(text: string, rows: Record<string, RDF.Term>[]): string {
    const parsed = parseQuery(text);
    const mandatory = mandatoryVariables(parsed.where);
    parsed.variables = [ new Wildcard() ];
    delete parsed.distinct;
    delete parsed.reduced;
    delete parsed.limit;
    delete parsed.offset;
    delete parsed.order;
    const toValues = (values: Record<string, RDF.Term>[]): ValuePatternRow[] => values.map(row => Object
      .fromEntries(Object.entries(row).map(([ variable, term ]) => [ `?${variable}`, <IriTerm | LiteralTerm> term ])));
    const first = [ ...new Map(rows
      .map(row => Object.fromEntries(Object.entries(row).filter(([ variable ]) => mandatory.has(variable))))
      .filter(row => Object.keys(row).length > 0)
      .map(row => [ JSON.stringify(Object.entries(row)
        .map(([ variable, term ]) => [ variable, termKey(term) ])
        .sort(([ a ], [ b ]) => compareStrings(a, b))), row ]))
      .values() ];
    const valuesPattern = (bindings: Record<string, RDF.Term>[]): ValuesPattern =>
      ({ type: 'values', values: toValues(bindings) });
    parsed.where = [
      ...first.length > 0 ? [ valuesPattern(first) ] : [],
      ...parsed.where,
      valuesPattern(rows),
    ];
    return new Generator().stringify(parsed);
  }
}

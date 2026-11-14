import type * as RDF from '@rdfjs/types';
import { Writer } from 'n3';
import type { Pattern, SelectQuery, Triple, VariableTerm } from 'sparqljs';
import { Parser } from 'sparqljs';

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const writer = new Writer({ format: 'N-Triples' });

/**
 * The N-Triples line of a triple, including the trailing newline, which is used as its identity.
 * @param subject The subject.
 * @param predicate The predicate.
 * @param object The object.
 */
export function tripleToLine(subject: RDF.Term, predicate: RDF.Term, object: RDF.Term): string {
  return writer.quadToString(<RDF.Quad_Subject> subject, <RDF.Quad_Predicate> predicate, <RDF.Quad_Object> object);
}

/**
 * A key of a term, which is equal for RDF 1.1-equal terms.
 * @param term An RDF term.
 */
export function termKey(term: RDF.Term): string {
  switch (term.termType) {
    case 'NamedNode':
      return `<${term.value}>`;
    case 'BlankNode':
      return `_:${term.value}`;
    case 'Literal':
      if (term.language) {
        return `${JSON.stringify(term.value)}@${term.language}`;
      }
      return term.datatype.value === XSD_STRING ?
        JSON.stringify(term.value) :
        `${JSON.stringify(term.value)}^^${term.datatype.value}`;
    default:
      throw new Error(`Unsupported term type ${term.termType}`);
  }
}

/**
 * A 32-bit FNV-1a hash over UTF-16 code units, which is stable across platforms.
 * @param value A string.
 */
export function fnv1a(value: string): number {
  let hash = 0x811C9DC5;
  for (let i = 0; i < value.length; i++) {
    // eslint-disable-next-line unicorn/prefer-code-point -- code units keep the hashes of existing samples
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash >>> 0;
}

/**
 * Deterministically decide if something identified by the given key parts is kept at the given rate.
 * @param seed A seed.
 * @param rate A rate between 0 and 1.
 * @param keyParts Strings that identify what is sampled.
 */
export function keep(seed: string, rate: number, ...keyParts: string[]): boolean {
  return rate >= 1 || fnv1a([ seed, ...keyParts ].join('\u0000')) < rate * 0x1_0000_0000;
}

/**
 * Compare two strings by their UTF-16 code units, which is independent of the locale.
 * @param a A string.
 * @param b A string.
 */
export function compareStrings(a: string, b: string): number {
  if (a < b) {
    return -1;
  }
  return a > b ? 1 : 0;
}

/**
 * A parsed SELECT query.
 */
export type ISelectQuery = SelectQuery & { where: Pattern[] };

/**
 * Parse a SPARQL SELECT query.
 * @param query A SPARQL query string.
 */
export function parseQuery(query: string): ISelectQuery {
  const parsed = new Parser().parse(query);
  if (parsed.type !== 'query' || parsed.queryType !== 'SELECT') {
    throw new Error('Only SELECT queries are supported');
  }
  return <ISelectQuery> parsed;
}

/**
 * All triple patterns of a list of patterns, including those in OPTIONAL, UNION, and subqueries.
 * @param patterns A list of patterns.
 * @param acc The array to add the triple patterns to.
 */
export function collectPatterns(patterns: Pattern[] = [], acc: Triple[] = []): Triple[] {
  for (const pattern of patterns) {
    if (pattern.type === 'bgp') {
      acc.push(...pattern.triples);
    } else if (pattern.type === 'query') {
      collectPatterns(pattern.where, acc);
    } else if ('patterns' in pattern) {
      collectPatterns(pattern.patterns, acc);
    }
  }
  return acc;
}

/**
 * Check if a term is a variable.
 * @param term A term in a parsed query.
 */
export function isVariable(term: Triple['subject'] | Triple['predicate'] | Triple['object']): term is VariableTerm {
  return (<{ termType?: string }> term).termType === 'Variable';
}

/**
 * Check if a query projects all its variables.
 * @param query A parsed SELECT query.
 */
export function isSelectAll(query: SelectQuery): boolean {
  return (<{ termType?: string }> query.variables[0]).termType === 'Wildcard';
}

/**
 * Variables that are bound in every solution of a group:
 * those of its triple patterns outside OPTIONAL and UNION, including in subqueries that project all their variables.
 * @param patterns The patterns of a group.
 * @param acc The set to add the variable names to.
 */
export function mandatoryVariables(patterns: Pattern[] = [], acc: Set<string> = new Set()): Set<string> {
  for (const pattern of patterns) {
    if (pattern.type === 'bgp') {
      for (const triple of pattern.triples) {
        for (const term of [ triple.subject, triple.predicate, triple.object ]) {
          if (isVariable(term)) {
            acc.add(term.value);
          }
        }
      }
    } else if (pattern.type === 'group') {
      mandatoryVariables(pattern.patterns, acc);
    } else if (pattern.type === 'query' && isSelectAll(pattern)) {
      mandatoryVariables(pattern.where, acc);
    }
  }
  return acc;
}

/**
 * The names of the projected variables of a parsed query, which are taken from the solutions for SELECT *.
 * @param parsed A parsed SELECT query.
 * @param solutions The solutions of the query.
 */
export function projectedVariables(parsed: SelectQuery, solutions: RDF.Bindings[]): string[] {
  if (isSelectAll(parsed)) {
    const names = new Set<string>();
    for (const solution of solutions) {
      for (const variable of solution.keys()) {
        names.add(variable.value);
      }
    }
    return [ ...names ].sort();
  }
  return parsed.variables.map(variable => 'expression' in variable ? variable.variable.value : variable.value);
}

/**
 * A triple pattern of a query, with the keys of its constant terms.
 */
export interface IMatcherPattern {
  index: number;
  key: string;
  subject?: string;
  predicate?: string;
  object?: string;
  terms: (RDF.Term | undefined)[];
}

/**
 * Matches triples against the triple patterns of queries.
 * Fully open patterns (?s ?p ?o) are excluded, as they match every triple.
 */
export class PatternMatcher {
  public readonly patterns: IMatcherPattern[] = [];
  private readonly byPredicate = new Map<string, IMatcherPattern[]>();
  private readonly variablePredicate: IMatcherPattern[] = [];

  public constructor(queries: string[]) {
    const seen = new Set<string>();
    for (const query of queries) {
      for (const triple of collectPatterns(parseQuery(query).where)) {
        const terms = [ triple.subject, triple.predicate, triple.object ]
          .map(term => isVariable(term) ? undefined : <RDF.Term> term);
        if (terms.every(term => term === undefined)) {
          continue;
        }
        const [ subject, predicate, object ] = terms.map(term => term ? termKey(term) : undefined);
        const key = `${subject ?? '?'} ${predicate ?? '?'} ${object ?? '?'}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        const pattern: IMatcherPattern = { index: this.patterns.length, key, subject, predicate, object, terms };
        this.patterns.push(pattern);
        if (predicate) {
          if (!this.byPredicate.has(predicate)) {
            this.byPredicate.set(predicate, []);
          }
          this.byPredicate.get(predicate)!.push(pattern);
        } else {
          this.variablePredicate.push(pattern);
        }
      }
    }
  }

  /**
   * The indexes of the patterns that a triple matches.
   * The key of the object is only computed when needed, as this is called for every triple of the full data.
   * @param subject The key of the subject.
   * @param predicate The key of the predicate.
   * @param object The object.
   */
  public match(subject: string, predicate: string, object: RDF.Term): number[] {
    const matches: number[] = [];
    let objectKey: string | undefined;
    for (const list of [ this.byPredicate.get(predicate) ?? [], this.variablePredicate ]) {
      for (const pattern of list) {
        if (pattern.subject !== undefined && pattern.subject !== subject) {
          continue;
        }
        if (pattern.object !== undefined) {
          objectKey ??= termKey(object);
          if (pattern.object !== objectKey) {
            continue;
          }
        }
        matches.push(pattern.index);
      }
    }
    return matches;
  }
}

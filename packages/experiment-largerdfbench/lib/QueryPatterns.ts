import type * as RDF from '@rdfjs/types';
import { toAlgebra } from '@traqula/algebra-sparql-1-1';
import type { Algebra } from '@traqula/algebra-transformations-1-1';
import { Types } from '@traqula/algebra-transformations-1-1';
import { Generator } from '@traqula/generator-sparql-1-1';
import { Parser } from '@traqula/parser-sparql-1-1';
import type { QuerySelect, TermIri, TermLiteral } from '@traqula/rules-sparql-1-1';
import { AstFactory } from '@traqula/rules-sparql-1-1';
import { Writer } from 'n3';
import { termToString } from 'rdf-string-ttl';

const XSD_STRING = 'http://www.w3.org/2001/XMLSchema#string';
const writer = new Writer({ format: 'N-Triples' });
const parser = new Parser();
const generator = new Generator();
export const AST_FACTORY = new AstFactory();

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
export interface IParsedQuery {
  /**
   * The syntax tree, which is used to rewrite the query.
   */
  ast: QuerySelect;
  /**
   * The algebra, in which prefixed names are resolved to IRIs.
   */
  algebra: Algebra.Operation;
}

/**
 * Parse a SPARQL SELECT query.
 * @param query A SPARQL query string.
 */
export function parseQuery(query: string): IParsedQuery {
  const ast = parser.parse(query);
  if (ast.type !== 'query' || ast.subType !== 'select') {
    throw new Error('Only SELECT queries are supported');
  }
  return { ast, algebra: toAlgebra(ast) };
}

/**
 * Serialize a syntax tree to a SPARQL query string.
 * @param ast A syntax tree of a SELECT query.
 */
export function generateQuery(ast: QuerySelect): string {
  return generator.generate(ast);
}

/**
 * Convert a term to a term in a syntax tree, for use in VALUES.
 * @param term An IRI or literal.
 */
export function termToAst(term: RDF.Term): TermIri | TermLiteral {
  const F = AST_FACTORY;
  switch (term.termType) {
    case 'NamedNode':
      return F.termNamed(F.gen(), term.value);
    case 'Literal':
      if (term.language) {
        return F.termLiteral(F.gen(), term.value, term.language);
      }
      return term.datatype.value === XSD_STRING ?
        F.termLiteral(F.gen(), term.value) :
        F.termLiteral(F.gen(), term.value, F.termNamed(F.gen(), term.datatype.value));
    default:
      throw new Error(`Unsupported term type ${term.termType} in VALUES`);
  }
}

/**
 * A VALUES pattern over the variables of the given rows, in which missing variables are UNDEF.
 * @param rows Rows of variable bindings.
 */
export function valuesPattern(rows: Record<string, RDF.Term>[]): QuerySelect['where']['patterns'][number] {
  const F = AST_FACTORY;
  const variables = [ ...new Set(rows.flatMap(row => Object.keys(row))) ].sort(compareStrings);
  return F.patternValues(
    variables.map(variable => F.termVariable(variable, F.gen())),
    rows.map(row => Object.fromEntries(Object.entries(row).map(([ variable, term ]) => [ variable, termToAst(term) ]))),
    F.gen(),
  );
}

/**
 * The child operations of an operation, without those in expressions such as EXISTS.
 * @param operation An algebra operation.
 */
function childOperations(operation: Algebra.Operation): Algebra.Operation[] {
  const input = (<{ input?: Algebra.Operation | Algebra.Operation[] }> operation).input;
  if (input === undefined) {
    return [];
  }
  return Array.isArray(input) ? input : [ input ];
}

/**
 * All triple patterns of an operation, in query order, including those in OPTIONAL, UNION, and subqueries.
 * @param operation An algebra operation.
 * @param acc The array to add the triple patterns to.
 */
export function collectPatterns(operation: Algebra.Operation, acc: Algebra.Pattern[] = []): Algebra.Pattern[] {
  if (operation.type === Types.BGP) {
    acc.push(...operation.patterns);
  }
  for (const child of childOperations(operation)) {
    collectPatterns(child, acc);
  }
  return acc;
}

/**
 * Variables that are bound in every solution of an operation:
 * those of its triple patterns outside OPTIONAL, MINUS, and UNION, that are projected by the subqueries they are in.
 * @param operation An algebra operation.
 */
export function mandatoryVariables(operation: Algebra.Operation): Set<string> {
  switch (operation.type) {
    case Types.BGP:
      return new Set(operation.patterns.flatMap(pattern => [ pattern.subject, pattern.predicate, pattern.object ])
        .filter(term => term.termType === 'Variable')
        .map(term => term.value));
    case Types.JOIN:
      return new Set(operation.input.flatMap(input => [ ...mandatoryVariables(input) ]));
    case Types.LEFT_JOIN:
    case Types.MINUS:
      return mandatoryVariables(operation.input[0]);
    case Types.PROJECT: {
      const mandatory = mandatoryVariables(operation.input);
      return new Set(operation.variables.map(variable => variable.value).filter(variable => mandatory.has(variable)));
    }
    case Types.FILTER:
    case Types.EXTEND:
    case Types.DISTINCT:
    case Types.REDUCED:
    case Types.ORDER_BY:
    case Types.SLICE:
      return mandatoryVariables(operation.input);
    default:
      return new Set();
  }
}

/**
 * Check if a query projects all its variables.
 * @param ast The syntax tree of a SELECT query.
 */
export function isSelectAll(ast: QuerySelect): boolean {
  return ast.variables[0].type === 'wildcard';
}

/**
 * The names of the projected variables of a query, which are taken from the solutions for SELECT *.
 * @param ast The syntax tree of a SELECT query.
 * @param solutions The solutions of the query.
 */
export function projectedVariables(ast: QuerySelect, solutions: RDF.Bindings[]): string[] {
  if (isSelectAll(ast)) {
    const names = new Set<string>();
    for (const solution of solutions) {
      for (const variable of solution.keys()) {
        names.add(variable.value);
      }
    }
    return [ ...names ].sort();
  }
  return (<Exclude<QuerySelect['variables'][number], { type: 'wildcard' }>[]> ast.variables)
    .map(variable => variable.type === 'term' ? variable.value : variable.variable.value);
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
      for (const triple of collectPatterns(parseQuery(query).algebra)) {
        const terms = [ triple.subject, triple.predicate, triple.object ]
          .map(term => term.termType === 'Variable' ? undefined : term);
        if (terms.every(term => term === undefined)) {
          continue;
        }
        const [ subject, predicate, object ] = terms.map(term => term ? termToString(term) : undefined);
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
          objectKey ??= termToString(object);
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

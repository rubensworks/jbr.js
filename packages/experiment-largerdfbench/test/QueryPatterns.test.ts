import { DataFactory } from 'n3';
import { termToString } from 'rdf-string-ttl';
import {
  AST_FACTORY,
  collectPatterns,
  compareStrings,
  fnv1a,
  generateQuery,
  keep,
  mandatoryVariables,
  parseQuery,
  PatternMatcher,
  projectedVariables,
  termToAst,
  tripleToLine,
  valuesPattern,
} from '../lib/QueryPatterns';
import { ex } from './mocks/Data';

describe('QueryPatterns', () => {
  describe('tripleToLine', () => {
    it('serializes a triple as an N-Triples line', () => {
      expect(tripleToLine(ex('s'), ex('p'), DataFactory.literal('o')))
        .toBe('<http://example.org/s> <http://example.org/p> "o" .\n');
    });
  });

  describe('fnv1a', () => {
    it('produces the FNV-1a hash', () => {
      expect(fnv1a('')).toBe(0x811C9DC5);
      expect(fnv1a('a')).toBe(0xE40C292C);
    });
  });

  describe('keep', () => {
    it('always keeps at rate 1', () => {
      expect(keep('seed', 1, 'a')).toBe(true);
    });

    it('never keeps at rate 0', () => {
      expect(keep('seed', 0, 'a')).toBe(false);
    });

    it('keeps about the given fraction, deterministically', () => {
      const kept = Array.from({ length: 1_000 }, (_, i) => keep('seed', 0.3, 'ds', `<http://example.org/${i}>`))
        .filter(Boolean).length;
      expect(kept).toBeGreaterThan(250);
      expect(kept).toBeLessThan(350);
      expect(keep('seed', 0.3, 'x')).toBe(keep('seed', 0.3, 'x'));
    });
  });

  describe('compareStrings', () => {
    it('compares by code units', () => {
      expect(compareStrings('a', 'b')).toBe(-1);
      expect(compareStrings('b', 'a')).toBe(1);
      expect(compareStrings('a', 'a')).toBe(0);
      expect(compareStrings('Z', 'a')).toBe(-1);
    });
  });

  describe('parseQuery', () => {
    it('parses SELECT queries', () => {
      const { ast, algebra } = parseQuery('PREFIX ex: <http://example.org/> SELECT * WHERE { ?a ex:p ?b }');
      expect(ast.subType).toBe('select');
      expect(collectPatterns(algebra)[0].predicate.equals(ex('p'))).toBe(true);
    });

    it('rejects other queries and updates', () => {
      expect(() => parseQuery('ASK { ?a <ex:p> ?b }')).toThrow('Only SELECT queries are supported');
      expect(() => parseQuery('INSERT DATA { <ex:a> <ex:p> <ex:b> }')).toThrow('Only SELECT queries are supported');
    });
  });

  describe('collectPatterns', () => {
    it('collects patterns from all parts of a query', () => {
      const parsed = parseQuery(`SELECT * WHERE {
        ?a <ex:p1> ?b .
        OPTIONAL { ?b <ex:p2> ?c }
        { ?a <ex:p3> ?d } UNION { ?a <ex:p4> ?d }
        { SELECT * WHERE { ?a <ex:p5> ?e } }
      }`);
      expect(collectPatterns(parsed.algebra).map(pattern => pattern.predicate.value))
        .toEqual([ 'ex:p1', 'ex:p2', 'ex:p3', 'ex:p4', 'ex:p5' ]);
    });

    it('ignores patterns in expressions, and operations without triple patterns', () => {
      expect(collectPatterns(parseQuery('SELECT * WHERE { FILTER(true) }').algebra)).toEqual([]);
      expect(collectPatterns(parseQuery('SELECT * WHERE { FILTER EXISTS { ?a <ex:p> ?b } }').algebra)).toEqual([]);
    });
  });

  describe('mandatoryVariables', () => {
    it('excludes variables in OPTIONAL and UNION, and hidden by subqueries', () => {
      const parsed = parseQuery(`SELECT * WHERE {
        ?a <ex:p1> ?b .
        { ?b <ex:p6> ?f }
        OPTIONAL { ?b <ex:p2> ?c }
        { ?a <ex:p3> ?d } UNION { ?a <ex:p4> ?d }
        { SELECT * WHERE { ?a <ex:p5> ?e } }
        { SELECT ?a WHERE { ?a <ex:p7> ?g } }
      }`);
      expect([ ...mandatoryVariables(parsed.algebra) ].sort()).toEqual([ 'a', 'b', 'e', 'f' ]);
    });

    it('excludes the right side of MINUS, and looks through filters, binds, and solution modifiers', () => {
      const parsed = parseQuery(`SELECT REDUCED * WHERE {
        ?a <ex:p1> ?b .
        MINUS { ?a <ex:p2> ?c }
        FILTER(?b)
        BIND(?b AS ?d)
      } ORDER BY ?a LIMIT 1`);
      expect([ ...mandatoryVariables(parsed.algebra) ].sort()).toEqual([ 'a', 'b' ]);
      expect([ ...mandatoryVariables(parseQuery('SELECT DISTINCT ?a WHERE { ?a <ex:p> ?b }').algebra) ])
        .toEqual([ 'a' ]);
    });

    it('is empty without patterns', () => {
      expect(mandatoryVariables(parseQuery('SELECT * WHERE { VALUES ?a { <ex:a> } }').algebra)).toEqual(new Set());
    });
  });

  describe('projectedVariables', () => {
    it('returns explicitly projected variables', () => {
      expect(projectedVariables(parseQuery('SELECT ?b ?a WHERE { ?a <ex:p> ?b }').ast, [])).toEqual([ 'b', 'a' ]);
    });

    it('returns the variables of projected expressions', () => {
      expect(projectedVariables(parseQuery('SELECT ?a (STR(?b) AS ?c) WHERE { ?a <ex:p> ?b }').ast, []))
        .toEqual([ 'a', 'c' ]);
    });

    it('returns the variables of the solutions for SELECT *', () => {
      const solutions = <any[]> [
        { keys: () => [ DataFactory.variable('b') ]},
        { keys: () => [ DataFactory.variable('a') ]},
      ];
      expect(projectedVariables(parseQuery('SELECT * WHERE { ?a <ex:p> ?b }').ast, solutions)).toEqual([ 'a', 'b' ]);
    });
  });

  describe('termToAst', () => {
    it('converts IRIs and literals', () => {
      const ast = parseQuery('SELECT * WHERE { ?a <ex:p> ?b }').ast;
      ast.where.patterns.push(AST_FACTORY.patternValues([ AST_FACTORY.termVariable('a', AST_FACTORY.gen()) ], [
        ex('a'),
        DataFactory.literal('a'),
        DataFactory.literal('a', 'en'),
        DataFactory.literal('1', DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#integer')),
      ].map(term => ({ a: termToAst(term) })), AST_FACTORY.gen()));
      expect(generateQuery(ast).replaceAll(/\s+/gu, ' ')).toBe('SELECT * WHERE { ?a <ex:p> ?b . VALUES ?a { ' +
        '<http://example.org/a> "a" "a"@en "1"^^<http://www.w3.org/2001/XMLSchema#integer> } }');
    });

    it('rejects blank nodes, which VALUES does not allow', () => {
      expect(() => termToAst(DataFactory.blankNode('b'))).toThrow('Unsupported term type BlankNode in VALUES');
    });
  });

  describe('valuesPattern', () => {
    it('creates a VALUES pattern with UNDEF for missing variables', () => {
      const ast = parseQuery('SELECT * WHERE { }').ast;
      ast.where.patterns.push(valuesPattern([{ b: ex('b') }, { a: ex('a') }]));
      expect(generateQuery(ast).replaceAll(/\s+/gu, ' '))
        .toBe('SELECT * WHERE { VALUES( ?a ?b ){ ( UNDEF <http://example.org/b> ) ( <http://example.org/a> UNDEF ) } }');
    });
  });

  describe('PatternMatcher', () => {
    const matcher = new PatternMatcher([
      'SELECT * WHERE { ?a <ex:p> ?b . ?a <ex:p> "x" . <ex:s> ?p ?o . ?s ?p ?o }',
      'SELECT * WHERE { ?c <ex:p> ?d . <ex:s> <ex:q> ?e . ?f <ex:p> "z" }',
    ]);

    it('deduplicates patterns, and excludes open patterns', () => {
      expect(matcher.patterns.map(pattern => pattern.key)).toEqual([
        '? <ex:p> ?',
        '? <ex:p> "x"',
        '<ex:s> ? ?',
        '<ex:s> <ex:q> ?',
        '? <ex:p> "z"',
      ]);
      expect(matcher.patterns[1].terms.map(term => term && termToString(term))).toEqual([ undefined, '<ex:p>', '"x"' ]);
    });

    it('matches triples on their constant terms', () => {
      expect(matcher.match('<ex:a>', '<ex:p>', DataFactory.literal('x'))).toEqual([ 0, 1 ]);
      expect(matcher.match('<ex:a>', '<ex:p>', DataFactory.literal('y'))).toEqual([ 0 ]);
      expect(matcher.match('<ex:s>', '<ex:q>', DataFactory.literal('y'))).toEqual([ 3, 2 ]);
      expect(matcher.match('<ex:a>', '<ex:q>', DataFactory.literal('y'))).toEqual([]);
      expect(matcher.match('<ex:a>', '<ex:other>', DataFactory.literal('y'))).toEqual([]);
      expect(matcher.match('<ex:a>', '<ex:p>', DataFactory.literal('z'))).toEqual([ 0, 4 ]);
    });
  });
});

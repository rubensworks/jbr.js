import { DataFactory } from 'n3';
import {
  collectPatterns,
  compareStrings,
  fnv1a,
  isVariable,
  keep,
  mandatoryVariables,
  parseQuery,
  PatternMatcher,
  projectedVariables,
  termKey,
  tripleToLine,
} from '../lib/QueryPatterns';
import { ex } from './mocks/Data';

describe('QueryPatterns', () => {
  describe('tripleToLine', () => {
    it('serializes a triple as an N-Triples line', () => {
      expect(tripleToLine(ex('s'), ex('p'), DataFactory.literal('o')))
        .toBe('<http://example.org/s> <http://example.org/p> "o" .\n');
    });
  });

  describe('termKey', () => {
    it('handles named nodes', () => {
      expect(termKey(ex('a'))).toBe('<http://example.org/a>');
    });

    it('handles blank nodes', () => {
      expect(termKey(DataFactory.blankNode('b'))).toBe('_:b');
    });

    it('handles simple literals, also as xsd:string', () => {
      expect(termKey(DataFactory.literal('a'))).toBe('"a"');
      expect(termKey(DataFactory.literal('a', DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#string'))))
        .toBe('"a"');
    });

    it('handles language-tagged literals', () => {
      expect(termKey(DataFactory.literal('a', 'en'))).toBe('"a"@en');
    });

    it('handles typed literals', () => {
      expect(termKey(DataFactory.literal('1', ex('type')))).toBe('"1"^^http://example.org/type');
    });

    it('throws on other terms', () => {
      expect(() => termKey(DataFactory.variable('v'))).toThrow('Unsupported term type Variable');
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
      expect(parseQuery('SELECT * WHERE { ?a <ex:p> ?b }').queryType).toBe('SELECT');
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
      expect(collectPatterns(parsed.where).map(pattern => (<any> pattern.predicate).value))
        .toEqual([ 'ex:p1', 'ex:p2', 'ex:p3', 'ex:p4', 'ex:p5' ]);
    });

    it('ignores patterns without triple patterns', () => {
      expect(collectPatterns(undefined)).toEqual([]);
      expect(collectPatterns(parseQuery('SELECT * WHERE { FILTER(true) }').where)).toEqual([]);
    });
  });

  describe('isVariable', () => {
    it('distinguishes variables', () => {
      expect(isVariable(DataFactory.variable('v'))).toBe(true);
      expect(isVariable(ex('a'))).toBe(false);
      expect(isVariable(<any> { type: 'path', pathType: '/', items: []})).toBe(false);
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
      expect([ ...mandatoryVariables(parsed.where) ].sort()).toEqual([ 'a', 'b', 'e', 'f' ]);
    });

    it('is empty without patterns', () => {
      expect(mandatoryVariables(undefined)).toEqual(new Set());
    });
  });

  describe('projectedVariables', () => {
    it('returns explicitly projected variables', () => {
      expect(projectedVariables(parseQuery('SELECT ?b ?a WHERE { ?a <ex:p> ?b }'), [])).toEqual([ 'b', 'a' ]);
    });

    it('returns the variables of projected expressions', () => {
      expect(projectedVariables(parseQuery('SELECT ?a (STR(?b) AS ?c) WHERE { ?a <ex:p> ?b }'), []))
        .toEqual([ 'a', 'c' ]);
    });

    it('returns the variables of the solutions for SELECT *', () => {
      const solutions = <any[]> [
        { keys: () => [ DataFactory.variable('b') ]},
        { keys: () => [ DataFactory.variable('a') ]},
      ];
      expect(projectedVariables(parseQuery('SELECT * WHERE { ?a <ex:p> ?b }'), solutions)).toEqual([ 'a', 'b' ]);
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
      expect(matcher.patterns[1].terms.map(term => term && termKey(term))).toEqual([ undefined, '<ex:p>', '"x"' ]);
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

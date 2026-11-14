import { EventEmitter } from 'node:events';
import * as os from 'node:os';
import * as Path from 'node:path';
import { QueryEngine } from '@comunica/query-sparql-rdfjs';
import type * as RDF from '@rdfjs/types';
import * as fs from 'fs-extra';
import { DataFactory } from 'n3';
import type { ISparqlJsonResults } from '../lib/LineageComputer';
import { compareOrder, evaluate, jsonTermToRdf, LineageComputer, rdfTermToJson } from '../lib/LineageComputer';
import { createDocument, createStore, EX, ex, triple } from './mocks/Data';

const XSD_INTEGER = DataFactory.namedNode('http://www.w3.org/2001/XMLSchema#integer');
const PREFIX = `PREFIX ex: <${EX}>\n`;

const quadsA = [
  triple(ex('alice'), ex('name'), DataFactory.literal('Alice')),
  triple(ex('alice'), ex('knows'), ex('bob')),
  triple(ex('alice'), ex('note'), DataFactory.literal('a')),
  triple(ex('carol'), ex('name'), DataFactory.literal('Carol')),
  triple(ex('carol'), ex('knows'), ex('dave')),
  triple(ex('erin'), ex('name'), DataFactory.literal('Erin')),
];
const quadsB = [
  triple(ex('alice'), ex('age'), DataFactory.literal('25', XSD_INTEGER)),
  triple(ex('bob'), ex('age'), DataFactory.literal('30', XSD_INTEGER)),
  triple(ex('dave'), ex('age'), DataFactory.literal('40', XSD_INTEGER)),
];

function bindings(entries: Record<string, RDF.Term>): RDF.Bindings {
  return <any> {
    has: (name: string) => name in entries,
    get: (name: string) => entries[name],
  };
}

describe('LineageComputer', () => {
  let directory: string;
  let logs: string[];
  let computer: LineageComputer;
  let publishedResults: Record<string, ISparqlJsonResults | undefined>;

  beforeEach(async() => {
    directory = await fs.mkdtemp(Path.join(os.tmpdir(), 'jbr-largerdfbench-lineage-'));
    logs = [];
    publishedResults = {
      Q1: {
        head: { vars: [ 'p', 'name' ]},
        results: {
          bindings: [
            { p: { type: 'uri', value: `${EX}alice` }, name: { type: 'literal', value: 'Alice' }},
            // A defect: the literal differs from the data
            { p: { type: 'uri', value: `${EX}carol` }, name: { type: 'literal', value: 'Car0l' }},
            { p: { type: 'uri', value: `${EX}nobody` }, name: { type: 'literal', value: 'Nobody' }},
            { name: { type: 'literal', value: 'Unknown' }},
            { p: { type: 'uri', value: `${EX}alice` }, name: { type: 'literal', value: 'Alice' }},
          ],
        },
      },
    };
    computer = new LineageComputer({
      engine: new QueryEngine(),
      engineContext: { sources: [ createStore(quadsA), createStore(quadsB) ]},
      documents: { A: createDocument(quadsA), B: createDocument(quadsB) },
      queries: {
        Q1: `${PREFIX}SELECT ?p ?name WHERE { ?p ex:name ?name . ?p ex:knows ?q . ?q ex:age ?age }`,
        Q2: `${PREFIX}SELECT ?p ?age WHERE { ?p ex:name ?n OPTIONAL { ?p ex:age ?age } }`,
        Q3: `${PREFIX}SELECT DISTINCT ?p WHERE { ?p ex:name ?n . ?p ?any ?o } ORDER BY DESC(?p) LIMIT 2`,
        Q4: `${PREFIX}SELECT ?p ?name ?age WHERE { ?p ex:name ?name OPTIONAL { ?p ex:age ?age } } LIMIT 2`,
        Q5: `${PREFIX}SELECT ?o WHERE { ?p ex:note ?o FILTER(STR(?o) = "a") }`,
        Q6: `${PREFIX}SELECT ?n WHERE { ?p ex:name ?n . ?p ?x ?y }`,
      },
      evaluationQueries: {
        Q5: `${PREFIX}SELECT ?o WHERE { ?p ex:note "a" BIND("a" AS ?o) }`,
      },
      publishedResults,
      limitCandidates: {
        Q4: { variable: 'p', predicate: `${EX}name`, batchSize: 1 },
      },
      timeoutSeconds: 60,
      lineageDirectory: Path.join(directory, 'lineage'),
      resultsDirectory: Path.join(directory, 'results'),
      log: (message: string) => logs.push(message),
    });
  });

  afterEach(async() => {
    await fs.remove(directory);
  });

  const lineage = (id: string, ds: string): Promise<string> =>
    fs.readFile(Path.join(directory, 'lineage', `${id}.${ds}.nt`), 'utf8');
  const results = async(id: string): Promise<ISparqlJsonResults> =>
    JSON.parse(await fs.readFile(Path.join(directory, 'results', `${id}.srj`), 'utf8'));

  describe('computeAll', () => {
    it('computes the lineage of all queries', async() => {
      const stats = await computer.computeAll();
      expect(Object.keys(stats)).toEqual([ 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6' ]);
      expect(JSON.parse(await fs.readFile(Path.join(directory, 'lineage', 'stats.json'), 'utf8'))).toEqual(stats);

      // Q1: published results, with unprojected variables recovered, and defects retried without literals
      expect(stats.Q1).toMatchObject({
        expectedRows: 4,
        stillUnmatchedRows: 2,
        solutions: 2,
        triples: { A: 4, B: 2 },
      });
      expect(stats.Q1.unmatchedRows).toEqual([
        { p: `<${EX}carol>`, name: '"Car0l"' },
        { p: `<${EX}nobody>`, name: '"Nobody"' },
        { name: '"Unknown"' },
      ]);
      expect((await lineage('Q1', 'A')).split('\n').filter(Boolean).sort()).toEqual([
        `<${EX}alice> <${EX}knows> <${EX}bob> .`,
        `<${EX}alice> <${EX}name> "Alice" .`,
        `<${EX}carol> <${EX}knows> <${EX}dave> .`,
        `<${EX}carol> <${EX}name> "Carol" .`,
      ]);
      expect((await lineage('Q1', 'B')).split('\n').filter(Boolean).sort()).toEqual([
        `<${EX}bob> <${EX}age> "30"^^<http://www.w3.org/2001/XMLSchema#integer> .`,
        `<${EX}dave> <${EX}age> "40"^^<http://www.w3.org/2001/XMLSchema#integer> .`,
      ]);
      expect(logs).toContain(
        '  Q1: 3 expected rows match no solution, 2 retried with their literals unbound, 2 still without solution',
      );

      // Q2: no published results and no LIMIT, so all solutions, including an OPTIONAL
      expect((await results('Q2')).results.bindings).toHaveLength(3);
      expect(stats.Q2.triples).toEqual({ A: 3, B: 1 });

      // Q3: ORDER BY and DISTINCT
      await expect(results('Q3')).resolves.toEqual({
        head: { vars: [ 'p' ]},
        results: { bindings: [{ p: { type: 'uri', value: `${EX}erin` }}, { p: { type: 'uri', value: `${EX}carol` }}]},
      });

      // Q4: evaluated on batches of candidates, until enough distinct rows are found
      expect((await results('Q4')).results.bindings).toEqual([
        {
          p: { type: 'uri', value: `${EX}alice` },
          name: { type: 'literal', value: 'Alice' },
          age: { type: 'literal', value: '25', datatype: XSD_INTEGER.value },
        },
        { p: { type: 'uri', value: `${EX}carol` }, name: { type: 'literal', value: 'Carol' }},
      ]);
      expect(logs).toContain('  Q4: 2 distinct rows from the first 2 of 3 candidates for ?p');

      // Q5: evaluated with its equivalent formulation
      await expect(lineage('Q5', 'A')).resolves.toBe(`<${EX}alice> <${EX}note> "a" .\n`);
      await expect(lineage('Q5', 'B')).resolves.toBe('');

      // Q6: duplicate rows are kept
      expect((await results('Q6')).results.bindings.map(row => row.n.value))
        .toEqual([ 'Alice', 'Alice', 'Alice', 'Alice', 'Carol', 'Carol', 'Erin' ]);
    });
  });

  describe('computeExpectedResults', () => {
    it('uses all candidates without a LIMIT', async() => {
      computer = new LineageComputer({
        ...computer.options,
        queries: { Q: `${PREFIX}SELECT ?p WHERE { ?p ex:name ?n }` },
        limitCandidates: { Q: { variable: 'p', predicate: `${EX}name`, batchSize: 2 }},
      });
      await fs.ensureDir(Path.join(directory, 'results'));
      const expected = await computer.computeExpectedResults('Q');
      expect(expected.results.bindings.map(row => row.p.value)).toEqual([ `${EX}alice`, `${EX}carol`, `${EX}erin` ]);
      expect(logs).toContain('  Q: 3 distinct rows from the first 3 of 3 candidates for ?p');
    });

    it('sorts solutions on their values', async() => {
      const engine = {
        async queryBindings() {
          const stream = Object.assign(new EventEmitter(), { destroy: jest.fn() });
          setImmediate(() => {
            for (const name of [ 'c', 'b', 'a' ]) {
              stream.emit('data', bindings({ a: ex(name) }));
            }
            stream.emit('end');
          });
          return stream;
        },
      };
      computer = new LineageComputer({ ...computer.options, engine, queries: { Q: `${PREFIX}SELECT ?a WHERE { ?a ex:p ?b }` }});
      await fs.ensureDir(Path.join(directory, 'results'));
      const expected = await computer.computeExpectedResults('Q');
      expect(expected.results.bindings.map(row => row.a.value)).toEqual([ `${EX}a`, `${EX}b`, `${EX}c` ]);
    });
  });

  describe('lineageQuery', () => {
    it('joins the rows first on the mandatory variables, and last on all variables', () => {
      const query = LineageComputer.lineageQuery(
        `${PREFIX}SELECT DISTINCT ?p WHERE { ?p ex:name ?n OPTIONAL { ?p ex:age ?age } } ORDER BY ?p LIMIT 1 OFFSET 1`,
        [{ p: ex('a'), age: DataFactory.literal('1') }, { p: ex('a') }, { age: DataFactory.literal('2') }],
      );
      expect(query.replaceAll(/\s+/gu, ' ')).toBe(`PREFIX ex: <${EX}> SELECT * WHERE { VALUES ?p { ex:a } ?p ex:name ?n. OPTIONAL { ?p ex:age ?age. } VALUES (?p ?age) { (ex:a "1") (ex:a UNDEF) (UNDEF "2") } }`);
    });

    it('does not join first if no mandatory variables are bound', () => {
      const query = LineageComputer.lineageQuery(`${PREFIX}SELECT ?o WHERE { { ?s ex:a ?o } UNION { ?s ex:b ?o } }`, [{ o: ex('a') }]);
      expect(query.replaceAll(/\s+/gu, ' ')).toBe(`PREFIX ex: <${EX}> SELECT * WHERE { { ?s ex:a ?o. } UNION { ?s ex:b ?o. } VALUES ?o { ex:a } }`);
    });
  });

  describe('evaluate', () => {
    it('fails on errors', async() => {
      const stream = Object.assign(new EventEmitter(), { destroy: jest.fn() });
      const promise = evaluate({ queryBindings: async() => stream }, 'Q', {}, 60);
      await new Promise(resolve => setImmediate(resolve));
      stream.emit('error', new Error('query error'));
      await expect(promise).rejects.toThrow('query error');
    });

    it('fails on timeouts, and destroys the stream', async() => {
      const stream = Object.assign(new EventEmitter(), { destroy: jest.fn() });
      await expect(evaluate({ queryBindings: async() => stream }, 'Q', {}, 0.01)).rejects
        .toThrow('Query timed out after 0.01 seconds');
      expect(stream.destroy).toHaveBeenCalledTimes(1);
    });
  });

  describe('compareOrder', () => {
    const order = (descending = false): any[] => [{ expression: DataFactory.variable('a'), descending }];

    it('only supports variables', () => {
      expect(() => compareOrder(bindings({}), bindings({}), <any[]> [{ expression: { type: 'operation' }}]))
        .toThrow('Only variables are supported in ORDER BY of queries without published results');
    });

    it('orders unbound values first', () => {
      expect(compareOrder(bindings({}), bindings({ a: ex('a') }), order())).toBeLessThan(0);
      expect(compareOrder(bindings({ a: ex('a') }), bindings({}), order())).toBeGreaterThan(0);
      expect(compareOrder(bindings({}), bindings({}), order())).toBe(0);
    });

    it('orders blank nodes before named nodes before literals', () => {
      expect(compareOrder(bindings({ a: DataFactory.blankNode('b') }), bindings({ a: ex('a') }), order()))
        .toBeLessThan(0);
      expect(compareOrder(bindings({ a: DataFactory.literal('a') }), bindings({ a: ex('a') }), order()))
        .toBeGreaterThan(0);
    });

    it('orders numeric literals numerically, and other terms by their value', () => {
      const nine = bindings({ a: DataFactory.literal('9') });
      const ten = bindings({ a: DataFactory.literal('10') });
      expect(compareOrder(nine, ten, order())).toBeLessThan(0);
      expect(compareOrder(bindings({ a: ex('b') }), bindings({ a: ex('a') }), order())).toBeGreaterThan(0);
      expect(compareOrder(bindings({ a: ex('a') }), bindings({ a: ex('b') }), order())).toBeLessThan(0);
      expect(compareOrder(bindings({ a: ex('a') }), bindings({ a: ex('a') }), order())).toBe(0);
    });

    it('supports descending order', () => {
      expect(compareOrder(bindings({ a: ex('a') }), bindings({ a: ex('b') }), order(true))).toBeGreaterThan(0);
    });
  });

  describe('term conversion', () => {
    it('converts JSON terms to RDF terms', () => {
      expect(jsonTermToRdf({ type: 'uri', value: 'ex:a' })).toEqual(DataFactory.namedNode('ex:a'));
      expect(jsonTermToRdf({ type: 'literal', value: 'a' })).toEqual(DataFactory.literal('a'));
      expect(jsonTermToRdf({ type: 'literal', value: 'a', 'xml:lang': 'en' })).toEqual(DataFactory.literal('a', 'en'));
      expect(jsonTermToRdf({ type: 'typed-literal', value: '1', datatype: XSD_INTEGER.value }))
        .toEqual(DataFactory.literal('1', XSD_INTEGER));
      expect(() => jsonTermToRdf({ type: 'bnode', value: 'b' })).toThrow('Unsupported result term type bnode');
    });

    it('converts RDF terms to JSON terms', () => {
      expect(rdfTermToJson(ex('a'))).toEqual({ type: 'uri', value: `${EX}a` });
      expect(rdfTermToJson(DataFactory.blankNode('b'))).toEqual({ type: 'bnode', value: 'b' });
      expect(rdfTermToJson(DataFactory.literal('a'))).toEqual({ type: 'literal', value: 'a' });
      expect(rdfTermToJson(DataFactory.literal('a', 'en'))).toEqual({ type: 'literal', value: 'a', 'xml:lang': 'en' });
      expect(rdfTermToJson(DataFactory.literal('1', XSD_INTEGER)))
        .toEqual({ type: 'literal', value: '1', datatype: XSD_INTEGER.value });
      expect(() => rdfTermToJson(DataFactory.variable('v'))).toThrow('Unsupported binding term type Variable');
    });
  });
});

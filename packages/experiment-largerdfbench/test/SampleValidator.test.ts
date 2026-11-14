import * as os from 'node:os';
import * as Path from 'node:path';
import { QueryEngine } from '@comunica/query-sparql-rdfjs';
import * as fs from 'fs-extra';
import { DataFactory } from 'n3';
import { bagDifference, countKeys, jsonTermKey, SampleValidator } from '../lib/SampleValidator';
import { createStore, EX, ex, triple } from './mocks/Data';

const PREFIX = `PREFIX ex: <${EX}>\n`;
const full = [
  triple(ex('alice'), ex('name'), DataFactory.literal('Alice')),
  triple(ex('carol'), ex('name'), DataFactory.literal('Carol')),
  triple(ex('bob'), ex('age'), DataFactory.literal('30')),
  triple(ex('dave'), ex('age'), DataFactory.literal('40')),
];
// The sample lacks the age of dave.
const sample = full.slice(0, 3);

describe('SampleValidator', () => {
  let directory: string;
  let logs: string[];
  let validator: SampleValidator;

  beforeEach(async() => {
    directory = await fs.mkdtemp(Path.join(os.tmpdir(), 'jbr-largerdfbench-validator-'));
    await fs.ensureDir(Path.join(directory, 'results'));
    await fs.writeFile(Path.join(directory, 'results', 'Q3.srj'), JSON.stringify({
      head: { vars: [ 'p' ]},
      results: { bindings: [{ p: { type: 'uri', value: `${EX}alice` }}]},
    }));
    logs = [];
    const engine = new QueryEngine();
    validator = new SampleValidator({
      sampleEngine: engine,
      sampleContext: { sources: [ createStore(sample) ]},
      fullEngine: engine,
      fullContext: { sources: [ createStore(full) ]},
      queries: {
        Q1: `${PREFIX}SELECT ?p ?n WHERE { ?p ex:name ?n }`,
        Q2: `${PREFIX}SELECT ?a WHERE { ?p ex:age ?a }`,
        Q3: `${PREFIX}SELECT ?p WHERE { ?p ex:name ?n } LIMIT 1`,
        Q4: `${PREFIX}SELECT ?p WHERE { ?p ex:name ?n }`,
        Q5: `${PREFIX}SELECT * WHERE { ?p ex:name ?n OPTIONAL { ?p ex:age ?a } }`,
        Q6: `${PREFIX}SELECT ?p ?a WHERE { ?p ex:name ?n OPTIONAL { ?p ex:age ?a } }`,
      },
      evaluationQueries: {
        Q4: 'SELECT ?p WHERE { invalid',
      },
      publishedResults: {
        Q1: {
          head: { vars: [ 'p', 'n' ]},
          results: {
            bindings: [
              { p: { type: 'uri', value: `${EX}alice` }, n: { type: 'literal', value: 'Alice' }},
              { p: { type: 'uri', value: `${EX}carol` }, n: { type: 'literal', value: 'Car0l' }},
            ],
          },
        },
        Q2: {
          head: { vars: [ 'a' ]},
          results: { bindings: []},
        },
        Q6: {
          head: { vars: [ 'p', 'a' ]},
          results: { bindings: [{ p: { type: 'uri', value: `${EX}alice` }}, { p: { type: 'uri', value: `${EX}carol` }}]},
        },
      },
      resultsDirectory: Path.join(directory, 'results'),
      sampleTimeoutSeconds: 60,
      fullTimeoutSeconds: 60,
      log: (message: string) => logs.push(message),
    });
  });

  afterEach(async() => {
    await fs.remove(directory);
  });

  it('validates all queries', async() => {
    const report = await validator.validateAll();

    // Q1: same results, and a defect in the published results
    expect(report.Q1).toMatchObject({ ok: true, results: 2, fullResults: 2 });
    expect(report.Q1.published).toEqual({
      results: 2,
      onlyInSample: { count: 1, examples: [[ `<${EX}carol>`, '"Carol"' ]]},
      onlyInPublished: { count: 1, examples: [[ `<${EX}carol>`, '"Car0l"' ]]},
    });
    expect(JSON.parse(await fs.readFile(Path.join(directory, 'results', 'Q1.srj'), 'utf8'))).toEqual({
      head: { vars: [ 'p', 'n' ]},
      results: {
        bindings: [
          { p: { type: 'uri', value: `${EX}alice` }, n: { type: 'literal', value: 'Alice' }},
          { p: { type: 'uri', value: `${EX}carol` }, n: { type: 'literal', value: 'Carol' }},
        ],
      },
    });

    // Q2: the sample lacks a result
    expect(report.Q2).toMatchObject({
      ok: false,
      results: 1,
      fullResults: 2,
      onlyInSample: { count: 0, examples: []},
      onlyInFull: { count: 1, examples: [[ '"40"' ]]},
    });

    // Q3: a LIMIT query, compared on its number of results
    expect(report.Q3).toEqual({ ok: true, results: 1, limit: 1 });

    // Q4: an error
    expect(report.Q4.ok).toBe(false);
    expect(report.Q4.error).toContain('unexpected character');

    // Q5: SELECT *, with unbound variables
    expect(report.Q5).toMatchObject({ ok: true, results: 2 });
    expect(JSON.parse(await fs.readFile(Path.join(directory, 'results', 'Q5.srj'), 'utf8')).head.vars)
      .toEqual([ 'n', 'p' ]);

    expect(logs).toEqual([
      `  Q1: OK, 2 results over the sample, 2 over the full data, published 2 (1 rows only in sample, 1 only in published)`,
      `  Q2: FAILED, 1 results over the sample, 2 over the full data, published 0 (1 rows only in sample, 0 only in published)`,
      `  Q3: OK, 1 results over the sample, LIMIT 1`,
      expect.stringContaining('  Q4: failed: '),
      `  Q5: OK, 2 results over the sample, 2 over the full data`,
      `  Q6: OK, 2 results over the sample, 2 over the full data, published 2 (0 rows only in sample, 0 only in published)`,
    ]);
  });

  describe('jsonTermKey', () => {
    it('produces the same keys as for RDF terms', () => {
      expect(jsonTermKey({ type: 'uri', value: 'ex:a' })).toBe('<ex:a>');
      expect(jsonTermKey({ type: 'bnode', value: 'b' })).toBe('_:b');
      expect(jsonTermKey({ type: 'literal', value: 'a' })).toBe('"a"');
      expect(jsonTermKey({ type: 'literal', value: 'a', 'xml:lang': 'en' })).toBe('"a"@en');
      expect(jsonTermKey({ type: 'literal', value: 'a', datatype: 'http://www.w3.org/2001/XMLSchema#string' }))
        .toBe('"a"');
      expect(jsonTermKey({ type: 'typed-literal', value: '1', datatype: 'ex:t' })).toBe('"1"^^ex:t');
    });
  });

  describe('bagDifference', () => {
    it('counts all differing rows, with up to 3 examples', () => {
      const a = countKeys([ '["a"]', '["b"]', '["c"]', '["d"]', '["d"]', '["e"]' ]);
      const b = countKeys([ '["a"]', '["d"]' ]);
      expect(bagDifference(a, b)).toEqual({ count: 4, examples: [[ 'b' ], [ 'c' ], [ 'd' ]]});
    });
  });
});

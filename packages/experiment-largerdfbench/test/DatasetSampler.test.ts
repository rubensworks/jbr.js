import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as Path from 'node:path';
import * as fs from 'fs-extra';
import { DataFactory } from 'n3';
import { DatasetSampler } from '../lib/DatasetSampler';
import { createDocument, EX, ex, triple } from './mocks/Data';

const PREFIX = `PREFIX ex: <${EX}>\n`;
const quadsA = [
  triple(ex('alice'), ex('name'), DataFactory.literal('Alice')),
  triple(ex('alice'), ex('knows'), ex('bob')),
  triple(ex('alice'), ex('note'), DataFactory.literal('a')),
  triple(ex('alice'), ex('other'), DataFactory.literal('o')),
  triple(ex('carol'), ex('name'), DataFactory.literal('Carol')),
];
const quadsB = [
  triple(ex('bob'), ex('age'), DataFactory.literal('30')),
  triple(ex('dave'), ex('age'), DataFactory.literal('40')),
  triple(ex('dave'), ex('note'), DataFactory.literal('x')),
];
const queries = [
  `${PREFIX}SELECT * WHERE { ?p ex:name ?n . ?p ex:knows ?q . ?q ex:age ?a }`,
  `${PREFIX}SELECT * WHERE { ?x ex:note ?y }`,
];

describe('DatasetSampler', () => {
  let directory: string;
  let logs: string[];

  beforeEach(async() => {
    directory = await fs.mkdtemp(Path.join(os.tmpdir(), 'jbr-largerdfbench-sampler-'));
    await fs.ensureDir(Path.join(directory, 'lineage'));
    await fs.writeFile(Path.join(directory, 'lineage', 'Q1.A.nt'), `<${EX}alice> <${EX}name> "Alice" .\n`);
    await fs.writeFile(Path.join(directory, 'lineage', 'Q1.B.nt'), `<${EX}bob> <${EX}age> "30" .\n`);
    await fs.writeFile(Path.join(directory, 'lineage', 'stats.json'), '{}');
    logs = [];
  });

  afterEach(async() => {
    await fs.remove(directory);
  });

  function createSampler(options: Partial<DatasetSampler['options']> = {}): DatasetSampler {
    return new DatasetSampler({
      documents: { A: createDocument(quadsA), B: createDocument(quadsB) },
      queries,
      subjectRates: { B: 0 },
      otherTriplesRate: 0,
      seed: 'seed',
      lineageDirectory: Path.join(directory, 'lineage'),
      outputDirectory: Path.join(directory, 'datasets'),
      log: (message: string) => logs.push(message),
      pageSize: 2,
      ...options,
    });
  }

  const dataset = (ds: string): Promise<string> => fs.readFile(Path.join(directory, 'datasets', `${ds}.nt`), 'utf8');

  it('samples subjects, and adds the lineage and witnesses', async() => {
    const { datasets, patterns } = await createSampler().sampleAll();

    await expect(dataset('A')).resolves.toBe([
      `<${EX}alice> <${EX}knows> <${EX}bob> .\n`,
      `<${EX}alice> <${EX}name> "Alice" .\n`,
      `<${EX}alice> <${EX}note> "a" .\n`,
      `<${EX}carol> <${EX}name> "Carol" .\n`,
    ].join(''));
    expect(datasets.A).toEqual({
      subjectRate: 1,
      triples: 5,
      subjects: 2,
      matchingInFull: 4,
      sampledSubjects: 2,
      matching: 4,
      other: 0,
      lineage: 0,
      witnesses: 0,
      sampleTriples: 4,
      sha256: createHash('sha256').update(await dataset('A')).digest('hex'),
    });

    // Nothing of B is sampled, so it only has the lineage, and a witness for the note pattern
    await expect(dataset('B')).resolves.toBe([
      `<${EX}bob> <${EX}age> "30" .\n`,
      `<${EX}dave> <${EX}note> "x" .\n`,
    ].join(''));
    expect(datasets.B).toMatchObject({
      subjectRate: 0,
      subjects: 2,
      matchingInFull: 3,
      sampledSubjects: 0,
      matching: 0,
      lineage: 1,
      witnesses: 1,
      sampleTriples: 2,
    });

    expect(patterns).toEqual([
      { pattern: `? <${EX}age> ?`, full: { B: 2 }, sample: { B: 1 }},
      { pattern: `? <${EX}name> ?`, full: { A: 2 }, sample: { A: 2 }},
      { pattern: `? <${EX}knows> ?`, full: { A: 1 }, sample: { A: 1 }},
      { pattern: `? <${EX}note> ?`, full: { A: 1, B: 1 }, sample: { A: 1, B: 1 }},
    ]);
    expect(logs).toEqual([ '  A: 4 of 5 triples', '  B: 2 of 3 triples' ]);
  });

  it('keeps other triples at their rate, with the default page size', async() => {
    const { datasets } = await createSampler({ otherTriplesRate: 1, pageSize: undefined }).sampleAll();
    expect(datasets.A.other).toBe(1);
    await expect(dataset('A')).resolves.toContain(`<${EX}alice> <${EX}other> "o" .\n`);
  });

  it('does not support sampling blank node subjects', async() => {
    const sampler = createSampler({
      documents: { B: createDocument([ triple(DataFactory.blankNode('b'), ex('age'), DataFactory.literal('1')) ]) },
    });
    await expect(sampler.sampleAll()).rejects
      .toThrow('Dataset B has blank node subjects, which is only supported with a subject rate of 1');
  });
});

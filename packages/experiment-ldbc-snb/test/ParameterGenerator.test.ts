import * as os from 'node:os';
import * as Path from 'node:path';
import * as fs from 'fs-extra';
import {
  generateMessageParameters,
  generatePersonParameters,
  personIdToIri,
  readSubstitutionParameterColumn,
  repeatSubstitutionParameterRows,
  writeCsvColumn,
} from '../lib/ParameterGenerator';

const PREFIXES = `@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix sn: <http://www.ldbc.eu/ldbc_socialnet/1.0/data/> .
@prefix snvoc: <http://www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/> .
`;

describe('ParameterGenerator', () => {
  let dir: string;
  beforeEach(async() => {
    dir = await fs.mkdtemp(Path.join(os.tmpdir(), 'jbr-ldbc-snb-'));
  });

  afterEach(async() => {
    await fs.remove(dir);
  });

  async function write(name: string, contents: string): Promise<string> {
    const path = Path.join(dir, name);
    await fs.writeFile(path, contents, 'utf8');
    return path;
  }

  describe('personIdToIri', () => {
    it('pads ids to 20 digits', () => {
      expect(personIdToIri('933')).toBe('http://www.ldbc.eu/ldbc_socialnet/1.0/data/pers00000000000000000933');
      expect(personIdToIri('30786325579101'))
        .toBe('http://www.ldbc.eu/ldbc_socialnet/1.0/data/pers00000030786325579101');
    });
  });

  describe('readSubstitutionParameterColumn', () => {
    it('reads a column', async() => {
      const file = await write('p.txt', 'personId|firstName\n1|Ian\n2|Jun\n');
      await expect(readSubstitutionParameterColumn(file, 'personId')).resolves.toEqual([ '1', '2' ]);
      await expect(readSubstitutionParameterColumn(file, 'firstName')).resolves.toEqual([ 'Ian', 'Jun' ]);
    });

    it('handles CRLF line endings', async() => {
      const file = await write('p.txt', 'personId|firstName\r\n1|Ian\r\n');
      await expect(readSubstitutionParameterColumn(file, 'firstName')).resolves.toEqual([ 'Ian' ]);
    });

    it('rejects for an unknown column', async() => {
      const file = await write('p.txt', 'personId|firstName\n1|Ian\n');
      await expect(readSubstitutionParameterColumn(file, 'other')).rejects
        .toThrow(`Could not find column 'other' in ${file}`);
    });
  });

  describe('writeCsvColumn', () => {
    it('writes a header and values', async() => {
      const file = Path.join(dir, 'out.csv');
      await writeCsvColumn(file, 'col', [ 'a', 'b' ]);
      await expect(fs.readFile(file, 'utf8')).resolves.toBe('col\na\nb\n');
    });
  });

  describe('generatePersonParameters', () => {
    it('writes person IRIs', async() => {
      const file = await write('interactive_1_param.txt', 'personId|firstName\n933|Ian\n30786325579101|Jun\n');
      const out = Path.join(dir, 'parameters-persons.csv');

      await expect(generatePersonParameters(file, out)).resolves.toBe(2);
      await expect(fs.readFile(out, 'utf8')).resolves.toBe(`person
http://www.ldbc.eu/ldbc_socialnet/1.0/data/pers00000000000000000933
http://www.ldbc.eu/ldbc_socialnet/1.0/data/pers00000030786325579101
`);
    });
  });

  describe('generateMessageParameters', () => {
    let activity0: string;
    let activity1: string;
    beforeEach(async() => {
      activity0 = await write('social_network_activity_0_0.ttl', `${PREFIXES}
sn:forum1 rdf:type snvoc:Forum .
sn:post1 rdf:type snvoc:Post ; snvoc:id "1" .
sn:comm2 rdf:type snvoc:Comment .
sn:comm2 snvoc:replyOf sn:post1 .
`);
      activity1 = await write('social_network_activity_1_0.ttl', `${PREFIXES}
sn:post3 rdf:type snvoc:Post .
sn:pers1 rdf:type snvoc:Person .
sn:post3 snvoc:hasCreator sn:post4 .
`);
    });

    it('writes all messages if the sample is large enough', async() => {
      const out = Path.join(dir, 'parameters-messages.csv');

      await expect(generateMessageParameters([ activity0, activity1 ], out, 10, 1)).resolves.toBe(3);
      await expect(fs.readFile(out, 'utf8')).resolves.toBe(`message
http://www.ldbc.eu/ldbc_socialnet/1.0/data/post1
http://www.ldbc.eu/ldbc_socialnet/1.0/data/comm2
http://www.ldbc.eu/ldbc_socialnet/1.0/data/post3
`);
    });

    it('writes a deterministic sample', async() => {
      const out1 = Path.join(dir, 'parameters-messages-1.csv');
      const out2 = Path.join(dir, 'parameters-messages-2.csv');

      await expect(generateMessageParameters([ activity0, activity1 ], out1, 2, 123)).resolves.toBe(2);
      await expect(generateMessageParameters([ activity0, activity1 ], out2, 2, 123)).resolves.toBe(2);
      const contents = await fs.readFile(out1, 'utf8');
      expect(contents).toBe(await fs.readFile(out2, 'utf8'));
      expect(contents.split('\n')[0]).toBe('message');
      expect(contents.split('\n').filter(line => line.length > 0)).toHaveLength(3);
    });
  });

  describe('repeatSubstitutionParameterRows', () => {
    it('copies a file with enough rows', async() => {
      const file = await write('bi_1_param.txt', 'date\n1\n2\n3\n');
      const out = Path.join(dir, 'out.txt');

      await expect(repeatSubstitutionParameterRows(file, out, 2)).resolves.toBe(3);
      await expect(fs.readFile(out, 'utf8')).resolves.toBe('date\n1\n2\n3\n');
    });

    it('repeats rows until the minimum is reached', async() => {
      const file = await write('bi_20_param.txt', 'tagClasses\r\nA;B\r\nC\r\n');
      const out = Path.join(dir, 'out.txt');

      await expect(repeatSubstitutionParameterRows(file, out, 5)).resolves.toBe(2);
      await expect(fs.readFile(out, 'utf8')).resolves.toBe('tagClasses\nA;B\nC\nA;B\nC\nA;B\nC\n');
    });

    it('rejects for a file without rows', async() => {
      const file = await write('bi_1_param.txt', 'date\n');

      await expect(repeatSubstitutionParameterRows(file, Path.join(dir, 'out.txt'), 5)).rejects
        .toThrow(`Could not find any substitution parameters in ${file}`);
    });
  });
});

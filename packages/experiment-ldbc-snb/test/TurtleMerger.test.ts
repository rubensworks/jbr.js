import * as os from 'node:os';
import * as Path from 'node:path';
import * as fs from 'fs-extra';
import { mergeTurtleToNTriples, streamTurtleFile } from '../lib/TurtleMerger';

const PREFIXES = `@prefix sn: <http://www.ldbc.eu/ldbc_socialnet/1.0/data/> .
@prefix snvoc: <http://www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/> .
`;

describe('TurtleMerger', () => {
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

  describe('streamTurtleFile', () => {
    it('emits all quads with preserved blank node labels', async() => {
      const file = await write('a.ttl', `${PREFIXES}sn:pers1 snvoc:knows _:knows0001 .\n_:knows0001 snvoc:hasPerson sn:pers2 .\n`);
      const quads: string[] = [];
      await streamTurtleFile(file, quad => quads.push(`${quad.subject.value} ${quad.object.value}`));
      expect(quads).toEqual([
        'http://www.ldbc.eu/ldbc_socialnet/1.0/data/pers1 knows0001',
        'knows0001 http://www.ldbc.eu/ldbc_socialnet/1.0/data/pers2',
      ]);
    });

    it('rejects on a missing file', async() => {
      await expect(streamTurtleFile(Path.join(dir, 'missing.ttl'), () => {
        // Do nothing
      })).rejects.toThrow('ENOENT');
    });

    it('rejects on invalid Turtle', async() => {
      const file = await write('a.ttl', `sn:pers1 snvoc:knows _:k .`);
      await expect(streamTurtleFile(file, () => {
        // Do nothing
      })).rejects.toThrow('Undefined prefix');
    });
  });

  describe('mergeTurtleToNTriples', () => {
    it('merges a single file', async() => {
      const file = await write('social_network_person_0_0.ttl', `${PREFIXES}sn:pers1 snvoc:firstName "A" .\n`);
      const out = Path.join(dir, 'out.nt');

      await expect(mergeTurtleToNTriples([ file ], out)).resolves.toBe(1);
      await expect(fs.readFile(out, 'utf8')).resolves.toBe(
        `<http://www.ldbc.eu/ldbc_socialnet/1.0/data/pers1> <http://www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/firstName> "A" .\n`,
      );
    });

    it('merges multiple shards and keeps blank node labels shared across files', async() => {
      const person0 = await write('social_network_person_0_0.ttl', `${PREFIXES}
sn:pers1 snvoc:knows _:knows00000000000000000000 .
`);
      const person1 = await write('social_network_person_1_0.ttl', `${PREFIXES}
_:knows00000000000000000000 snvoc:hasPerson sn:pers2 .
sn:pers2 snvoc:knows _:knows00000000000001048576 .
`);
      const activity = await write('social_network_activity_0_0.ttl', `${PREFIXES}
sn:forum1 snvoc:hasMember _:mbs00000000000000000000 .
_:mbs00000000000000000000
    snvoc:hasPerson sn:pers1 ;
    snvoc:joinDate "2010-01-01T00:00:00.000Z" .
`);
      const out = Path.join(dir, 'out.nt');

      await expect(mergeTurtleToNTriples([ person0, person1, activity ], out)).resolves.toBe(6);
      const lines = (await fs.readFile(out, 'utf8')).trim().split('\n');
      expect(lines).toEqual([
        '<http://www.ldbc.eu/ldbc_socialnet/1.0/data/pers1> <http://www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/knows> _:knows00000000000000000000 .',
        '_:knows00000000000000000000 <http://www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/hasPerson> <http://www.ldbc.eu/ldbc_socialnet/1.0/data/pers2> .',
        '<http://www.ldbc.eu/ldbc_socialnet/1.0/data/pers2> <http://www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/knows> _:knows00000000000001048576 .',
        '<http://www.ldbc.eu/ldbc_socialnet/1.0/data/forum1> <http://www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/hasMember> _:mbs00000000000000000000 .',
        '_:mbs00000000000000000000 <http://www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/hasPerson> <http://www.ldbc.eu/ldbc_socialnet/1.0/data/pers1> .',
        '_:mbs00000000000000000000 <http://www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/joinDate> "2010-01-01T00:00:00.000Z" .',
      ]);
    });

    it('produces an empty file for no inputs', async() => {
      const out = Path.join(dir, 'out.nt');

      await expect(mergeTurtleToNTriples([], out)).resolves.toBe(0);
      await expect(fs.readFile(out, 'utf8')).resolves.toBe('');
    });

    it('rejects on a missing input file', async() => {
      await expect(mergeTurtleToNTriples([ Path.join(dir, 'missing.ttl') ], Path.join(dir, 'out.nt')))
        .rejects.toThrow('ENOENT');
    });

    it('rejects on invalid Turtle', async() => {
      const file = await write('a.ttl', `sn:pers1 snvoc:knows _:k .`);
      await expect(mergeTurtleToNTriples([ file ], Path.join(dir, 'out.nt'))).rejects.toThrow('Undefined prefix');
    });

    it('rejects on an unwritable output file', async() => {
      const file = await write('a.ttl', `${PREFIXES}sn:pers1 snvoc:firstName "A" .\n`);
      await expect(mergeTurtleToNTriples([ file ], Path.join(dir, 'missing', 'out.nt'))).rejects.toThrow('ENOENT');
    });
  });
});

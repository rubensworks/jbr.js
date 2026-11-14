import { EventEmitter } from 'node:events';
import * as os from 'node:os';
import * as Path from 'node:path';
import { Readable } from 'node:stream';
import * as fs from 'fs-extra';
import * as yauzl from 'yauzl';
import * as yazl from 'yazl';
import { HTTP_HEADERS, HttpRandomAccessReader, ZenodoArchive } from '../lib/ZenodoArchive';

async function createZip(): Promise<Buffer> {
  const zip = new yazl.ZipFile();
  zip.addEmptyDirectory('dir/');
  zip.addBuffer(Buffer.from('HDT contents'), 'dir/a.hdt');
  zip.addBuffer(Buffer.from('SELECT * WHERE { ?s ?p ?o }'), 'b.sparql');
  zip.addBuffer(Buffer.from('other'), 'c.txt');
  zip.end();
  const chunks: Buffer[] = [];
  for await (const chunk of zip.outputStream) {
    chunks.push(<Buffer> chunk);
  }
  return Buffer.concat(chunks);
}

function mockResponse(status: number, body: Buffer | undefined, headers: Record<string, string> = {}): any {
  return {
    status,
    url: 'https://files.example.org/final',
    headers: new Headers(headers),
    body: body ? Readable.toWeb(Readable.from([ body ])) : undefined,
  };
}

describe('ZenodoArchive', () => {
  let zip: Buffer;
  let target: string;
  let fetchMock: jest.Mock;
  let logs: string[];
  const log = (message: string): void => {
    logs.push(message);
  };

  beforeAll(async() => {
    zip = await createZip();
  });

  beforeEach(async() => {
    target = await fs.mkdtemp(Path.join(os.tmpdir(), 'jbr-largerdfbench-zenodo-'));
    logs = [];
    fetchMock = jest.fn(async(_url: string, init: any) => {
      const [ start, end ] = init.headers.Range.slice('bytes='.length).split('-').map(Number);
      return mockResponse(206, zip.subarray(start, end + 1), { 'content-range': `bytes ${start}-${end}/${zip.length}` });
    });
    jest.spyOn(globalThis, 'fetch').mockImplementation(<any> fetchMock);
  });

  afterEach(async() => {
    jest.restoreAllMocks();
    await fs.remove(target);
  });

  it('exposes the URL of the file in the record', () => {
    expect(new ZenodoArchive('123', 'a.zip').url).toBe('https://zenodo.org/api/records/123/files/a.zip/content');
  });

  it('extracts the accepted entries, with a user agent that Zenodo accepts', async() => {
    const extracted = await new ZenodoArchive('123', 'a.zip')
      .extract(fileName => fileName.endsWith('.hdt') || fileName.endsWith('.sparql'), target, log);
    expect(extracted).toEqual([ 'a.hdt', 'b.sparql' ]);
    await expect(fs.readFile(Path.join(target, 'a.hdt'), 'utf8')).resolves.toBe('HDT contents');
    await expect(fs.readFile(Path.join(target, 'b.sparql'), 'utf8')).resolves.toBe('SELECT * WHERE { ?s ?p ?o }');
    await expect(fs.readdir(target)).resolves.toEqual([ 'a.hdt', 'b.sparql' ]);
    expect(logs).toEqual([ '  Downloading a.hdt (0 MiB)', '  Downloading b.sparql (0 MiB)' ]);
    expect(fetchMock).toHaveBeenCalledWith('https://zenodo.org/api/records/123/files/a.zip/content', {
      headers: { ...HTTP_HEADERS, Range: 'bytes=0-0' },
    });
    expect(fetchMock).toHaveBeenCalledWith('https://files.example.org/final', expect.anything());
  });

  it('does not download existing files of the right size again', async() => {
    await fs.writeFile(Path.join(target, 'a.hdt'), 'HDT contents');
    await fs.writeFile(Path.join(target, 'b.sparql'), 'incomplete');
    await new ZenodoArchive('123', 'a.zip').extract(fileName => fileName !== 'c.txt', target, log);
    expect(logs).toEqual([ '  a.hdt already exists', '  Downloading b.sparql (0 MiB)' ]);
    await expect(fs.readFile(Path.join(target, 'b.sparql'), 'utf8')).resolves.toBe('SELECT * WHERE { ?s ?p ?o }');
  });

  it('fails if the size of the file cannot be determined', async() => {
    fetchMock.mockImplementation(async() => mockResponse(404, undefined));
    await expect(new ZenodoArchive('123', 'a.zip').extract(() => true, target, log)).rejects
      .toThrow('Could not determine the size of https://zenodo.org/api/records/123/files/a.zip/content, got status 404');
  });

  it('fails if the zip file is invalid', async() => {
    fetchMock.mockImplementation(async() => mockResponse(206, Buffer.from('a'), { 'content-range': 'bytes 0-0/1' }));
    await expect(new ZenodoArchive('123', 'a.zip').open()).rejects
      .toThrow('End of central directory record signature not found');
  });

  it('fails if an entry cannot be read', async() => {
    jest.spyOn(yauzl.ZipFile.prototype, 'openReadStream')
      .mockImplementation((_entry: any, callback: any) => callback(new Error('read error')));
    await expect(new ZenodoArchive('123', 'a.zip').extract(() => true, target, log)).rejects.toThrow('read error');
  });

  describe('HttpRandomAccessReader', () => {
    it('fails on responses that are not partial', async() => {
      fetchMock.mockImplementation(async() => mockResponse(200, Buffer.from('abc')));
      const stream = new HttpRandomAccessReader('https://example.org/file')._readStreamForRange(0, 2);
      await expect(new Promise((resolve, reject) => stream.on('error', reject).on('end', resolve)))
        .rejects.toThrow('Expected a partial response for https://example.org/file, but got status 200');
    });
  });

  describe('listEntries', () => {
    it('fails on errors of the zip file', async() => {
      const zipFile = Object.assign(new EventEmitter(), {
        readEntry(): void {
          zipFile.emit('error', new Error('zip error'));
        },
      });
      await expect(ZenodoArchive.listEntries(<any> zipFile)).rejects.toThrow('zip error');
    });
  });
});

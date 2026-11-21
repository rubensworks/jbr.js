import { EventEmitter } from 'node:events';
import * as os from 'node:os';
import * as Path from 'node:path';
import { Readable } from 'node:stream';
import * as fs from 'fs-extra';
import * as yauzl from 'yauzl';
import * as yazl from 'yazl';
import {
  fetchRange,
  HTTP_HEADERS,
  HttpRandomAccessReader,
  RETRY_DELAYS,
  TAIL_BYTES,
  ZenodoArchive,
} from '../lib/ZenodoArchive';

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
    arrayBuffer: async() => new Uint8Array(body ?? []).buffer,
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
    expect(fetchMock).toHaveBeenCalledWith('https://files.example.org/final', {
      headers: { ...HTTP_HEADERS, Range: `bytes=0-${zip.length - 1}` },
    });
    // The archive is smaller than the tail, so it is downloaded in a single request after the one for its size.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reads the ranges before the tail with separate requests', async() => {
    const extracted = await new ZenodoArchive('123', 'a.zip', [ 0 ], 100)
      .extract(fileName => fileName.endsWith('.hdt') || fileName.endsWith('.sparql'), target, log);
    expect(extracted).toEqual([ 'a.hdt', 'b.sparql' ]);
    await expect(fs.readFile(Path.join(target, 'a.hdt'), 'utf8')).resolves.toBe('HDT contents');
    await expect(fs.readFile(Path.join(target, 'b.sparql'), 'utf8')).resolves.toBe('SELECT * WHERE { ?s ?p ?o }');
    expect(fetchMock).toHaveBeenCalledWith('https://files.example.org/final', {
      headers: { ...HTTP_HEADERS, Range: `bytes=${zip.length - 100}-${zip.length - 1}` },
    });
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2);
  });

  it('fails if the tail is not a partial response', async() => {
    fetchMock.mockImplementationOnce(async() => mockResponse(206, zip.subarray(0, 1), {
      'content-range': `bytes 0-0/${zip.length}`,
    })).mockImplementationOnce(async() => mockResponse(200, zip));
    await expect(new ZenodoArchive('123', 'a.zip').open()).rejects
      .toThrow('Expected a partial response for https://files.example.org/final, but got status 200');
  });

  it('does not download existing files of the right size again', async() => {
    await fs.writeFile(Path.join(target, 'a.hdt'), 'HDT contents');
    await fs.writeFile(Path.join(target, 'b.sparql'), 'incomplete');
    await new ZenodoArchive('123', 'a.zip').extract(fileName => fileName !== 'c.txt', target, log);
    expect(logs).toEqual([ '  a.hdt already exists', '  Downloading b.sparql (0 MiB)' ]);
    await expect(fs.readFile(Path.join(target, 'b.sparql'), 'utf8')).resolves.toBe('SELECT * WHERE { ?s ?p ?o }');
  });

  it('retries server errors, rate limiting, and network errors', async() => {
    const respond = fetchMock.getMockImplementation()!;
    fetchMock
      .mockImplementationOnce(async() => mockResponse(500, Buffer.from('error')))
      .mockImplementationOnce(async() => mockResponse(429, undefined))
      .mockImplementationOnce(async() => {
        throw new TypeError('fetch failed');
      })
      .mockImplementation(respond);
    const extracted = await new ZenodoArchive('123', 'a.zip', [ 0, 0, 0 ]).extract(() => true, target, log);
    expect(extracted).toEqual([ 'a.hdt', 'b.sparql', 'c.txt' ]);
    expect(fetchMock.mock.calls.slice(0, 4).map(call => call[1].headers.Range))
      .toEqual([ 'bytes=0-0', 'bytes=0-0', 'bytes=0-0', 'bytes=0-0' ]);
  });

  it('retries range requests of entries', async() => {
    const respond = fetchMock.getMockImplementation()!;
    let failed = false;
    fetchMock.mockImplementation(async(url: string, init: any) => {
      if (!failed && url === 'https://files.example.org/final') {
        failed = true;
        return mockResponse(502, undefined);
      }
      return respond(url, init);
    });
    await expect(new ZenodoArchive('123', 'a.zip', [ 0 ]).extract(() => true, target, log)).resolves
      .toEqual([ 'a.hdt', 'b.sparql', 'c.txt' ]);
    expect(failed).toBe(true);
  });

  it('retries with delays and downloads the tail by default', async() => {
    expect(new ZenodoArchive('123', 'a.zip').retryDelays).toBe(RETRY_DELAYS);
    expect(new ZenodoArchive('123', 'a.zip').tailBytes).toBe(TAIL_BYTES);
    expect(new HttpRandomAccessReader('https://example.org/file').retryDelays).toBe(RETRY_DELAYS);
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

  describe('fetchRange', () => {
    it('returns the last response if all attempts fail', async() => {
      fetchMock.mockImplementation(async() => mockResponse(503, undefined));
      await expect(fetchRange('https://example.org/file', 'bytes=0-0', [ 0, 0 ])).resolves
        .toMatchObject({ status: 503 });
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('throws the network error of the last attempt', async() => {
      fetchMock.mockImplementation(async() => {
        throw new TypeError('fetch failed');
      });
      await expect(fetchRange('https://example.org/file', 'bytes=0-0', [ 0 ])).rejects.toThrow('fetch failed');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('HttpRandomAccessReader', () => {
    it('fails on responses that are not partial and have no body', async() => {
      fetchMock.mockImplementation(async() => mockResponse(404, undefined));
      await expect(new HttpRandomAccessReader('https://example.org/file', [ 0 ]).fetchRange(0, 2)).rejects
        .toThrow('Expected a partial response for https://example.org/file, but got status 404');
    });

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

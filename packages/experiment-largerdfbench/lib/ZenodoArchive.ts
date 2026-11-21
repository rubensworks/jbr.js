import * as Path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type * as streamWeb from 'node:stream/web';
import * as fs from 'fs-extra';
import * as yauzl from 'yauzl';

/**
 * Zenodo refuses requests with the default user agent of Node.js.
 */
export const HTTP_HEADERS = { 'User-Agent': 'jbr (https://github.com/rubensworks/jbr.js)' };

/**
 * The delays in milliseconds before retrying a request,
 * as Zenodo sometimes answers range requests with a server error that succeeds when retried.
 */
export const RETRY_DELAYS = [ 1_000, 5_000, 15_000, 30_000 ];

/**
 * The number of bytes at the end of an archive that are downloaded in a single request.
 * This covers small archives entirely, and the central directory of large ones,
 * which would otherwise be read with two requests per entry.
 */
export const TAIL_BYTES = 32 * 1024 * 1024;

/**
 * Request a byte range, and retry on network errors, server errors, and rate limiting.
 * @param url The URL.
 * @param range The value of the Range header.
 * @param retryDelays The delays in milliseconds before each retry.
 */
export async function fetchRange(url: string, range: string, retryDelays: number[]): Promise<Response> {
  for (const delay of retryDelays) {
    try {
      const response = await fetch(url, { headers: { ...HTTP_HEADERS, Range: range }});
      if (response.status < 500 && response.status !== 429) {
        return response;
      }
      await response.body?.cancel();
    } catch {
      // Network errors are retried as well, until the last attempt.
    }
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  return fetch(url, { headers: { ...HTTP_HEADERS, Range: range }});
}

/**
 * The bytes at the end of a file that were downloaded already.
 */
export interface IFileTail {
  /**
   * The offset of the first byte in the file.
   */
  start: number;
  /**
   * The bytes from the offset until the end of the file.
   */
  data: Buffer;
}

/**
 * Reads byte ranges of a remote file via HTTP range requests.
 */
export class HttpRandomAccessReader extends yauzl.RandomAccessReader {
  /**
   * @param url The URL of the file.
   * @param retryDelays The delays in milliseconds before each retry of a request.
   * @param tail The bytes at the end of the file, if they were downloaded already.
   */
  public constructor(
    public readonly url: string,
    public readonly retryDelays: number[] = RETRY_DELAYS,
    public readonly tail?: IFileTail,
  ) {
    super();
  }

  /**
   * Request a byte range, and fail if the response is not partial.
   * @param start The first byte.
   * @param end The byte after the last one.
   */
  public async fetchRange(start: number, end: number): Promise<Response> {
    const response = await fetchRange(this.url, `bytes=${start}-${end - 1}`, this.retryDelays);
    if (response.status !== 206) {
      await response.body?.cancel();
      throw new Error(`Expected a partial response for ${this.url}, but got status ${response.status}`);
    }
    return response;
  }

  public override _readStreamForRange(start: number, end: number): Readable {
    if (this.tail && start >= this.tail.start) {
      return Readable.from([ this.tail.data.subarray(start - this.tail.start, end - this.tail.start) ], {
        objectMode: false,
      });
    }
    const stream = new PassThrough();
    this.fetchRange(start, end)
      .then(response => Readable.fromWeb(<streamWeb.ReadableStream> response.body).pipe(stream))
      .catch((error: Error) => stream.destroy(error));
    return stream;
  }
}

/**
 * A zip archive on Zenodo, from which entries can be extracted without downloading the whole archive.
 */
export class ZenodoArchive {
  public constructor(
    public readonly record: string,
    public readonly name: string,
    public readonly retryDelays: number[] = RETRY_DELAYS,
    public readonly tailBytes: number = TAIL_BYTES,
  ) {}

  public get url(): string {
    return `https://zenodo.org/api/records/${this.record}/files/${this.name}/content`;
  }

  /**
   * Open the remote zip file.
   */
  public async open(): Promise<yauzl.ZipFile> {
    const response = await fetchRange(this.url, 'bytes=0-0', this.retryDelays);
    await response.body?.cancel();
    const size = Number(response.headers.get('content-range')?.split('/')[1]);
    if (!size) {
      throw new Error(`Could not determine the size of ${this.url}, got status ${response.status}`);
    }
    // Ranges are requested on the final URL, after redirects.
    const tailStart = Math.max(0, size - this.tailBytes);
    const tailResponse = await new HttpRandomAccessReader(response.url, this.retryDelays).fetchRange(tailStart, size);
    const tail = { start: tailStart, data: Buffer.from(await tailResponse.arrayBuffer()) };
    const reader = new HttpRandomAccessReader(response.url, this.retryDelays, tail);
    return await new Promise((resolve, reject) => yauzl.fromRandomAccessReader(
      reader,
      size,
      { lazyEntries: true, autoClose: false },
      (error, zip) => error ? reject(error) : resolve(zip),
    ));
  }

  /**
   * Extract the entries whose file name (without directories) is accepted by the filter into the target directory.
   * Files that already exist with the right size are not downloaded again.
   * @param filter A function that decides if an entry with the given file name must be extracted.
   * @param target The target directory.
   * @param log A logger.
   * @return The extracted file names.
   */
  public async extract(
    filter: (fileName: string) => boolean,
    target: string,
    log: (message: string) => void,
  ): Promise<string[]> {
    const zip = await this.open();
    try {
      await fs.ensureDir(target);
      const extracted: string[] = [];
      for (const entry of await ZenodoArchive.listEntries(zip)) {
        const fileName = Path.basename(entry.fileName);
        if (entry.fileName.endsWith('/') || !filter(fileName)) {
          continue;
        }
        extracted.push(fileName);
        const file = Path.join(target, fileName);
        if (await fs.pathExists(file) && (await fs.stat(file)).size === entry.uncompressedSize) {
          log(`  ${fileName} already exists`);
          continue;
        }
        log(`  Downloading ${fileName} (${Math.round(entry.compressedSize / 1024 / 1024)} MiB)`);
        const stream = await new Promise<Readable>((resolve, reject) => zip.openReadStream(
          entry,
          (error, entryStream) => error ? reject(error) : resolve(entryStream),
        ));
        // Yauzl verifies the CRC-32 of each entry while it is read.
        await pipeline(stream, fs.createWriteStream(`${file}.part`));
        await fs.rename(`${file}.part`, file);
      }
      return extracted;
    } finally {
      zip.close();
    }
  }

  /**
   * List all entries of a zip file opened with lazyEntries.
   * @param zip A zip file.
   */
  public static listEntries(zip: yauzl.ZipFile): Promise<yauzl.Entry[]> {
    return new Promise((resolve, reject) => {
      const entries: yauzl.Entry[] = [];
      zip.on('entry', (entry: yauzl.Entry) => {
        entries.push(entry);
        zip.readEntry();
      });
      zip.on('end', () => resolve(entries));
      zip.on('error', reject);
      zip.readEntry();
    });
  }
}

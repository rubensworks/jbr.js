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
 * Reads byte ranges of a remote file via HTTP range requests.
 */
export class HttpRandomAccessReader extends yauzl.RandomAccessReader {
  public constructor(public readonly url: string) {
    super();
  }

  public override _readStreamForRange(start: number, end: number): Readable {
    const stream = new PassThrough();
    fetch(this.url, { headers: { ...HTTP_HEADERS, Range: `bytes=${start}-${end - 1}` }})
      .then((response) => {
        if (response.status !== 206) {
          throw new Error(`Expected a partial response for ${this.url}, but got status ${response.status}`);
        }
        Readable.fromWeb(<streamWeb.ReadableStream> response.body).pipe(stream);
      })
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
  ) {}

  public get url(): string {
    return `https://zenodo.org/api/records/${this.record}/files/${this.name}/content`;
  }

  /**
   * Open the remote zip file.
   */
  public async open(): Promise<yauzl.ZipFile> {
    const response = await fetch(this.url, { headers: { ...HTTP_HEADERS, Range: 'bytes=0-0' }});
    await response.body?.cancel();
    const size = Number(response.headers.get('content-range')?.split('/')[1]);
    if (!size) {
      throw new Error(`Could not determine the size of ${this.url}, got status ${response.status}`);
    }
    // Ranges are requested on the final URL, after redirects.
    const reader = new HttpRandomAccessReader(response.url);
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

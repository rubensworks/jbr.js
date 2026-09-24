import type * as RDF from '@rdfjs/types';
import * as fs from 'fs-extra';
import { StreamParser, StreamWriter } from 'n3';

/**
 * Stream all quads from a Turtle file.
 * Blank node labels are kept as-is, so that they remain valid across files.
 * @param filePath Path to a Turtle file.
 * @param onQuad Callback for each quad.
 */
export function streamTurtleFile(filePath: string, onQuad: (quad: RDF.Quad) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const parser = new StreamParser({ format: 'text/turtle', blankNodePrefix: '' });
    fs.createReadStream(filePath)
      .on('error', reject)
      .pipe(parser)
      .on('error', reject)
      .on('data', onQuad)
      .on('end', resolve);
  });
}

/**
 * Merge the given Turtle files into a single N-Triples file, one file at a time.
 * Blank node labels are kept as-is, so that cross-file references remain valid.
 * @param inputFiles Paths to Turtle files.
 * @param outputFile Path to the N-Triples file to write.
 * @return The number of written triples.
 */
export async function mergeTurtleToNTriples(inputFiles: string[], outputFile: string): Promise<number> {
  const writer = new StreamWriter({ format: 'N-Triples' });
  const output = fs.createWriteStream(outputFile, 'utf8');
  // Output errors must abort the merge, as a failed output would otherwise stall the parsers
  const outputError = new Promise<never>((resolve, reject) => output.on('error', reject));
  outputError.catch(() => {
    // Handled via Promise.race below
  });
  const outputDone = new Promise<void>(resolve => output.on('finish', resolve));
  writer.pipe(output);

  let count = 0;
  for (const inputFile of inputFiles) {
    await Promise.race([ outputError, new Promise<void>((resolve, reject) => {
      const parser = new StreamParser({ format: 'text/turtle', blankNodePrefix: '' });
      parser.on('data', () => count++);
      fs.createReadStream(inputFile)
        .on('error', reject)
        .pipe(parser)
        .on('error', reject)
        .on('end', resolve)
        .pipe(writer, { end: false });
    }) ]);
  }

  writer.end();
  await Promise.race([ outputError, outputDone ]);
  return count;
}

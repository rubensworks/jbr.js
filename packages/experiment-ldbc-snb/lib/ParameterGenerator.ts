import * as fs from 'fs-extra';
import { ReservoirSampler } from './ReservoirSampler';
import { streamTurtleFile } from './TurtleMerger';

export const PERSON_IRI_PREFIX = 'http://www.ldbc.eu/ldbc_socialnet/1.0/data/pers';
const RDF_TYPE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type';
const MESSAGE_TYPES = new Set([
  'http://www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/Post',
  'http://www.ldbc.eu/ldbc_socialnet/1.0/vocabulary/Comment',
]);

/**
 * Convert a numeric person id into its IRI, as done by the datagen (`String.format("%020d")`).
 * @param personId A person id.
 */
export function personIdToIri(personId: string): string {
  return `${PERSON_IRI_PREFIX}${personId.padStart(20, '0')}`;
}

/**
 * Read a single column from a pipe-separated datagen substitution parameters file.
 * @param filePath Path to a `interactive_N_param.txt` file.
 * @param column Column name.
 */
export async function readSubstitutionParameterColumn(filePath: string, column: string): Promise<string[]> {
  const lines = (await fs.readFile(filePath, 'utf8')).split(/\r?\n/u).filter(line => line.length > 0);
  const index = lines[0].split('|').indexOf(column);
  if (index < 0) {
    throw new Error(`Could not find column '${column}' in ${filePath}`);
  }
  return lines.slice(1).map(line => line.split('|')[index]);
}

/**
 * Write a single-column CSV file.
 * @param filePath Output path.
 * @param column Column name.
 * @param values Column values.
 */
export async function writeCsvColumn(filePath: string, column: string, values: string[]): Promise<void> {
  await fs.writeFile(filePath, `${[ column, ...values ].join('\n')}\n`, 'utf8');
}

/**
 * Create a CSV file with person IRIs, based on the persons in the given substitution parameters file.
 * @param paramFile Path to `interactive_1_param.txt`.
 * @param outputFile Path to the CSV file to write.
 * @return The number of persons.
 */
export async function generatePersonParameters(paramFile: string, outputFile: string): Promise<number> {
  const iris = (await readSubstitutionParameterColumn(paramFile, 'personId')).map(personIdToIri);
  await writeCsvColumn(outputFile, 'person', iris);
  return iris.length;
}

/**
 * Create a CSV file with a seeded random sample of message (post and comment) IRIs.
 * @param activityFiles Paths to the activity Turtle files.
 * @param outputFile Path to the CSV file to write.
 * @param size Sample size.
 * @param seed Random seed.
 * @return The number of sampled messages.
 */
export async function generateMessageParameters(
  activityFiles: string[],
  outputFile: string,
  size: number,
  seed: number,
): Promise<number> {
  const sampler = new ReservoirSampler<string>(size, seed);
  for (const activityFile of activityFiles) {
    await streamTurtleFile(activityFile, (quad) => {
      if (quad.predicate.value === RDF_TYPE && MESSAGE_TYPES.has(quad.object.value)) {
        sampler.add(quad.subject.value);
      }
    });
  }
  const sample = sampler.getSample();
  await writeCsvColumn(outputFile, 'message', sample);
  return sample.length;
}

/**
 * Copy a pipe-separated substitution parameters file,
 * repeating its rows until it contains at least the given number of rows.
 * @param paramFile Path to a `bi_N_param.txt` file.
 * @param outputFile Path to the file to write.
 * @param minRows Minimum number of rows.
 * @return The number of rows in the original file.
 */
export async function repeatSubstitutionParameterRows(
  paramFile: string,
  outputFile: string,
  minRows: number,
): Promise<number> {
  const [ header, ...rows ] = (await fs.readFile(paramFile, 'utf8')).split(/\r?\n/u).filter(line => line.length > 0);
  if (rows.length === 0) {
    throw new Error(`Could not find any substitution parameters in ${paramFile}`);
  }
  const output = [ ...rows ];
  while (output.length < minRows) {
    output.push(...rows);
  }
  await fs.writeFile(outputFile, `${[ header, ...output ].join('\n')}\n`, 'utf8');
  return rows.length;
}

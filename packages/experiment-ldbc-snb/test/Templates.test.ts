import * as os from 'node:os';
import * as Path from 'node:path';
import * as fs from 'fs-extra';
import { runConfig } from 'sparql-query-parameter-instantiator';
import { Parser } from 'sparqljs';
import { ExperimentLdbcSnb } from '../lib/ExperimentLdbcSnb';

const TEMPLATES_BI = Path.join(ExperimentLdbcSnb.TEMPLATES_PATH, 'queries-bi');

// Columns of the datagen's bi_N_param.txt files, with an example row
const BI_PARAMS: Record<number, [string, string]> = {
  1: [ 'date', '1323302400000' ],
  2: [ 'date1|date2|country1|country2', '1262304000000|1286496000000|Senegal|Tunisia' ],
  3: [ 'year|month', '2010|11' ],
  4: [ 'tagClass|country', 'MusicalArtist|Niger' ],
  5: [ 'country', 'Senegal' ],
  6: [ 'tag', 'Alexander_Downer' ],
  7: [ 'tag', 'Haile_Selassie_I' ],
  8: [ 'tag', 'Adolf_Hitler' ],
  9: [ 'tagClass1|tagClass2|threshold', 'MusicalArtist|OfficeHolder|200' ],
  10: [ 'tag|date', 'Haile_Selassie_I|1323302400000' ],
  11: [ 'country|blacklist', 'Germany|one;has;David' ],
  12: [ 'date|likeThreshold', '1323302400000|400' ],
  13: [ 'country', 'Senegal' ],
  14: [ 'startDate|endDate', '1288569600000|1291161600000' ],
  15: [ 'country', 'Senegal' ],
  17: [ 'country', 'Senegal' ],
  18: [ 'date|lengthThreshold|languages', '1323302400000|20|ar;tk' ],
  19: [ 'date|tagClass1|tagClass2', '599616000000|MusicalArtist|OfficeHolder' ],
  20: [ 'tagClasses', 'Writer;Single;Country' ],
  21: [ 'country|endDate', 'Senegal|1356998400000' ],
  22: [ 'country1|country2', 'United_States|Greece' ],
  23: [ 'country', 'Senegal' ],
  24: [ 'tagClass', 'Single' ],
};

async function listTemplates(dir: string): Promise<string[]> {
  return (await fs.readdir(dir)).filter(file => file.endsWith('.sparql')).sort();
}

describe('query templates', () => {
  describe.each([ 'queries', 'queries-bi' ])('in %s', (dir) => {
    it('should all parse', async() => {
      const templates = await listTemplates(Path.join(ExperimentLdbcSnb.TEMPLATES_PATH, dir));
      expect(templates.length).toBeGreaterThan(0);
      for (const template of templates) {
        const query = await fs.readFile(Path.join(ExperimentLdbcSnb.TEMPLATES_PATH, dir, template), 'utf8');
        expect(() => new Parser().parse(query)).not.toThrow();
      }
    });
  });

  describe('BI', () => {
    let dir: string;
    beforeEach(async() => {
      dir = await fs.mkdtemp(Path.join(os.tmpdir(), 'jbr-ldbc-snb-templates-'));
    });

    afterEach(async() => {
      await fs.remove(dir);
    });

    it('should contain all BI queries except 16 and 25', async() => {
      await expect(listTemplates(TEMPLATES_BI)).resolves.toEqual(Object.keys(BI_PARAMS).map(i => `bi-${i}.sparql`).sort());
    });

    it('should have a provider for each template', async() => {
      const config = await fs.readJson(Path.join(ExperimentLdbcSnb.TEMPLATES_PATH, 'query-config-bi.json'));
      expect(config.providers.map((provider: any) => provider.templateFilePath['@id']).sort())
        .toEqual((await listTemplates(TEMPLATES_BI))
          .map(file => `urn:variables:ldbc-snb:templates:${Path.basename(file, '.sparql')}`).sort());
    });

    // Components.js module discovery is slow
    it('should instantiate all parameters', async() => {
      const config = await fs.readJson(Path.join(ExperimentLdbcSnb.TEMPLATES_PATH, 'query-config-bi.json'));
      const variables: Record<string, any> = {
        'urn:variables:ldbc-snb:count': 1,
        'urn:variables:ldbc-snb:seed': 1,
      };
      for (const [ i, [ header, row ]] of Object.entries(BI_PARAMS)) {
        const params = Path.join(dir, `bi_${i}_param.txt`);
        await fs.writeFile(params, `${header}\n${row}\n`, 'utf8');
        variables[`urn:variables:ldbc-snb:params:bi_${i}`] = params;
        variables[`urn:variables:ldbc-snb:templates:bi-${i}`] = Path.join(TEMPLATES_BI, `bi-${i}.sparql`);
        variables[`urn:variables:ldbc-snb:output:bi-${i}`] = Path.join(dir, `bi-${i}.sparql`);
      }

      await runConfig(
        Path.join(ExperimentLdbcSnb.TEMPLATES_PATH, 'query-config-bi.json'),
        { mainModulePath: Path.join(__dirname, '..') },
        { variables },
      );

      for (const provider of config.providers) {
        const name = provider.templateFilePath['@id'].split(':').pop();
        const query = await fs.readFile(Path.join(dir, `${name}.sparql`), 'utf8');
        expect(() => new Parser().parse(query)).not.toThrow();
        for (const variable of provider.variables) {
          expect(query).not.toMatch(new RegExp(`[?$]${variable.name}\\b`, 'u'));
        }
      }
    }, 120_000);

    it('should instantiate list parameters as regular expressions', async() => {
      const bi18 = await fs.readFile(Path.join(TEMPLATES_BI, 'bi-18.sparql'), 'utf8');
      expect(bi18).toContain('FILTER(REGEX(?language, CONCAT("^(", REPLACE($languages, ";", "|"), ")$")))');
    });
  });
});

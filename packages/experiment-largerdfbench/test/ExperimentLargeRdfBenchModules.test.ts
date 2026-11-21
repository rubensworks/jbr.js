import { ExperimentLargeRdfBench } from '../lib/ExperimentLargeRdfBench';

jest.mock<any>('hdt', () => {
  throw new Error('native module missing');
});

describe('ExperimentLargeRdfBench without its optional peer dependencies', () => {
  it('fails clearly when generating a sample', async() => {
    await expect(ExperimentLargeRdfBench.loadGenerationModules()).rejects.toThrow(
      'Generating a LargeRDFBench sample requires the optional peer dependencies hdt, @comunica/query-sparql-hdt, ' +
      'and @comunica/query-sparql-rdfjs, which could not be loaded: native module missing',
    );
  });
});

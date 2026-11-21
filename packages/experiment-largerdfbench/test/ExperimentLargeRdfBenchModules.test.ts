import { ExperimentLargeRdfBench } from '../lib/ExperimentLargeRdfBench';

jest.mock<any>('hdt', () => {
  throw new Error('native module missing');
});

describe('ExperimentLargeRdfBench without its optional dependencies', () => {
  it('fails clearly when generating a sample', async() => {
    await expect(ExperimentLargeRdfBench.loadGenerationModules()).rejects.toThrow(
      'Generating a LargeRDFBench sample requires the optional dependencies hdt and @comunica/query-sparql-hdt, ' +
      'which could not be loaded: native module missing',
    );
  });
});

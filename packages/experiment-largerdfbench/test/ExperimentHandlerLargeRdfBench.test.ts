import type { IExperimentPaths } from 'jbr';
import { createExperimentPaths } from 'jbr';
import { ExperimentHandlerLargeRdfBench } from '../lib/ExperimentHandlerLargeRdfBench';
import { ExperimentLargeRdfBench } from '../lib/ExperimentLargeRdfBench';

describe('ExperimentHandlerLargeRdfBench', () => {
  let handler: ExperimentHandlerLargeRdfBench;
  let experimentPaths: IExperimentPaths;
  beforeEach(() => {
    handler = new ExperimentHandlerLargeRdfBench();
    experimentPaths = createExperimentPaths('dir');
  });

  describe('exposes public fields', () => {
    it('should expose an id', () => {
      expect(handler.id).toBe('largerdfbench');
    });

    it('should expose an experimentClassName', () => {
      expect(handler.experimentClassName).toBe('ExperimentLargeRdfBench');
    });
  });

  describe('getDefaultParams', () => {
    it('should return a sample of the FedBench part', () => {
      expect(handler.getDefaultParams(experimentPaths)).toEqual({
        zenodoRecord: '22140177',
        datasets: ExperimentLargeRdfBench.FEDBENCH_DATASETS,
        queries: ExperimentLargeRdfBench.FEDBENCH_QUERIES,
        sample: true,
        sampleSubjectRates: {
          'DBPedia-Subset': 0.02,
          GeoNames: 0.02,
          LMDB: 0.25,
        },
        sampleOtherTriplesRate: 0.2,
        sampleSeed: 'largerdfbench-sample-v1',
        sampleValidate: true,
        generationQueryTimeout: 1_800,
        endpointUrl: 'http://localhost:3001/sparql',
        endpointUrlExternal: 'http://localhost:3001/sparql',
        sourceUrlsExternal: [],
        queryRunnerReplication: 3,
        queryRunnerWarmupRounds: 1,
        queryRunnerRequestDelay: 0,
        queryRunnerEndpointAvailabilityCheckTimeout: 1_000,
        queryRunnerUrlParams: {},
      });
    });
  });

  describe('getHookNames', () => {
    it('should return the federation engine and the sources', () => {
      expect(handler.getHookNames()).toEqual([ 'hookSparqlEndpoint', 'hookSparqlEndpointSources' ]);
    });
  });

  describe('init', () => {
    it('should do nothing', async() => {
      await handler.init(experimentPaths, <any> {});
    });
  });
});

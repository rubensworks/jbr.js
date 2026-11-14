import type { IExperimentPaths } from 'jbr';
import { ExperimentHandler } from 'jbr';
import { ExperimentLargeRdfBench } from './ExperimentLargeRdfBench';

/**
 * An experiment handler for LargeRDFBench.
 */
export class ExperimentHandlerLargeRdfBench extends ExperimentHandler<ExperimentLargeRdfBench> {
  public constructor() {
    super('largerdfbench', ExperimentLargeRdfBench.name);
  }

  public getDefaultParams(_experimentPaths: IExperimentPaths): Record<string, any> {
    return {
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
    };
  }

  public getHookNames(): string[] {
    return [ 'hookSparqlEndpoint', 'hookSparqlEndpointSources' ];
  }

  public async init(_experimentPaths: IExperimentPaths, _experiment: ExperimentLargeRdfBench): Promise<void> {
    // Do nothing
  }
}

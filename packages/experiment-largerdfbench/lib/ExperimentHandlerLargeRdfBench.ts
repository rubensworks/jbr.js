import type { IExperimentPaths } from 'jbr';
import { ExperimentHandler } from 'jbr';
import { ExperimentLargeRdfBench } from './ExperimentLargeRdfBench';

/**
 * An experiment handler for the LargeRDFBench.
 */
export class ExperimentHandlerLargeRdfBench extends ExperimentHandler<ExperimentLargeRdfBench> {
  public constructor() {
    super('largerdfbench', ExperimentLargeRdfBench.name);
  }

  public getDefaultParams(experimentPaths: IExperimentPaths): Record<string, any> {
    return {
      datasetUrl: 'https://cloud.ilabt.imec.be/index.php/s/qm8EGWCZBot9Hjj/download',

      generateHdt: true,

      endpointUrl: 'http://localhost:3001/sparql',
      endpointUrlExternal: 'http://localhost:3001/',
      queryRunnerReplication: 3,
      queryRunnerWarmupRounds: 1,
      queryRunnerRequestDelay: 0,
      queryRunnerEndpointAvailabilityCheckTimeout: 1_000,
      queryRunnerUrlParams: {},
    };
  }

  public getHookNames(): string[] {
    return [ 'hookSparqlEndpointFederationEngine', 'hookSparqlEndpointsSources' ];
  }

  public async init(experimentPaths: IExperimentPaths, experiment: ExperimentLargeRdfBench): Promise<void> {
    // Do nothing
  }
}

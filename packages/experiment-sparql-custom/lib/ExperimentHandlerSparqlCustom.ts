import type { IExperimentPaths } from 'jbr';
import { ExperimentHandler } from 'jbr';
import { ExperimentSparqlCustom } from './ExperimentSparqlCustom';

/**
 * An experiment handler for the WatDiv.
 */
export class ExperimentHandlerSparqlCustom extends ExperimentHandler<ExperimentSparqlCustom> {
  public constructor() {
    super('sparql-custom', ExperimentSparqlCustom.name);
  }

  public getDefaultParams(experimentPaths: IExperimentPaths): Record<string, any> {
    return {
      queriesPath: 'input/queries/',
      endpointUrl: 'http://localhost:3001/sparql',
      queryRunnerReplication: 3,
      queryRunnerWarmupRounds: 1,
      queryRunnerRequestDelay: 0,
      queryRunnerEndpointAvailabilityCheckTimeout: 1_000,
      queryRunnerUrlParams: {},
    };
  }

  public getHookNames(): string[] {
    return [ 'hookSparqlEndpoint' ];
  }

  public async init(experimentPaths: IExperimentPaths, experiment: ExperimentSparqlCustom): Promise<void> {
    // Do nothing
  }
}

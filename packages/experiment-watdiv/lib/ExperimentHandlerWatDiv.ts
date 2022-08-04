import type { IExperimentPaths } from 'jbr';
import { ExperimentHandler } from 'jbr';
import { ExperimentWatDiv } from './ExperimentWatDiv';

/**
 * An experiment handler for the LDBC SNB Decentralized benchmark.
 */
export class ExperimentHandlerWatDiv extends ExperimentHandler<ExperimentWatDiv> {
  public constructor() {
    super('watdiv', ExperimentWatDiv.name);
  }

  public getDefaultParams(experimentPaths: IExperimentPaths): Record<string, any> {
    return {
      datasetScale: 1,
      queryCount: 5,
      queryRecurrence: 1,

      generateHdt: true,

      endpointUrl: 'http://localhost:3001/sparql',
      queryRunnerReplication: 3,
      queryRunnerWarmupRounds: 1,
      queryRunnerRecordTimestamps: true,
      queryRunnerRecordHttpRequests: true,
      queryRunnerUrlParamsInit: {},
      queryRunnerUrlParamsRun: {},
    };
  }

  public getHookNames(): string[] {
    return [ 'hookSparqlEndpoint' ];
  }

  public async init(experimentPaths: IExperimentPaths, experiment: ExperimentWatDiv): Promise<void> {
    // Do nothing
  }
}

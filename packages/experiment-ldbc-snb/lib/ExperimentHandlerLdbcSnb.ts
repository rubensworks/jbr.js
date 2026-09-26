import type { IExperimentPaths } from 'jbr';
import { ExperimentHandler } from 'jbr';
import { ExperimentLdbcSnb } from './ExperimentLdbcSnb';

/**
 * An experiment handler for the LDBC Social Network Benchmark.
 */
export class ExperimentHandlerLdbcSnb extends ExperimentHandler<ExperimentLdbcSnb> {
  public constructor() {
    super('ldbc-snb', ExperimentLdbcSnb.name);
  }

  public getDefaultParams(_experimentPaths: IExperimentPaths): Record<string, any> {
    return {
      scale: '0.1',
      hadoopMemory: '4G',
      queryCount: 5,
      querySeed: 12345,
      workload: 'interactive',

      generateHdt: false,

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
    return [ 'hookSparqlEndpoint' ];
  }

  public async init(_experimentPaths: IExperimentPaths, _experiment: ExperimentLdbcSnb): Promise<void> {
    // Do nothing
  }
}

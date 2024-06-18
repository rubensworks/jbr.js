import type { IExperimentPaths } from 'jbr';
import { ExperimentHandler } from 'jbr';
import { ExperimentBsbm } from './ExperimentBsbm';

/**
 * An experiment handler for BSBM.
 */
export class ExperimentHandlerBsbm extends ExperimentHandler<ExperimentBsbm> {
  public constructor() {
    super('bsbm', ExperimentBsbm.name);
  }

  public getDefaultParams(experimentPaths: IExperimentPaths): Record<string, any> {
    return {
      productCount: 1000,
      generateHdt: false,
      endpointUrl: 'http://localhost:3001/sparql',
      endpointUrlExternal: 'http://localhost:3001/sparql',
      warmupRuns: 5,
      runs: 50,
    };
  }

  public getHookNames(): string[] {
    return [ 'hookSparqlEndpoint' ];
  }

  public async init(experimentPaths: IExperimentPaths, experiment: ExperimentBsbm): Promise<void> {
    // Do nothing
  }
}

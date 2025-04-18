import * as Path from 'path';
import * as fs from 'fs-extra';
import type { IExperimentPaths } from 'jbr';
import { ExperimentHandler } from 'jbr';
import { Templates } from 'solidbench';
import { ExperimentSolidBench } from './ExperimentSolidBench';

/**
 * An experiment handler for the SolidBench social network benchmark.
 */
export class ExperimentHandlerSolidBench extends ExperimentHandler<ExperimentSolidBench> {
  public constructor() {
    super('solidbench', ExperimentSolidBench.name);
  }

  public getDefaultParams(experimentPaths: IExperimentPaths): Record<string, any> {
    return {
      scale: '0.1',
      configEnhance: 'input/config-enhancer.json',
      configFragmenter: 'input/config-fragmenter.json',
      configQueries: 'input/config-queries.json',
      configServer: 'input/config-server.json',
      configValidation: 'input/config-validation.json',
      validationParamsUrl: Templates.VALIDATION_PARAMS_URL,
      hadoopMemory: '4G',
      dockerfileServer: 'input/dockerfiles/Dockerfile-server',
      endpointUrl: 'http://localhost:3001/sparql',
      serverPort: 3_000,
      serverLogLevel: 'info',
      serverBaseUrl: 'http://solidbench-server:3000/',
      serverResourceConstraints: {
        '@type': 'StaticDockerResourceConstraints',
        cpu_percentage: 100,
      },
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

  public async init(experimentPaths: IExperimentPaths, experiment: ExperimentSolidBench): Promise<void> {
    // Copy config templates
    await Promise.all([
      fs.copyFile(Templates.ENHANCEMENT_CONFIG,
        Path.join(experimentPaths.root, experiment.configEnhance)),
      fs.copyFile(Templates.FRAGMENT_CONFIG,
        Path.join(experimentPaths.root, experiment.configFragment)),
      fs.copyFile(Templates.QUERY_CONFIG,
        Path.join(experimentPaths.root, experiment.configQueries)),
      fs.copyFile(Templates.SERVER_CONFIG,
        Path.join(experimentPaths.root, experiment.configServer)),
      fs.copyFile(Templates.VALIDATION_CONFIG,
        Path.join(experimentPaths.root, experiment.configValidation)),
    ]);

    // Create Dockerfile for server
    await fs.mkdir(Path.join(experimentPaths.input, 'dockerfiles'));
    await fs.copyFile(Path.join(__dirname, 'templates', 'dockerfiles', 'Dockerfile-server'),
      Path.join(experimentPaths.input, 'dockerfiles', 'Dockerfile-server'));

    await experiment.replaceBaseUrlInDir(experimentPaths.root);
  }
}

import * as Path from 'path';
import * as fs from 'fs-extra';
import type { IExperimentPaths } from 'jbr';
import { ExperimentHandler } from 'jbr';
import { Templates } from 'solidbench';
import { ExperimentSolidBench } from './ExperimentSolidBench';

/**
 * An experiment handler for the SolidBench social network benchmark.
 */
export class ExperimentHandlerSolidBench<T extends ExperimentSolidBench = ExperimentSolidBench>
  extends ExperimentHandler<T> {
  public constructor(id = 'solidbench', experimentClassName: string = ExperimentSolidBench.name) {
    super(id, experimentClassName);
  }

  public getDefaultParams(experimentPaths: IExperimentPaths): Record<string, any> {
    return {
      scale: '0.1',
      configEnhance: 'input/config-enhancer.json',
      configFragment: 'input/config-fragmenter.json',
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

  /**
   * Isolates template paths to facilitate straightforward overrides in subclasses.
   */
  protected getTemplates(): Record<'enhance' | 'fragment' | 'queries', string> {
    return {
      enhance: Templates.ENHANCEMENT_CONFIG,
      fragment: Templates.FRAGMENT_CONFIG,
      queries: Templates.QUERY_CONFIG,
    };
  }

  public async init(experimentPaths: IExperimentPaths, experiment: T): Promise<void> {
    const templates = this.getTemplates();

    // Copy config templates
    await Promise.all([
      fs.copyFile(templates.enhance,
        Path.join(experimentPaths.root, experiment.configEnhance)),
      fs.copyFile(templates.fragment,
        Path.join(experimentPaths.root, experiment.configFragment)),
      fs.copyFile(templates.queries,
        Path.join(experimentPaths.root, experiment.configQueries)),
      fs.copyFile(Templates.SERVER_CONFIG,
        Path.join(experimentPaths.root, experiment.configServer)),
      ...experiment.configValidation ?
        [ fs.copyFile(Templates.VALIDATION_CONFIG, Path.join(experimentPaths.root, experiment.configValidation)) ] :
        [],
    ]);

    // Create Dockerfile for server
    await fs.mkdir(Path.join(experimentPaths.input, 'dockerfiles'));
    await fs.copyFile(Path.join(__dirname, 'templates', 'dockerfiles', 'Dockerfile-server'),
      Path.join(experimentPaths.input, 'dockerfiles', 'Dockerfile-server'));

    await experiment.replaceBaseUrlInDir(experimentPaths.root);
  }
}

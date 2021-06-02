import * as Path from 'path';
import * as fs from 'fs-extra';
import { ExperimentHandler } from 'jbr';
import { Templates } from 'ldbc-snb-decentralized/lib/Templates';
import { ExperimentLdbcSnbDecentralized } from './ExperimentLdbcSnbDecentralized';

/**
 * An experiment handler for the LDBC SNB Decentralized benchmark.
 */
export class ExperimentHandlerLdbcSnbDecentralized extends ExperimentHandler<ExperimentLdbcSnbDecentralized> {
  public constructor() {
    super('ldbc-snb-decentralized', ExperimentLdbcSnbDecentralized.name);
  }

  public getDefaultParams(experimentDirectory: string): Record<string, any> {
    return {
      scale: '0.1',
      configGenerateAux: 'input/config-enhancer.json',
      configFragment: 'input/config-fragmenter.json',
      configFragmentAux: 'input/config-fragmenter-auxiliary.json',
      configQueries: 'input/config-queries.json',
      configServer: 'input/config-server.json',
      directoryQueryTemplates: 'input/templates/queries',
      overwriteFilesDuringPrepare: false,
      hadoopMemory: '4G',
      dockerfileServer: 'input/dockerfiles/Dockerfile-server',

      endpointUrl: 'http://localhost:3001/sparql',
      serverPort: 3_000,
      serverLogLevel: 'info',
      serverResourceConstraints: {
        '@type': 'StaticDockerResourceConstraints',
        cpu_percentage: 100,
      },
      queryRunnerReplication: 3,
      queryRunnerWarmupRounds: 1,
      queryRunnerRecordTimestamps: true,
    };
  }

  public getHookNames(): string[] {
    return [ 'hookSparqlEndpoint' ];
  }

  public async init(experimentDirectory: string, experiment: ExperimentLdbcSnbDecentralized): Promise<void> {
    // Copy config templates
    await Promise.all([
      fs.copyFile(Templates.ENHANCEMENT_CONFIG,
        Path.join(experimentDirectory, experiment.configGenerateAux)),
      fs.copyFile(Templates.FRAGMENT_CONFIG,
        Path.join(experimentDirectory, experiment.configFragment)),
      fs.copyFile(Templates.ENHANCEMENT_FRAGMENT_CONFIG,
        Path.join(experimentDirectory, experiment.configFragmentAux)),
      fs.copyFile(Templates.QUERY_CONFIG,
        Path.join(experimentDirectory, experiment.configQueries)),
      fs.copyFile(Templates.SERVER_CONFIG,
        Path.join(experimentDirectory, experiment.configServer)),
      fs.copy(Templates.QUERIES_DIRECTORY,
        Path.join(experimentDirectory, experiment.directoryQueryTemplates)),
    ]);

    // Create Dockerfile for server
    await fs.mkdir(Path.join(experimentDirectory, 'input', 'dockerfiles'));
    await fs.copyFile(Path.join(__dirname, 'templates', 'dockerfiles', 'Dockerfile-server'),
      Path.join(experimentDirectory, 'input', 'dockerfiles', 'Dockerfile-server'));

    // Create empty logs directory
    await fs.mkdir(Path.join(experimentDirectory, 'output', 'logs'));
  }
}

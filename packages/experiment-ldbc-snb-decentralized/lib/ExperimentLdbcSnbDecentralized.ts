import * as Path from 'path';
import Dockerode from 'dockerode';
import * as fs from 'fs-extra';
import { Experiment } from 'jbr';
import type { Hook, ITaskContext } from 'jbr';
import { Generator } from 'ldbc-snb-decentralized/lib/Generator';
import { readQueries, SparqlBenchmarkRunner, writeBenchmarkResults } from 'sparql-benchmark-runner';

/**
 * An experiment instance for the LDBC SNB Decentralized benchmark.
 */
export class ExperimentLdbcSnbDecentralized extends Experiment {
  public readonly scale: string;
  public readonly configGenerateAux: string;
  public readonly configFragment: string;
  public readonly configFragmentAux: string;
  public readonly configQueries: string;
  public readonly configServer: string;
  public readonly directoryQueryTemplates: string;
  public readonly overwriteFilesDuringPrepare: boolean;
  public readonly hadoopMemory: string;
  public readonly dockerfileServer: string;
  public readonly hookSparqlEndpoint: Hook;
  public readonly serverPort: number;
  public readonly serverLogLevel: string;
  public readonly endpointUrl: string;
  public readonly queryRunnerReplication: number;
  public readonly queryRunnerWarmupRounds: number;
  public readonly queryRunnerRecordTimestamps: boolean;

  public constructor(
    scale: string,
    configGenerateAux: string,
    configFragment: string,
    configFragmentAux: string,
    configQueries: string,
    configServer: string,
    directoryQueryTemplates: string,
    overwriteFilesDuringPrepare: boolean,
    hadoopMemory: string,
    dockerfileServer: string,
    hookSparqlEndpoint: Hook,
    serverPort: number,
    serverLogLevel: string,
    endpointUrl: string,
    queryRunnerReplication: number,
    queryRunnerWarmupRounds: number,
    queryRunnerRecordTimestamps: boolean,
  ) {
    super();
    this.scale = scale;
    this.configGenerateAux = configGenerateAux;
    this.configFragment = configFragment;
    this.configFragmentAux = configFragmentAux;
    this.configQueries = configQueries;
    this.configServer = configServer;
    this.directoryQueryTemplates = directoryQueryTemplates;
    this.overwriteFilesDuringPrepare = overwriteFilesDuringPrepare;
    this.hadoopMemory = hadoopMemory;
    this.dockerfileServer = dockerfileServer;
    this.hookSparqlEndpoint = hookSparqlEndpoint;
    this.serverPort = serverPort;
    this.serverLogLevel = serverLogLevel;
    this.endpointUrl = endpointUrl;
    this.queryRunnerReplication = queryRunnerReplication;
    this.queryRunnerWarmupRounds = queryRunnerWarmupRounds;
    this.queryRunnerRecordTimestamps = queryRunnerRecordTimestamps;
  }

  public getServerDockerImageName(context: ITaskContext): string {
    return `jrb-experiment-${Path.basename(context.cwd)}-server`;
  }

  public async prepare(context: ITaskContext): Promise<void> {
    // Prepare hook
    await this.hookSparqlEndpoint.prepare(context);

    // Prepare dataset
    await new Generator({
      verbose: context.verbose,
      cwd: Path.join(context.cwd, 'generated'),
      overwrite: this.overwriteFilesDuringPrepare,
      scale: this.scale,
      enhancementConfig: this.configGenerateAux,
      fragmentConfig: this.configFragment,
      enhancementFragmentConfig: this.configFragmentAux,
      queryConfig: this.configQueries,
      hadoopMemory: this.hadoopMemory,
    }).generate();

    // Build server Dockerfile
    const dockerode = new Dockerode();
    const buildStream = await dockerode.buildImage({
      context: context.cwd,
      src: [ this.dockerfileServer, this.configServer ],
    }, {
      t: this.getServerDockerImageName(context),
      buildargs: {
        CONFIG_SERVER: this.configServer,
        LOG_LEVEL: this.serverLogLevel,
      },
      dockerfile: this.dockerfileServer,
    });
    await new Promise((resolve, reject) => {
      dockerode.modem.followProgress(buildStream, (err: Error, res: any) => err ? reject(err) : resolve(res));
    });
  }

  public async run(context: ITaskContext): Promise<void> {
    // Start server
    const closeServer = await this.startServer(context);

    // Setup SPARQL endpoint
    const closeEndpoint = await this.hookSparqlEndpoint.start(context);

    // Stop processes on force-exit
    async function closeServices(forceExit: boolean): Promise<void> {
      try {
        await closeServer();
      } catch {
        // Ignore errors
      }
      try {
        await closeEndpoint();
      } catch {
        // Ignore errors
      }
      if (forceExit) {
        context.exitProcess();
      }
    }
    process.on('SIGINT', () => closeServices(true));

    // Initiate SPARQL benchmark runner
    const results = await new SparqlBenchmarkRunner({
      endpoint: this.endpointUrl,
      querySets: await readQueries(Path.join(context.cwd, 'generated', 'out-queries')),
      replication: this.queryRunnerReplication,
      warmup: this.queryRunnerWarmupRounds,
      timestampsRecording: this.queryRunnerRecordTimestamps,
      logger: (message: string) => context.logger.info(message),
    }).run();

    // Write results
    const resultsOutput = Path.join(context.cwd, 'output');
    if (!await fs.pathExists(resultsOutput)) {
      await fs.mkdir(resultsOutput);
    }
    context.logger.info(`Writing results to ${resultsOutput}\n`);
    await writeBenchmarkResults(results, Path.join(resultsOutput, 'query-times.csv'), this.queryRunnerRecordTimestamps);

    // Close endpoint and server
    await closeServices(false);
  }

  public async startServer(context: ITaskContext): Promise<() => Promise<void>> {
    // Initialize Docker container
    const dockerode = new Dockerode();
    const container = await dockerode.createContainer({
      Image: this.getServerDockerImageName(context),
      Tty: true,
      AttachStdout: true,
      AttachStderr: true,
      HostConfig: {
        Binds: [
          `${context.cwd}/generated/out-fragments/:/data`,
        ],
        PortBindings: {
          '3000/tcp': [
            { HostPort: `${this.serverPort}` },
          ],
        },
      },
    });

    // Write output to logs
    const out = await container.attach({
      stream: true,
      stdout: true,
      stderr: true,
    });
    // eslint-disable-next-line import/namespace
    out.pipe(fs.createWriteStream(Path.join(context.cwd, 'output', 'logs', 'server.txt'), 'utf8'));

    // Start container
    await container.start();

    return async() => {
      await container.kill();
      await container.remove();
    };
  }
}

import * as Path from 'node:path';
import * as fs from 'fs-extra';
import { HdtConverter, secureProcessHandler } from 'jbr';
import type { Experiment, Hook, ICleanTargets, ITaskContext, IRunTaskContext } from 'jbr';
import type { IResultSerializer } from 'sparql-benchmark-runner';
import {
  SparqlBenchmarkRunner,
  QueryLoaderFile,
  ResultSerializerCsv,
  ResultSerializerRaw,
} from 'sparql-benchmark-runner';
import { runConfig } from 'sparql-query-parameter-instantiator';
import { generateMessageParameters, generatePersonParameters } from './ParameterGenerator';
import { mergeTurtleToNTriples } from './TurtleMerger';

/**
 * An experiment instance for the LDBC Social Network Benchmark (Interactive workload).
 */
export class ExperimentLdbcSnb implements Experiment {
  public static readonly DOCKER_IMAGE_LDBC_SNB_DATAGEN = `rubensworks/ldbc_snb_datagen@sha256:5905733b091ca2cc2cf55b43600644d5682d6357d759c9c69934d1b79087e057`;
  public static readonly TEMPLATES_PATH = Path.join(__dirname, 'templates');
  public readonly scale: string;
  public readonly hadoopMemory: string;
  public readonly queryCount: number;
  public readonly querySeed: number;
  public readonly generateHdt: boolean;
  public readonly hookSparqlEndpoint: Hook;
  public readonly endpointUrl: string;
  public readonly endpointUrlExternal: string;
  public readonly queryRunnerReplication: number;
  public readonly queryRunnerWarmupRounds: number;
  public readonly queryRunnerRequestDelay: number;
  public readonly queryRunnerEndpointAvailabilityCheckTimeout: number;
  public readonly queryRunnerUrlParams: Record<string, any>;
  public readonly queryTimeoutFallback: number | undefined;

  /**
   * @param scale
   * @param hadoopMemory
   * @param queryCount
   * @param querySeed
   * @param generateHdt
   * @param hookSparqlEndpoint
   * @param endpointUrl
   * @param endpointUrlExternal
   * @param queryRunnerReplication
   * @param queryRunnerWarmupRounds
   * @param queryRunnerRequestDelay
   * @param queryRunnerEndpointAvailabilityCheckTimeout
   * @param queryRunnerUrlParams - @range {json}
   * @param queryTimeoutFallback
   */
  public constructor(
    scale: string,
    hadoopMemory: string,
    queryCount: number,
    querySeed: number,
    generateHdt: boolean,
    hookSparqlEndpoint: Hook,
    endpointUrl: string,
    endpointUrlExternal: string | undefined,
    queryRunnerReplication: number,
    queryRunnerWarmupRounds: number,
    queryRunnerRequestDelay: number,
    queryRunnerEndpointAvailabilityCheckTimeout: number,
    queryRunnerUrlParams: Record<string, any>,
    queryTimeoutFallback: number | undefined,
  ) {
    this.scale = scale;
    this.hadoopMemory = hadoopMemory;
    this.queryCount = queryCount;
    this.querySeed = querySeed;
    this.generateHdt = generateHdt;
    this.hookSparqlEndpoint = hookSparqlEndpoint;
    this.endpointUrl = endpointUrl;
    this.endpointUrlExternal = endpointUrlExternal ?? endpointUrl;
    this.queryRunnerReplication = queryRunnerReplication;
    this.queryRunnerWarmupRounds = queryRunnerWarmupRounds;
    this.queryRunnerRequestDelay = queryRunnerRequestDelay;
    this.queryRunnerEndpointAvailabilityCheckTimeout = queryRunnerEndpointAvailabilityCheckTimeout;
    this.queryRunnerUrlParams = queryRunnerUrlParams;
    this.queryTimeoutFallback = queryTimeoutFallback;
  }

  public async prepare(context: ITaskContext, forceOverwriteGenerated: boolean): Promise<void> {
    const generated = context.experimentPaths.generated;
    const outSnb = Path.join(generated, 'out-snb');
    const socialNetwork = Path.join(outSnb, 'social_network');
    const substitutionParameters = Path.join(outSnb, 'substitution_parameters');
    const datasetPath = Path.join(generated, 'dataset.nt');
    const personsPath = Path.join(generated, 'parameters-persons.csv');
    const messagesPath = Path.join(generated, 'parameters-messages.csv');
    const queriesPath = Path.join(generated, 'queries');

    // Prepare hook
    await this.hookSparqlEndpoint.prepare(context, forceOverwriteGenerated);

    // Ensure logs directory exists
    await fs.ensureDir(Path.join(context.experimentPaths.output, 'logs'));

    // Generate dataset and substitution parameters
    context.logger.info(`Generating LDBC SNB dataset`);
    if (!forceOverwriteGenerated && await fs.pathExists(socialNetwork)) {
      context.logger.info(`  Skipped`);
    } else {
      await this.generateDataset(context, outSnb);
    }

    // Merge Turtle files into a single N-Triples file
    context.logger.info(`Merging LDBC SNB dataset into dataset.nt`);
    if (!forceOverwriteGenerated && await fs.pathExists(datasetPath)) {
      context.logger.info(`  Skipped`);
    } else {
      const inputFiles = await ExperimentLdbcSnb.findTurtleFiles(socialNetwork, [ 'static', 'person', 'activity' ]);
      const count = await mergeTurtleToNTriples(inputFiles, datasetPath);
      context.logger.info(`  Merged ${inputFiles.length} files into ${count} triples`);
    }

    // Generate person and message parameters for short queries
    context.logger.info(`Generating LDBC SNB query parameters`);
    if (!forceOverwriteGenerated && await fs.pathExists(personsPath) && await fs.pathExists(messagesPath)) {
      context.logger.info(`  Skipped`);
    } else {
      const persons = await generatePersonParameters(
        Path.join(substitutionParameters, 'interactive_1_param.txt'),
        personsPath,
      );
      const messages = await generateMessageParameters(
        await ExperimentLdbcSnb.findTurtleFiles(socialNetwork, [ 'activity' ]),
        messagesPath,
        Math.max(200, this.queryCount * 20),
        this.querySeed,
      );
      context.logger.info(`  Generated ${persons} person and ${messages} message parameters`);
    }

    // Instantiate queries
    context.logger.info(`Instantiating LDBC SNB queries`);
    if (!forceOverwriteGenerated && await fs.pathExists(queriesPath)) {
      context.logger.info(`  Skipped`);
    } else {
      await this.instantiateQueries(substitutionParameters, personsPath, messagesPath, queriesPath);
    }

    if (this.generateHdt) {
      await new HdtConverter(context, forceOverwriteGenerated, 'ldbc-snb').generate();
    }
  }

  /**
   * Run the LDBC SNB datagen via Docker.
   * @param context Task context.
   * @param outSnb Output directory for the datagen.
   */
  protected async generateDataset(context: ITaskContext, outSnb: string): Promise<void> {
    const paramsPath = Path.join(context.experimentPaths.generated, 'params.ini');
    const paramsTemplate = await fs.readFile(Path.join(ExperimentLdbcSnb.TEMPLATES_PATH, 'params.ini'), 'utf8');
    await fs.writeFile(paramsPath, paramsTemplate.replaceAll('SCALE', this.scale), 'utf8');

    await fs.ensureDir(outSnb);

    await context.docker.imagePuller.pull({ repoTag: ExperimentLdbcSnb.DOCKER_IMAGE_LDBC_SNB_DATAGEN });
    await (await context.docker.containerCreator.start({
      imageName: ExperimentLdbcSnb.DOCKER_IMAGE_LDBC_SNB_DATAGEN,
      env: [ `HADOOP_CLIENT_OPTS=-Xmx${this.hadoopMemory}` ],
      hostConfig: {
        Binds: [
          `${outSnb}:/opt/ldbc_snb_datagen/out`,
          `${paramsPath}:/opt/ldbc_snb_datagen/params.ini`,
        ],
      },
      logFilePath: Path.join(context.experimentPaths.output, 'logs', 'ldbc-snb-generation.txt'),
    // eslint-disable-next-line unicorn/require-array-join-separator -- not an array join
    })).join();
  }

  /**
   * Find all Turtle shards of the given types in the datagen output.
   * @param socialNetwork Path to the `social_network` datagen output directory.
   * @param types Shard types, such as 'person', 'activity', or 'static'.
   */
  public static async findTurtleFiles(socialNetwork: string, types: string[]): Promise<string[]> {
    const pattern = new RegExp(`^social_network_(${types.join('|')})_\\d+_\\d+\\.ttl$`, 'u');
    const files = (await fs.pathExists(socialNetwork) ? await fs.readdir(socialNetwork) : [])
      .filter(file => pattern.test(file))
      .sort((fileA, fileB) => fileA.localeCompare(fileB))
      .map(file => Path.join(socialNetwork, file));
    if (files.length === 0) {
      throw new Error(`Could not find any LDBC SNB ${types.join('/')} files in ${socialNetwork}, check the generation logs`);
    }
    return files;
  }

  /**
   * Instantiate all query templates.
   * @param substitutionParameters Path to the datagen substitution parameters directory.
   * @param personsPath Path to the person parameters CSV file.
   * @param messagesPath Path to the message parameters CSV file.
   * @param queriesPath Output directory for instantiated queries.
   */
  protected async instantiateQueries(
    substitutionParameters: string,
    personsPath: string,
    messagesPath: string,
    queriesPath: string,
  ): Promise<void> {
    await fs.remove(queriesPath);
    await fs.ensureDir(queriesPath);

    const variables: Record<string, any> = {
      'urn:variables:ldbc-snb:count': this.queryCount,
      'urn:variables:ldbc-snb:seed': this.querySeed,
      'urn:variables:ldbc-snb:params:persons': personsPath,
      'urn:variables:ldbc-snb:params:messages': messagesPath,
    };
    for (let i = 1; i <= 14; i++) {
      variables[`urn:variables:ldbc-snb:params:interactive_${i}`] =
        Path.join(substitutionParameters, `interactive_${i}_param.txt`);
    }
    const templatesQueries = Path.join(ExperimentLdbcSnb.TEMPLATES_PATH, 'queries');
    for (const file of await fs.readdir(templatesQueries)) {
      const name = Path.basename(file, '.sparql');
      variables[`urn:variables:ldbc-snb:templates:${name}`] = Path.join(templatesQueries, file);
      variables[`urn:variables:ldbc-snb:output:${name}`] = Path.join(queriesPath, file);
    }

    await runConfig(
      Path.join(ExperimentLdbcSnb.TEMPLATES_PATH, 'query-config.json'),
      { mainModulePath: Path.join(__dirname, '..') },
      { variables },
    );
  }

  public async run(context: IRunTaskContext): Promise<void> {
    // Setup SPARQL endpoint
    const startTime = performance.now();
    const endpointProcessHandler = await this.hookSparqlEndpoint.start(context);
    const closeProcess = secureProcessHandler(endpointProcessHandler, context);

    // Determine query sets
    const queryLoader = new QueryLoaderFile({
      path: Path.join(context.experimentPaths.generated, 'queries'),
      extensions: [ '.sparql' ],
    });
    let querySets = await queryLoader.loadQueries();
    if (context.filter) {
      const filterRegex = new RegExp(context.filter, 'u');
      querySets = Object.fromEntries(Object.entries(querySets)
        .filter(entry => filterRegex.test(entry[0])));
    }

    // Initiate SPARQL benchmark runner
    let stopEndpointStats: () => void;
    const results = await new SparqlBenchmarkRunner({
      endpoint: this.endpointUrl,
      endpointUpCheck: this.endpointUrlExternal,
      querySets,
      replication: this.queryRunnerReplication,
      warmup: this.queryRunnerWarmupRounds,
      requestDelay: this.queryRunnerRequestDelay,
      availabilityCheckTimeout: this.queryRunnerEndpointAvailabilityCheckTimeout,
      logger: (message: string) => process.stderr.write(`${message}\n`),
      additionalUrlParams: new URLSearchParams(this.queryRunnerUrlParams),
      timeout: this.queryTimeoutFallback,
    }).runWithRawResults({
      async onStart() {
        // Measure time it took to start the endpoint
        await fs.writeFile(Path.join(context.experimentPaths.output, 'logs', 'load-time.csv'), `time\n${Math.round(performance.now() - startTime)}`, 'utf-8');

        // Collect stats
        stopEndpointStats = await endpointProcessHandler.startCollectingStats();

        // Breakpoint right before starting queries.
        if (context.breakpointBarrier) {
          await context.breakpointBarrier();
        }
      },
      async onStop() {
        stopEndpointStats();
      },
    });

    // Write results
    const resultSerializer = new ResultSerializerCsv();
    const resultsOutput = context.experimentPaths.output;
    if (!await fs.pathExists(resultsOutput)) {
      await fs.mkdir(resultsOutput);
    }
    context.logger.info(`Writing results to ${resultsOutput}\n`);
    await resultSerializer.serialize(Path.join(resultsOutput, 'query-times.csv'), results.aggregateResults);

    if (results.rawResults) {
      const resultSerializerRaw: IResultSerializer = new ResultSerializerRaw();
      await resultSerializerRaw.serialize(Path.join(resultsOutput, 'query-results-raw.json'), results.rawResults);
    }

    // Close process safely
    await closeProcess();
  }

  public async clean(context: ITaskContext, cleanTargets: ICleanTargets): Promise<void> {
    await this.hookSparqlEndpoint.clean(context, cleanTargets);
  }
}

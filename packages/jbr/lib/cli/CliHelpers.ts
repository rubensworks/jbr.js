import * as Path from 'path';
import * as util from 'util';
import Dockerode from 'dockerode';
import * as fs from 'fs-extra';
import ora from 'ora';
import type { Logger } from 'winston';
import { createLogger, format, transports } from 'winston';
import { CliNpmInstaller } from '../../lib/npm/CliNpmInstaller';
import type { NpmInstaller } from '../../lib/npm/NpmInstaller';
import { VoidNpmInstaller } from '../../lib/npm/VoidNpmInstaller';
import { DockerContainerCreator } from '../docker/DockerContainerCreator';
import { DockerImageBuilder } from '../docker/DockerImageBuilder';
import { DockerImagePuller } from '../docker/DockerImagePuller';
import type { IExperimentPaths, ITaskContext } from '../task/ITaskContext';

export function createExperimentPaths(basePath: string): IExperimentPaths {
  return {
    root: basePath,
    input: Path.join(basePath, 'input'),
    generated: Path.join(basePath, 'generated'),
    output: Path.join(basePath, 'output'),
  };
}

export async function wrapCommandHandler(
  argv: Record<string, any>,
  handler: (context: ITaskContext) => Promise<void>,
): Promise<void> {
  const startTime = process.hrtime();

  // Create context
  const dockerode = new Dockerode(argv.dockerOptions ?
    // eslint-disable-next-line no-sync
    JSON.parse(await fs.readFile(argv.dockerOptions, 'utf8')) :
    undefined);
  const context: ITaskContext = {
    cwd: argv.cwd,
    experimentPaths: createExperimentPaths(argv.cwd),
    mainModulePath: argv.mainModulePath,
    verbose: argv.verbose,
    logger: createCliLogger(argv.verbose ? 'verbose' : 'info'),
    docker: {
      containerCreator: new DockerContainerCreator(dockerode),
      imageBuilder: new DockerImageBuilder(dockerode),
      imagePuller: new DockerImagePuller(dockerode),
    },
    cleanupHandlers: [],
  };

  // Register cleanup handling
  let performingGlobalCleanup = false;
  const globalCleanupHandler = async(): Promise<void> => {
    performingGlobalCleanup = true;
    try {
      for (const cleanupHandler of context.cleanupHandlers) {
        await cleanupHandler();
      }
    } catch (error: unknown) {
      context.logger.error(`${util.format(error)}`);
    }
    // eslint-disable-next-line unicorn/no-process-exit
    process.exit(1);
  };
  process.on('SIGINT', globalCleanupHandler);
  process.on('uncaughtException', globalCleanupHandler);

  // Run handler
  let completed = false;
  try {
    await handler(context);
    completed = true;
  } catch (error: unknown) {
    if (!performingGlobalCleanup) {
      if ('handled' in (<Error>error)) {
        context.logger.error(`${(<Error>error).message}`);
      } else {
        context.logger.error(`${util.format(error)}`);
      }
    }
  } finally {
    if (!performingGlobalCleanup) {
      const endTime = process.hrtime(startTime);
      const seconds = (endTime[0] + endTime[1] / 1_000_000_000).toFixed(2);
      if (completed) {
        context.logger.info(`✨ Done in ${seconds}s`);
      } else {
        context.logger.info(`🚨 Errored in ${seconds}s`);
        // eslint-disable-next-line unicorn/no-process-exit
        process.exit(1);
      }
    }
  }
}

export async function wrapVisualProgress<T>(label: string, handler: () => Promise<T>): Promise<T> {
  const spinner = ora(label).start();
  try {
    return await handler();
  } finally {
    spinner.stop();
  }
}

export function createCliLogger(logLevel: string): Logger {
  return createLogger({
    level: logLevel,
    format: format.combine(
      format.colorize({ all: true, colors: { info: 'white' }}),
      format.timestamp(),
      format.printf(({ message }: Record<string, any>): string => `${message}`),
    ),
    transports: [ new transports.Console({
      stderrLevels: [ 'error', 'warn', 'info', 'verbose', 'debug', 'silly' ],
    }) ],
  });
}

export async function createNpmInstaller(): Promise<NpmInstaller> {
  return await fs.pathExists(`${__dirname}/../../test`) ? new VoidNpmInstaller() : new CliNpmInstaller();
}

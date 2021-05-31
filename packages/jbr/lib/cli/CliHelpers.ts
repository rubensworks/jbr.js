import * as util from 'util';
import ora from 'ora';
import type { Logger } from 'winston';
import { createLogger, format, transports } from 'winston';
import type { ITaskContext } from '../task/ITaskContext';

export async function wrapCommandHandler(
  argv: Record<string, any>,
  handler: (context: ITaskContext) => Promise<void>,
): Promise<void> {
  const startTime = process.hrtime();

  const context: ITaskContext = {
    cwd: argv.cwd,
    mainModulePath: argv.mainModulePath,
    verbose: argv.verbose,
    // eslint-disable-next-line unicorn/no-process-exit
    exitProcess: () => process.exit(),
    logger: createCliLogger(argv.verbose ? 'verbose' : 'info'),
  };
  let completed = false;
  try {
    await handler(context);
    completed = true;
  } catch (error: unknown) {
    if ('handled' in (<Error> error)) {
      context.logger.error(`${(<Error> error).message}`);
    } else {
      context.logger.error(`${util.format(error)}`);
    }
  } finally {
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

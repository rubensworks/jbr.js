import type { Argv } from 'yargs';
import type { ITaskContext } from '../../task/ITaskContext';
import { TaskInitialize } from '../../task/TaskInitialize';
import { createNpmInstaller, wrapCommandHandler, wrapVisualProgress } from '../CliHelpers';
import { command as commandSetHook } from './CommandSetHook';

export const command = 'init <type> <name>';
export const desc = 'Initializes a new experiment';
export function builder(yargs: Argv<any>): Argv<any> {
  return yargs
    .options({
      target: { type: 'string', describe: 'Experiment directory to create', defaultDescription: 'experiment name' },
      type: { type: 'string', describe: 'The type of experiment' },
      force: {
        type: 'boolean',
        alias: 'f',
        describe: 'If existing experiments must be overwritten',
      },
      combinations: {
        type: 'boolean',
        alias: 'c',
        describe: 'Creates a combinations-based experiment',
      },
      next: {
        type: 'boolean',
        describe: 'Install jbr at npm from the experimental next tag',
      },
    });
}
export function handler(argv: Record<string, any>): Promise<void> {
  const { target: targetArg, type, name, force, combinations, next } = <ICommandInitArgs> argv;
  return wrapCommandHandler(argv, async(context: ITaskContext) => {
    const target = targetArg ?? name;
    const npmInstaller = await createNpmInstaller(context, next);
    const output = await wrapVisualProgress(`Initializing new${combinations ? ' combinations-based' : ''} experiment`, async() => new TaskInitialize(
      context,
      type,
      name,
      target,
      force,
      combinations,
      npmInstaller,
    ).init());

    context.logger.info(`Initialized new${combinations ? ' combinations-based' : ''} experiment in ${output.experimentDirectory}`);
    if (output.hookNames.length > 0) {
      context.logger.warn(`\nThis experiment requires handlers for the following hooks before it can be used:`);
      for (const hookName of output.hookNames) {
        context.logger.warn(`  - ${hookName}`);
      }
      context.logger.warn(`Initialize these hooks by calling 'jbr ${commandSetHook}'\n`);
    }
  });
}

interface ICommandInitArgs {
  target: string | undefined;
  type: string;
  name: string;
  force: boolean;
  combinations: boolean;
  next: boolean;
}

import type { Argv } from 'yargs';
import type { ITaskContext } from '../../task/ITaskContext';
import { TaskInitialize } from '../../task/TaskInitialize';
import { createNpmInstaller, wrapCommandHandler, wrapVisualProgress } from '../CliHelpers';
import { command as commandSetHook } from './CommandSetHook';

export const command = 'init <type> <name>';
export const desc = 'Initializes a new experiment';
export const builder = (yargs: Argv<any>): Argv<any> =>
  yargs
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
export const handler = (argv: Record<string, any>): Promise<void> => wrapCommandHandler(argv,
  async(context: ITaskContext) => {
    const target = argv.target || argv.name;
    const npmInstaller = await createNpmInstaller(context, argv.next);
    const output = await wrapVisualProgress(`Initializing new${argv.combinations ? ' combinations-based' : ''} experiment`,
      async() => new TaskInitialize(
        context,
        argv.type,
        argv.name,
        target,
        argv.force,
        argv.combinations,
        npmInstaller,
      ).init());

    context.logger.info(`Initialized new${argv.combinations ? ' combinations-based' : ''} experiment in ${output.experimentDirectory}`);
    if (output.hookNames.length > 0) {
      context.logger.warn(`\nThis experiment requires handlers for the following hooks before it can be used:`);
      for (const hookName of output.hookNames) {
        context.logger.warn(`  - ${hookName}`);
      }
      context.logger.warn(`Initialize these hooks by calling 'jbr ${commandSetHook}'\n`);
    }
  });

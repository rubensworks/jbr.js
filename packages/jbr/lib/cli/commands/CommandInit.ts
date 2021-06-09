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
      forceReInit: {
        type: 'boolean',
        alias: 'f',
        describe: 'If existing experiments must be overwritten',
      },
    });
export const handler = (argv: Record<string, any>): Promise<void> => wrapCommandHandler(argv,
  async(context: ITaskContext) => {
    const target = argv.target || argv.name;
    const npmInstaller = await createNpmInstaller();
    const output = await wrapVisualProgress('Initializing new experiment',
      async() => new TaskInitialize(context, argv.type, argv.name, target, argv.forceReInit, npmInstaller).init());

    context.logger.info(`Initialized new experiment in ${output.experimentDirectory}`);
    if (output.hookNames.length > 0) {
      context.logger.warn(`\nThis experiment requires the following hooks before it can be used:`);
      for (const hookName of output.hookNames) {
        context.logger.warn(`  - ${hookName}`);
      }
      context.logger.warn(`Initialize these hooks by calling 'jbr ${commandSetHook}'\n`);
    }
  });

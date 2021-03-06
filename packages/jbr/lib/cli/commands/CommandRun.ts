import type { Argv } from 'yargs';
import type { ITaskContext } from '../../task/ITaskContext';
import { TaskRun } from '../../task/TaskRun';
import { wrapCommandHandler } from '../CliHelpers';

export const command = 'run';
export const desc = 'Run the current experiment';
export const builder = (yargs: Argv<any>): Argv<any> =>
  yargs
    .options({
      combination: {
        type: 'number',
        alias: 'c',
        describe: 'The combination id to run. If undefined, all combinations will be run.',
      },
    });
export const handler = (argv: Record<string, any>): Promise<void> => wrapCommandHandler(argv,
  async(context: ITaskContext) => new TaskRun(context, argv.combination).run());

import type { Argv } from 'yargs';
import { TaskPack } from '../../../lib/task/TaskPack';
import type { ITaskContext } from '../../task/ITaskContext';
import { wrapCommandHandler } from '../CliHelpers';

export const command = 'pack';
export const desc = 'Create an archive of the experiment output';
export const builder = (yargs: Argv<any>): Argv<any> =>
  yargs
    .options({
      output: {
        type: 'string',
        alias: 'o',
        describe: 'The output file name',
      },
    });
export const handler = (argv: Record<string, any>): Promise<void> => wrapCommandHandler(argv,
  async(context: ITaskContext) => new TaskPack(context, argv.output).pack());

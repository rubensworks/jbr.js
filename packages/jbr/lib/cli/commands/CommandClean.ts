import type { Argv } from 'yargs';
import type { ITaskContext } from '../../task/ITaskContext';
import { TaskClean } from '../../task/TaskClean';
import { wrapCommandHandler } from '../CliHelpers';

export const command = 'clean';
export const desc = 'Cleans up an experiment';
export const builder = (yargs: Argv<any>): Argv<any> =>
  yargs
    .options({
      docker: { type: 'boolean', describe: 'Clean up any Docker entities' },
    })
    .check((argv: Record<string, any>) => {
      if (argv._.length === 1 && argv.docker) {
        return true;
      }
      throw new Error('At least one clean option is required');
    });
export const handler = (argv: Record<string, any>): Promise<void> => wrapCommandHandler(argv,
  async(context: ITaskContext) => new TaskClean(context, argv).clean());

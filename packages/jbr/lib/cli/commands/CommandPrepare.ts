import type { Argv } from 'yargs';

import type { ITaskContext } from '../../task/ITaskContext';
import { TaskPrepare } from '../../task/TaskPrepare';
import { wrapCommandHandler } from '../CliHelpers';

export const command = 'prepare';
export const desc = 'Prepare data for the current experiment';
export const builder = (yargs: Argv<any>): Argv<any> =>
  yargs
    .options({
      force: {
        type: 'boolean',
        alias: 'f',
        describe: 'If generated/ must be overwritten',
      },
    });
export const handler = (argv: Record<string, any>): Promise<void> => wrapCommandHandler(argv,
  async(context: ITaskContext) => new TaskPrepare(context, argv.force).prepare());

import type { Argv } from 'yargs';

import type { ITaskContext } from '../../task/ITaskContext';
import { TaskPrepare } from '../../task/TaskPrepare';
import { wrapCommandHandler } from '../CliHelpers';

export const command = 'prepare';
export const desc = 'Prepare data for the current experiment';
export function builder(yargs: Argv<any>): Argv<any> {
  return yargs
    .options({
      force: {
        type: 'boolean',
        alias: 'f',
        describe: 'If generated/ must be overwritten',
      },
      combination: {
        type: 'number',
        alias: 'c',
        describe: 'The combination id to run. If undefined, all combinations will be run.',
      },
    });
}
export function handler(argv: Record<string, any>): Promise<void> {
  return wrapCommandHandler(
    argv,
    // eslint-disable-next-line ts/no-unsafe-argument -- TODO: type properly, tracked as follow-up typing work
    async(context: ITaskContext) => new TaskPrepare(context, argv.force, argv.combination).prepare(),
  );
}

import type { Argv } from 'yargs';
import { TaskPack } from '../../../lib/task/TaskPack';
import type { ITaskContext } from '../../task/ITaskContext';
import { wrapCommandHandler } from '../CliHelpers';

export const command = 'pack';
export const desc = 'Create an archive of the experiment output';
export function builder(yargs: Argv<any>): Argv<any> {
  return yargs
    .options({
      output: {
        type: 'string',
        alias: 'o',
        describe: 'The output file name',
      },
    });
}
export function handler(argv: Record<string, any>): Promise<void> {
  const { output } = <ICommandPackArgs> argv;
  return wrapCommandHandler(argv, async(context: ITaskContext) => new TaskPack(context, output).pack());
}

interface ICommandPackArgs {
  output?: string;
}

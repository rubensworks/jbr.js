import type { Argv } from 'yargs';
import type { ITaskContext } from '../../task/ITaskContext';
import { TaskRun } from '../../task/TaskRun';
import { wrapCommandHandler } from '../CliHelpers';

export const command = 'run';
export const desc = 'Run the current experiment';
export function builder(yargs: Argv<any>): Argv<any> {
  return yargs
    .options({
      combination: {
        type: 'number',
        alias: 'c',
        describe: 'The combination id to run. If undefined, all combinations will be run.',
      },
      filter: {
        type: 'string',
        alias: 'f',
        describe: 'An optional filter that will be passed to the experiment.',
      },
    });
}
export function handler(argv: Record<string, any>): Promise<void> {
  const { combination, filter } = <ICommandRunArgs> argv;
  return wrapCommandHandler(
    argv,
    async(context: ITaskContext) => new TaskRun(context, combination, filter).run(),
  );
}

interface ICommandRunArgs {
  combination: number | undefined;
  filter: string | undefined;
}

import type { Argv } from 'yargs';
import type { ITaskContext } from '../../task/ITaskContext';
import { TaskValidate } from '../../task/TaskValidate';
import { wrapCommandHandler } from '../CliHelpers';

export const command = 'validate';
export const desc = 'Validate the current experiment';
export const builder = (yargs: Argv<any>): Argv<any> =>
  yargs;
export const handler = (argv: Record<string, any>): Promise<void> => wrapCommandHandler(argv,
  async(context: ITaskContext) => new TaskValidate(context).validate());

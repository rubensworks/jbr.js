import type { Argv } from 'yargs';
import type { ITaskContext } from '../../task/ITaskContext';
import { TaskValidate } from '../../task/TaskValidate';
import { wrapCommandHandler } from '../CliHelpers';

export const command = 'validate';
export const desc = 'Validate the current experiment';
export function builder(yargs: Argv<any>): Argv<any> {
  return yargs;
}
export function handler(argv: Record<string, any>): Promise<void> {
  return wrapCommandHandler(argv, async(context: ITaskContext) => new TaskValidate(context).validate());
}

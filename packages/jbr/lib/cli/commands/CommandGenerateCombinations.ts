import type { Argv } from 'yargs';
import type { ITaskContext } from '../../task/ITaskContext';
import { TaskGenerateCombinations } from '../../task/TaskGenerateCombinations';
import { wrapCommandHandler, wrapVisualProgress } from '../CliHelpers';

export const command = 'generate-combinations';
export const desc = 'Generate combinations of experiment templates';
export function builder(yargs: Argv<any>): Argv<any> {
  return yargs;
}
export function handler(argv: Record<string, any>): Promise<void> {
  return wrapCommandHandler(argv, async(context: ITaskContext) => {
    const combinations = await wrapVisualProgress('Generating experiment combinations', async() => new TaskGenerateCombinations(context).generate());
    context.logger.info(`Generated ${combinations.length} experiment combinations`);
  });
}

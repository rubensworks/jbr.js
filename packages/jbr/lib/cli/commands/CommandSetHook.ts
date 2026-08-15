import type { Argv } from 'yargs';
import type { ITaskContext } from '../../task/ITaskContext';
import { TaskSetHook } from '../../task/TaskSetHook';
import { createNpmInstaller, wrapCommandHandler, wrapVisualProgress } from '../CliHelpers';

export const command = 'set-hook <hook> <handler>';
export const desc = 'Provide a handler for a hook in an experiment';
export function builder(yargs: Argv<any>): Argv<any> {
  return yargs
    .options({
      next: {
        type: 'boolean',
        describe: 'Install jbr at npm from the experimental next tag',
      },
    });
}
export function handler(argv: Record<string, any>): Promise<void> {
  const { next, hook, handler: handlerId } = <ICommandSetHookArgs> argv;
  return wrapCommandHandler(argv, async(context: ITaskContext) => {
    const npmInstaller = await createNpmInstaller(context, next);
    const output = await wrapVisualProgress(
      'Setting hook in experiment',
      async() => new TaskSetHook(context, hook.split('/'), handlerId, npmInstaller).set(),
    );
    context.logger.info(`Handler '${handlerId}' has been set for hook '${hook}' in experiment '${context.experimentName}'`);

    if (output.subHookNames.length > 0) {
      context.logger.warn(`\nThis hook requires the following sub-hooks before it can be used:`);
      for (const hookName of output.subHookNames) {
        context.logger.warn(`  - ${hook}/${hookName}`);
      }
      context.logger.warn(`Initialize these hooks by calling 'jbr ${command}'\n`);
    }
  });
}

interface ICommandSetHookArgs {
  next: boolean;
  hook: string;
  handler: string;
}

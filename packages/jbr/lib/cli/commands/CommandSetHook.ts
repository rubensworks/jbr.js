import * as Path from 'path';
import type { Argv } from 'yargs';
import type { ITaskContext } from '../../task/ITaskContext';
import { TaskSetHook } from '../../task/TaskSetHook';
import { createNpmInstaller, wrapCommandHandler, wrapVisualProgress } from '../CliHelpers';

export const command = 'set-hook <hook> <handler>';
export const desc = 'Provide a handler for a hook in an experiment';
export const builder = (yargs: Argv<any>): Argv<any> => yargs;
export const handler = (argv: Record<string, any>): Promise<void> => wrapCommandHandler(argv,
  async(context: ITaskContext) => {
    const npmInstaller = await createNpmInstaller();
    const output = await wrapVisualProgress('Setting hook in experiment',
      async() => new TaskSetHook(context, argv.hook.split('/'), argv.handler, npmInstaller).set());
    context.logger.info(`Handler '${argv.handler}' has been set for hook '${argv.hook}' in experiment '${Path.basename(context.experimentPaths.root)}'`);

    if (output.subHookNames.length > 0) {
      context.logger.warn(`\nThis hook requires the following sub-hooks before it can be used:`);
      for (const hookName of output.subHookNames) {
        context.logger.warn(`  - ${argv.hook}/${hookName}`);
      }
      context.logger.warn(`Initialize these hooks by calling 'jbr ${command}'\n`);
    }
  });

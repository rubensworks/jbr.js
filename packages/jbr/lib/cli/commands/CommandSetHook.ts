import * as Path from 'path';
import * as fs from 'fs-extra';
import type { Argv } from 'yargs';
import type { ITaskContext } from '../../task/ITaskContext';
import { TaskSetHook } from '../../task/TaskSetHook';
import { wrapCommandHandler, wrapVisualProgress } from '../CliHelpers';

export const command = 'set-hook <hook> <handler>';
export const desc = 'Provide a handler for a hook in an experiment';
export const builder = (yargs: Argv<any>): Argv<any> => yargs;
export const handler = (argv: Record<string, any>): Promise<void> => wrapCommandHandler(argv,
  async(context: ITaskContext) => {
    await wrapVisualProgress('Setting hook in experiment',
      async() => new TaskSetHook(context, argv.hook, argv.handler, !await fs.pathExists(`${__dirname}/../../../test`)).set());
    context.logger.info(`Handler '${argv.handler}' has been set for hook '${argv.hook}' in experiment '${Path.basename(context.cwd)}'`);
  });

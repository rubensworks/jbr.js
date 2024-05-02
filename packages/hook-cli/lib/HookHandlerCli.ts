import type { IExperimentPaths } from 'jbr';
import { HookHandler } from 'jbr';
import { HookCli } from './HookCli';

/**
 * Hook handler for a CLI command.
 */
export class HookHandlerCli extends HookHandler<HookCli> {
  public constructor() {
    super('cli', HookCli.name);
  }

  public getDefaultParams(experimentPaths: IExperimentPaths): Record<string, any> {
    return {
      command: 'echo "TODO: start a SPARQL endpoint here"',
    };
  }

  public getSubHookNames(): string[] {
    return [];
  }

  public async init(experimentPaths: IExperimentPaths, hookHandler: HookCli): Promise<void> {
    // Nothing to init
  }
}

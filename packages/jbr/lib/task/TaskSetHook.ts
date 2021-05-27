import * as Path from 'path';
import * as spawn from 'cross-spawn';
import * as fs from 'fs-extra';
import { ErrorHandled } from '../cli/ErrorHandled';
import { ExperimentLoader } from './ExperimentLoader';
import type { ITaskContext } from './ITaskContext';

/**
 * Sets a handler for a given experiment's hook
 */
export class TaskSetHook {
  private readonly context: ITaskContext;
  private readonly hookName: string;
  private readonly handlerTypeId: string;
  private readonly invokeNpmInstall: boolean;

  public constructor(
    context: ITaskContext,
    hookName: string,
    handlerTypeId: string,
    invokeNpmInstall: boolean,
  ) {
    this.context = context;
    this.hookName = hookName;
    this.handlerTypeId = handlerTypeId;
    this.invokeNpmInstall = invokeNpmInstall;
  }

  public async set(): Promise<void> {
    // Invoke npm install for hook
    if (this.invokeNpmInstall) {
      const hookPackageName = `@jrb-hook/${this.handlerTypeId}`;
      const { error } = spawn.sync('npm', [ 'install', hookPackageName ], {
        stdio: 'inherit',
        cwd: this.context.cwd,
      });
      if (error) {
        throw error;
      }
    }

    // Resolve hook type
    const experimentLoader = await ExperimentLoader.build(this.context.mainModulePath);
    const handlerTypes = await experimentLoader.discoverHookHandlers();
    const handlerTypeWrapped = handlerTypes[this.handlerTypeId];
    if (!handlerTypeWrapped) {
      throw new Error(`Invalid hook type '${this.handlerTypeId}'. Must be one of '${Object.keys(handlerTypes).join(', ')}'`);
    }
    const { handler: handlerType, contexts } = handlerTypeWrapped;

    // Read config file
    const configPath = Path.join(this.context.cwd, ExperimentLoader.CONFIG_NAME);
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    const experimentIri = config['@id'];

    // Find hook
    const hook = config[this.hookName];
    if (!hook) {
      throw new ErrorHandled(`Could not find a hook by name '${this.hookName}' in '${configPath}'`);
    }

    // Set hook value
    config[this.hookName] = {
      '@id': `${experimentIri}:${this.hookName}`,
      '@type': handlerType.hookClassName,
      ...handlerType.getDefaultParams(this.context.cwd),
    };

    // Append contexts
    for (const context of contexts) {
      if (!config['@context'].includes(context)) {
        config['@context'].push(context);
      }
    }

    // Write updated config file
    await fs.writeFile(configPath, JSON.stringify(config, null, '  '), 'utf8');

    // Instantiate experiment for validation
    const experiment = await experimentLoader.instantiateFromConfig(configPath, experimentIri);

    // Invoke the handler type's init logic
    await handlerType.init(this.context.cwd, (<any> experiment)[this.hookName]);
  }
}

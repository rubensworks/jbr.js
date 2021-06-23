import * as Path from 'path';
import * as fs from 'fs-extra';
import { ErrorHandled } from '../cli/ErrorHandled';
import type { NpmInstaller } from '../npm/NpmInstaller';
import { ExperimentLoader } from './ExperimentLoader';
import type { ITaskContext } from './ITaskContext';

/**
 * Sets a handler for a given experiment's hook
 */
export class TaskSetHook {
  private readonly context: ITaskContext;
  private readonly hookName: string;
  private readonly handlerTypeId: string;
  private readonly npmInstaller: NpmInstaller;

  public constructor(
    context: ITaskContext,
    hookName: string,
    handlerTypeId: string,
    npmInstaller: NpmInstaller,
  ) {
    this.context = context;
    this.hookName = hookName;
    this.handlerTypeId = handlerTypeId;
    this.npmInstaller = npmInstaller;
  }

  public async set(): Promise<void> {
    // Invoke npm install for hook
    const hookPackageName = `@jbr-hook/${this.handlerTypeId}`;
    await this.npmInstaller.install(this.context.cwd, [ hookPackageName ]);

    // Resolve hook type
    const experimentLoader = await ExperimentLoader.build(this.context.mainModulePath);
    const handlerTypes = await experimentLoader.discoverHookHandlers();
    const handlerTypeWrapped = handlerTypes[this.handlerTypeId];
    if (!handlerTypeWrapped) {
      throw new ErrorHandled(`Invalid hook type '${this.handlerTypeId}'. Must be one of '${Object.keys(handlerTypes).join(', ')}'`);
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
      ...handlerType.getDefaultParams(this.context.experimentPaths),
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
    await handlerType.init(this.context.experimentPaths, (<any> experiment)[this.hookName]);

    // Remove hidden prepared marker file if it exists
    const markerPath = ExperimentLoader.getPreparedMarkerPath(this.context.cwd);
    if (await fs.pathExists(markerPath)) {
      await fs.unlink(markerPath);
      this.context.logger.warn(`Removed 'prepared' flag from this experiment. Invoke 'jbr prepare' before running this experiment.`);
    }
  }
}

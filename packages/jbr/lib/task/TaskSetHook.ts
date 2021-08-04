import * as Path from 'path';
import { inspect } from 'util';
import * as fs from 'fs-extra';
import { ErrorHandled } from '../cli/ErrorHandled';
import { HookNonConfigured } from '../hook/HookNonConfigured';
import type { NpmInstaller } from '../npm/NpmInstaller';
import { ExperimentLoader } from './ExperimentLoader';
import type { ITaskContext } from './ITaskContext';
import { TaskGenerateCombinations } from './TaskGenerateCombinations';

/**
 * Sets a handler for a given experiment's hook
 */
export class TaskSetHook {
  private readonly context: ITaskContext;
  private readonly hookPathName: string[];
  private readonly handlerTypeId: string;
  private readonly npmInstaller: NpmInstaller;

  public constructor(
    context: ITaskContext,
    hookPathName: string[],
    handlerTypeId: string,
    npmInstaller: NpmInstaller,
  ) {
    this.context = context;
    this.hookPathName = hookPathName;
    this.handlerTypeId = handlerTypeId;
    this.npmInstaller = npmInstaller;
  }

  public async set(): Promise<ITaskSetHookOutput> {
    // Invoke npm install for hook
    const hookPackageName = `@jbr-hook/${this.handlerTypeId}`;
    await this.npmInstaller.install(this.context.experimentPaths.root, [ hookPackageName ]);

    // Resolve hook type
    const experimentLoader = await ExperimentLoader.build(this.context.mainModulePath);
    const handlerTypes = await experimentLoader.discoverHookHandlers();
    const handlerTypeWrapped = handlerTypes[this.handlerTypeId];
    if (!handlerTypeWrapped) {
      throw new ErrorHandled(`Invalid hook type '${this.handlerTypeId}'. Must be one of '${Object.keys(handlerTypes).join(', ')}'`);
    }
    const { handler: handlerType, contexts } = handlerTypeWrapped;

    // Read config file
    const combinationsExperiment = await ExperimentLoader.isCombinationsExperiment(this.context.experimentPaths.root);
    const configPath = Path.join(
      this.context.experimentPaths.root,
      combinationsExperiment ? ExperimentLoader.CONFIG_TEMPLATE_NAME : ExperimentLoader.CONFIG_NAME,
    );
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    const experimentIri = config['@id'];

    // Prepare sub-hooks
    const subHookNames = handlerType.getSubHookNames();
    const subHookEntries = subHookNames.reduce<Record<string, any>>((acc, hookName) => {
      acc[hookName] = {
        '@id': `${experimentIri}:${hookName}`,
        '@type': HookNonConfigured.name,
      };
      return acc;
    }, {});

    // Find hook
    TaskSetHook.getObjectPath(configPath, config, this.hookPathName);

    // Set hook value
    TaskSetHook.setObjectPath(configPath, config, this.hookPathName, {
      '@id': `${experimentIri}:${this.hookPathName.join('_')}`,
      '@type': handlerType.hookClassName,
      ...handlerType.getDefaultParams(this.context.experimentPaths),
      ...subHookEntries,
    });

    // Append contexts
    for (const context of contexts) {
      if (!config['@context'].includes(context)) {
        config['@context'].push(context);
      }
    }

    // Write updated config file
    await fs.writeFile(configPath, JSON.stringify(config, null, '  '), 'utf8');

    // For combination-based experiments, re-generate combinations
    if (combinationsExperiment) {
      await new TaskGenerateCombinations(this.context).generate();
    }

    // Instantiate experiment for validation
    const { experiments, experimentPathsArray } = await experimentLoader
      .instantiateExperiments(this.context.experimentPaths.root);

    // Invoke the handler type's init logic
    for (const [ experimentIndex, experiment ] of experiments.entries()) {
      await handlerType.init(experimentPathsArray[experimentIndex],
        TaskSetHook.getObjectPath(configPath, experiment, this.hookPathName));
    }

    // Remove hidden prepared marker file if it exists
    const markerPath = ExperimentLoader.getPreparedMarkerPath(this.context.experimentPaths.root);
    if (await fs.pathExists(markerPath)) {
      await fs.unlink(markerPath);
      this.context.logger.warn(`Removed 'prepared' flag from this experiment. Invoke 'jbr prepare' before running this experiment.`);
    }

    return { subHookNames };
  }

  public static getObjectPath(configPath: string, object: any, path: string[]): any {
    if (path.length === 0) {
      return object;
    }
    const child = object[path[0]];
    if (!child) {
      throw new Error(`Illegal hook path: could not find '${path[0]}' in '${configPath}' on ${inspect(object)}`);
    }
    return TaskSetHook.getObjectPath(configPath, child, path.slice(1));
  }

  public static setObjectPath(configPath: string, object: any, path: string[], value: any): void {
    if (path.length === 0) {
      throw new Error(`Illegal hook path of length 0`);
    } else if (path.length === 1) {
      object[path[0]] = value;
    } else {
      const child = object[path[0]];
      if (!child) {
        throw new Error(`Illegal hook path: could not set a child for '${path[0]}' in '${configPath}' on ${inspect(object)}`);
      }
      return TaskSetHook.setObjectPath(configPath, child, path.slice(1), value);
    }
  }
}

export interface ITaskSetHookOutput {
  subHookNames: string[];
}

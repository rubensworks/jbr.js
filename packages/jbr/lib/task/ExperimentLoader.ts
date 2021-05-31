import * as Path from 'path';
import { ComponentsManager } from 'componentsjs';
import * as fs from 'fs-extra';
import { ErrorHandled } from '../cli/ErrorHandled';
import type { Experiment } from '../experiment/Experiment';
import type { ExperimentHandler } from '../experiment/ExperimentHandler';
import type { HookHandler } from '../hook/HookHandler';

/**
 * Loads and instantiates an experiment by config.
 */
export class ExperimentLoader {
  public static readonly CONFIG_NAME = 'jbr-experiment.json';
  public static readonly PACKAGEJSON_NAME = 'package.json';
  public static readonly PREPAREDMARKER_PATH = [ 'generated', '.prepared' ];
  public static readonly IRI_EXPERIMENT_HANDLER = `https://linkedsoftwaredependencies.org/bundles/npm/jbr/lib/experiment/ExperimentHandler#ExperimentHandler`;
  public static readonly IRI_HOOK_HANDLER = `https://linkedsoftwaredependencies.org/bundles/npm/jbr/lib/hook/HookHandler#HookHandler`;

  private readonly componentsManager: ComponentsManager<any>;

  public constructor(
    componentsManager: ComponentsManager<any>,
  ) {
    this.componentsManager = componentsManager;
  }

  /**
   * Create a new ExperimentLoader based on the given main module path.
   * @param mainModulePath Path from which dependencies should be searched for.
   *                       Typically the path of the current package.
   */
  public static async build<T>(mainModulePath: string): Promise<ExperimentLoader> {
    return new ExperimentLoader(await ExperimentLoader.buildComponentsManager<T>(mainModulePath));
  }

  public static async buildComponentsManager<T>(mainModulePath: string): Promise<ComponentsManager<T>> {
    return await ComponentsManager.build({
      mainModulePath,
      skipContextValidation: true,
      logLevel: 'warn',
    });
  }

  public static getDefaultExperimentIri(experimentName: string): string {
    return `urn:jrb:${experimentName}`;
  }

  /**
   * Instantiate an experiment from the given experiment path.
   * @param experimentPath Path to an experiment directory.
   */
  public async instantiateFromPath<E extends Experiment>(experimentPath: string): Promise<E> {
    // Determine config file
    const configPath = Path.join(experimentPath, ExperimentLoader.CONFIG_NAME);

    // Check if config exists
    if (!await fs.pathExists(configPath)) {
      throw new Error(`Experiment config file could not be found at '${configPath}'`);
    }

    // Determine experiment name and IRI
    const experimentName = Path.basename(experimentPath);
    const experimentIri = ExperimentLoader.getDefaultExperimentIri(experimentName);

    // Instantiate valid config
    return this.instantiateFromConfig(configPath, experimentIri);
  }

  /**
   * Instantiate an experiment from the given config file.
   * @param configPath Path to an experiment configuration file.
   * @param experimentIri IRI of the experiment to instantiate.
   */
  public async instantiateFromConfig<E extends Experiment>(configPath: string, experimentIri: string): Promise<E> {
    await this.componentsManager.configRegistry.register(configPath);
    return await this.componentsManager.instantiate(experimentIri);
  }

  protected async discoverComponents<C extends { id: string }>(componentType: string):
  Promise<Record<string, { handler: C; contexts: string[] }>> {
    // Index available package.json by package name
    const packageJsons: Record<string, { contents: any; path: string }> = {};
    for (const [ path, packageJson ] of Object.entries(this.componentsManager.moduleState.packageJsons)) {
      packageJsons[packageJson.name] = { contents: packageJson, path };
    }

    // Collect and instantiate all available experiment handlers
    const handlers: Record<string, { handler: C; contexts: string[] }> = {};
    for (const component of Object.values(this.componentsManager.componentResources)) {
      if (component.isA(componentType) && component.value !== componentType) {
        const handler = await this.componentsManager.configConstructorPool
          .instantiate(this.componentsManager.objectLoader.createCompactedResource({
            types: component,
          }), {});
        if (handlers[handler.id]) {
          throw new Error(`Double registration of component id '${handler.id}' detected`);
        }

        // Determine contexts for this component's module
        const packageName = component.property.module.property.requireName.value;
        const packageJson = packageJsons[packageName];
        if (!packageJson) {
          throw new ErrorHandled(`Could not find a package.json for '${packageName}'`);
        }
        const contexts = Object.keys(packageJson.contents['lsd:contexts']);

        handlers[handler.id] = { handler, contexts };
      }
    }

    return handlers;
  }

  public discoverExperimentHandlers():
  Promise<Record<string, { handler: ExperimentHandler<any>; contexts: string[] }>> {
    return this.discoverComponents(ExperimentLoader.IRI_EXPERIMENT_HANDLER);
  }

  public discoverHookHandlers(): Promise<Record<string, { handler: HookHandler<any>; contexts: string[] }>> {
    return this.discoverComponents(ExperimentLoader.IRI_HOOK_HANDLER);
  }

  /**
   * Get the path of the prepared marker file.
   * @param experimentPath Path of an experiment.
   */
  public static getPreparedMarkerPath(experimentPath: string): string {
    return Path.join(experimentPath, ...ExperimentLoader.PREPAREDMARKER_PATH);
  }

  /**
   * Check if the given experiment contains the prepared marker file.
   * @param experimentPath Path of an experiment.
   */
  public static async isExperimentPrepared(experimentPath: string): Promise<boolean> {
    return await fs.pathExists(ExperimentLoader.getPreparedMarkerPath(experimentPath));
  }

  /**
   * Throw an error if the given experiment does not contain the prepared marker file.
   * @param experimentPath Path of an experiment.
   */
  public static async requireExperimentPrepared(experimentPath: string): Promise<void> {
    if (!await ExperimentLoader.isExperimentPrepared(experimentPath)) {
      throw new ErrorHandled(`The experiment at '${experimentPath}' has not been prepared successfully yet, invoke 'jbr prepare' first.`);
    }
  }
}

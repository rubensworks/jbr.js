import * as Path from 'path';
import { ComponentsManager } from 'componentsjs';
import * as fs from 'fs-extra';
import type { CombinationProvider } from '../..';
import { createExperimentPaths } from '../cli/CliHelpers';
import { ErrorHandled } from '../cli/ErrorHandled';
import type { Experiment } from '../experiment/Experiment';
import type { ExperimentHandler } from '../experiment/ExperimentHandler';
import type { HookHandler } from '../hook/HookHandler';
import type { IExperimentPaths } from './ITaskContext';

/**
 * Loads and instantiates an experiment by config.
 */
export class ExperimentLoader {
  public static readonly CONFIG_NAME = 'jbr-experiment.json';
  public static readonly CONFIG_TEMPLATE_NAME = 'jbr-experiment.json.template';
  public static readonly COMBINATIONS_NAME = 'jbr-combinations.json';
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
   * Instantiate experiments from the given experiment path.
   * @param experimentPath Path to an experiment directory.
   */
  public async instantiateExperiments(experimentPath: string): Promise<{
    experiments: Experiment[];
    experimentPathsArray: IExperimentPaths[];
    combinationProvider?: CombinationProvider;
  }> {
    // Determine experiment name and IRI
    const experimentName = Path.basename(experimentPath);
    const experimentIri = ExperimentLoader.getDefaultExperimentIri(experimentName);

    // Check if combinations file exists
    const configPaths: string[] = [];
    const experimentPathsArray: IExperimentPaths[] = [];
    let combinationProvider: CombinationProvider | undefined;
    if (await ExperimentLoader.isCombinationsExperiment(experimentPath)) {
      // Determine combinations
      combinationProvider = await this.instantiateCombinationProvider(experimentPath);
      const combinations = combinationProvider.getFactorCombinations();

      const combinationsPath = Path.join(experimentPath, 'combinations');
      for (const [ combinationId ] of combinations.entries()) {
        // Validate combination
        const combinationIdString = ExperimentLoader.getCombinationIdString(combinationId);
        const combinationInstancePath = Path.join(combinationsPath, combinationIdString);
        if (!await fs.pathExists(combinationInstancePath)) {
          throw new ErrorHandled(`Detected invalid combination-based experiment. It is required to (re-)run 'jbr generate-combinations' first.`);
        }

        // Determine config file
        const combinationInstanceConfigPath = Path.join(combinationInstancePath, ExperimentLoader.CONFIG_NAME);
        configPaths.push(combinationInstanceConfigPath);
        const experimentPaths = createExperimentPaths(combinationInstancePath);
        if (combinationProvider.commonPrepare) {
          experimentPaths.generated = Path.join(experimentPath, 'generated');
        }
        experimentPathsArray.push(experimentPaths);
      }
    } else {
      // Determine config file
      configPaths.push(Path.join(experimentPath, ExperimentLoader.CONFIG_NAME));
      experimentPathsArray.push(createExperimentPaths(experimentPath));
    }

    // Check if config exists
    for (const configPath of configPaths) {
      if (!await fs.pathExists(configPath)) {
        throw new Error(`Experiment config file could not be found at '${configPath}'`);
      }
    }

    // Instantiate valid config
    return {
      experiments: await Promise.all(configPaths
        .map(configPath => this.instantiateFromConfig<Experiment>(configPath, experimentIri))),
      experimentPathsArray,
      combinationProvider,
    };
  }

  /**
   * Instantiate an experiment combinations provider from the given experiment path.
   * @param experimentPath Path to an experiment directory.
   */
  public async instantiateCombinationProvider(experimentPath: string): Promise<CombinationProvider> {
    // Determine combinations name and IRI
    const experimentName = Path.basename(experimentPath);
    const experimentIri = ExperimentLoader.getDefaultExperimentIri(experimentName);
    const combinationsPath = Path.join(experimentPath, ExperimentLoader.COMBINATIONS_NAME);
    const combinationsIri = `${experimentIri}-combinations`;
    return await this.instantiateFromConfig<CombinationProvider>(combinationsPath, combinationsIri);
  }

  /**
   * Instantiate an experiment from the given config file.
   * @param configPath Path to an experiment configuration file.
   * @param experimentIri IRI of the experiment to instantiate.
   */
  public async instantiateFromConfig<E>(configPath: string, experimentIri: string): Promise<E> {
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

  /**
   * Check if the given experiment path is a combinations-based experiment.
   * @param experimentPath Path of an experiment.
   * @throws if the combinations-based experiment is invalid.
   */
  public static async isCombinationsExperiment(experimentPath: string): Promise<boolean> {
    const combinationsPath = Path.join(experimentPath, ExperimentLoader.COMBINATIONS_NAME);
    const combinationsPathExists = await fs.pathExists(combinationsPath);
    const configTemplatePath = Path.join(experimentPath, ExperimentLoader.CONFIG_TEMPLATE_NAME);
    const configTemplatePathExists = await fs.pathExists(configTemplatePath);
    if (combinationsPathExists !== configTemplatePathExists) {
      if (combinationsPathExists) {
        throw new Error(`Found '${ExperimentLoader.COMBINATIONS_NAME}' for a combinations-based experiment, but '${ExperimentLoader.CONFIG_TEMPLATE_NAME}' is missing.`);
      } else {
        throw new Error(`Found '${ExperimentLoader.CONFIG_TEMPLATE_NAME}' for a combinations-based experiment, but '${ExperimentLoader.COMBINATIONS_NAME}' is missing.`);
      }
    }
    return Boolean(combinationsPathExists && configTemplatePathExists);
  }

  /**
   * Throw an error if the given experiment is not a combinations-based experiment.
   * @param experimentPath Path of an experiment.
   */
  public static async requireCombinationsExperiment(experimentPath: string): Promise<void> {
    if (!await ExperimentLoader.isCombinationsExperiment(experimentPath)) {
      throw new Error(`A combinations-based experiments requires the files '${ExperimentLoader.CONFIG_TEMPLATE_NAME}' and '${ExperimentLoader.COMBINATIONS_NAME}'.`);
    }
  }

  /**
   * Convert a given numerical combination id to a string-based id.
   * @param combinationId A numerical combination id.
   */
  public static getCombinationIdString(combinationId: number): string {
    return `combination_${combinationId}`;
  }
}

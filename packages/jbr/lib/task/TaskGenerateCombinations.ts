import Path from 'path';
import * as fs from 'fs-extra';
import type { FactorCombination } from '../factor/CombinationProvider';
import { ExperimentLoader } from './ExperimentLoader';
import type { ITaskContext } from './ITaskContext';
import { TaskInitialize } from './TaskInitialize';

/**
 * Generates combinations based on an experiment template and a combination provider.
 */
export class TaskGenerateCombinations {
  private readonly context: ITaskContext;

  public constructor(
    context: ITaskContext,
  ) {
    this.context = context;
  }

  public async generate(): Promise<FactorCombination[]> {
    await ExperimentLoader.requireCombinationsExperiment(this.context.experimentPaths.root);

    // Determine combinations
    const experimentLoader = await ExperimentLoader.build(this.context.mainModulePath);
    const combinationsProvider = await experimentLoader
      .instantiateCombinationProvider(this.context.experimentPaths.root);
    const combinations = combinationsProvider.getFactorCombinations();

    // Load config template
    const configTemplatePath = Path.join(this.context.experimentPaths.root, ExperimentLoader.CONFIG_TEMPLATE_NAME);
    const configTemplateContents = await fs.readFile(configTemplatePath, 'utf8');

    // Create combination directories and config files
    const combinationsPath = Path.join(this.context.experimentPaths.root, 'combinations');
    if (!await fs.pathExists(combinationsPath)) {
      await fs.mkdir(combinationsPath);
    }
    for (const [ combinationId, combination ] of combinations.entries()) {
      // Create combination directory
      const combinationIdString = ExperimentLoader.getCombinationIdString(combinationId);
      const combinationInstancePath = Path.join(combinationsPath, combinationIdString);
      if (!await fs.pathExists(combinationInstancePath)) {
        await fs.mkdir(combinationInstancePath);
        for (const initDir of TaskInitialize.INIT_DIRS) {
          await fs.mkdir(Path.join(combinationInstancePath, initDir));
        }
      }

      // Create config file
      const combinationInstanceConfigPath = Path.join(combinationInstancePath, ExperimentLoader.CONFIG_NAME);
      const combinationInstanceConfigContents = TaskGenerateCombinations
        .applyFactorCombination(combination, configTemplateContents);
      await fs.writeFile(combinationInstanceConfigPath, combinationInstanceConfigContents);

      // Copy inputs
      const combinationInputPath = Path.join(combinationInstancePath, 'input');
      const templateInputPath = Path.join(this.context.experimentPaths.root, 'input');
      await TaskGenerateCombinations.copyFiles(
        templateInputPath,
        combinationInputPath,
        (contents: string) => TaskGenerateCombinations.applyFactorCombination(combination, contents),
      );

      // Create output softlink from root to combinations
      // Note that these paths are absolute because of Windows...
      const combinationOutputPath = Path.join(this.context.experimentPaths.root, 'output', combinationIdString);
      if (await fs.pathExists(combinationOutputPath)) {
        await fs.unlink(combinationOutputPath);
      }
      await fs.symlink(Path.join(combinationInstancePath, 'output'), combinationOutputPath);
    }

    // Instantiate experiments for validation
    await (await ExperimentLoader.build(this.context.mainModulePath))
      .instantiateExperiments(this.context.experimentPaths.root);

    return combinations;
  }

  /**
   * Instantiate all variables in the form of %FACTOR-variablename% based on the given factor combination.
   * @param combination A factor combination that maps variable names to values.
   * @param content The string content in which variable names should be replaced.
   */
  public static applyFactorCombination(combination: FactorCombination, content: string): string {
    for (const [ key, value ] of Object.entries(combination)) {
      content = content.replace(new RegExp(`%FACTOR-${key}%`, 'gu'), value);
    }
    return content;
  }

  /**
   * Copy all files in the given source to the given destination.
   * Additionally, apply the given mapper function on all copied file contents.
   * @param sourceDirectory Directory to copy from.
   * @param destinationDirectory Directory to copy to.
   * @param mapper A function to map file contents when copying.
   */
  public static async copyFiles(
    sourceDirectory: string,
    destinationDirectory: string,
    mapper: (value: string) => string,
  ): Promise<void> {
    for (const entry of await fs.readdir(sourceDirectory, { withFileTypes: true })) {
      if (entry.isFile()) {
        const contents = await fs.readFile(Path.join(sourceDirectory, entry.name), 'utf8');
        await fs.writeFile(Path.join(destinationDirectory, entry.name), mapper(contents));
      } else if (entry.isDirectory()) {
        await fs.mkdirp(Path.join(destinationDirectory, entry.name));
        await TaskGenerateCombinations.copyFiles(
          Path.join(sourceDirectory, entry.name),
          Path.join(destinationDirectory, entry.name),
          mapper,
        );
      }
    }
  }
}

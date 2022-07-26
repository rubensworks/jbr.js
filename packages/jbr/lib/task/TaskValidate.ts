import Path from 'path';
import * as fs from 'fs-extra';
import { ErrorHandled } from '../cli/ErrorHandled';
import { ExperimentLoader } from './ExperimentLoader';
import type { ITaskContext } from './ITaskContext';

/**
 * Validates an experiment.
 */
export class TaskValidate {
  public static readonly REQUIRED_FILES: string[] = [
    ExperimentLoader.CONFIG_NAME,
    ExperimentLoader.PACKAGEJSON_NAME,
  ];

  public static readonly REQUIRED_FILES_COMBINATIONS: string[] = [
    ExperimentLoader.CONFIG_TEMPLATE_NAME,
    ExperimentLoader.COMBINATIONS_NAME,
    ExperimentLoader.PACKAGEJSON_NAME,
  ];

  private readonly context: ITaskContext;

  public constructor(
    context: ITaskContext,
  ) {
    this.context = context;
  }

  public async validate(): Promise<void> {
    const errors: string[] = [];

    const combinationsBased =
      await fs.pathExists(Path.join(this.context.experimentPaths.root, ExperimentLoader.CONFIG_TEMPLATE_NAME)) ||
      await fs.pathExists(Path.join(this.context.experimentPaths.root, ExperimentLoader.COMBINATIONS_NAME));

    // Check if the required files exist
    for (const fileName of combinationsBased ? TaskValidate.REQUIRED_FILES_COMBINATIONS : TaskValidate.REQUIRED_FILES) {
      if (!await fs.pathExists(Path.join(this.context.experimentPaths.root, fileName))) {
        errors.push(`Missing '${fileName}' file`);
      }
    }

    // Validate the experiment's config file
    try {
      await (await ExperimentLoader.build(this.context.mainModulePath))
        .instantiateExperiments(this.context.experimentName, this.context.experimentPaths.root);
    } catch (error: unknown) {
      errors.push(`Invalid ${ExperimentLoader.CONFIG_NAME} file: ${(<Error>error).message}`);
    }

    // Emit a validation failed message
    if (errors.length > 0) {
      throw new ErrorHandled(`${combinationsBased ? 'Combinations-based experiment' : 'Experiment'} validation failed:
  - ${errors.join('\n  - ')}

Make sure you invoke this command in a directory created with 'jbr init${combinationsBased ? ' -c' : ''}'`);
    }
  }
}

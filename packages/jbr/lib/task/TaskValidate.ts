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

  private readonly context: ITaskContext;

  public constructor(
    context: ITaskContext,
  ) {
    this.context = context;
  }

  public async validate(): Promise<void> {
    const errors: string[] = [];

    // Check if the required files exist
    for (const fileName of TaskValidate.REQUIRED_FILES) {
      if (!await fs.pathExists(Path.join(this.context.cwd, fileName))) {
        errors.push(`Missing '${fileName}' file`);
      }
    }

    // Validate the experiment's config file
    try {
      await (await ExperimentLoader.build(this.context.mainModulePath))
        .instantiateFromPath(this.context.cwd);
    } catch (error: unknown) {
      errors.push(`Invalid ${ExperimentLoader.CONFIG_NAME} file: ${(<Error>error).message}`);
    }

    // Emit a validation failed message
    if (errors.length > 0) {
      throw new ErrorHandled(`Experiment validation failed:
  - ${errors.join('\n  - ')}

Make sure you invoke this command in a directory created with 'jbr init'`);
    }
  }
}

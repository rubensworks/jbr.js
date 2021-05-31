import * as fs from 'fs-extra';
import { ExperimentLoader } from './ExperimentLoader';
import type { ITaskContext } from './ITaskContext';

/**
 * Runs the preparation phase of an experiment.
 */
export class TaskPrepare {
  private readonly context: ITaskContext;

  public constructor(
    context: ITaskContext,
  ) {
    this.context = context;
  }

  public async prepare(): Promise<void> {
    // Remove hidden marker file if it exists
    const markerPath = ExperimentLoader.getPreparedMarkerPath(this.context.cwd);
    if (await fs.pathExists(markerPath)) {
      await fs.unlink(markerPath);
    }

    // Run experiment's prepare logic
    const experiment = await (await ExperimentLoader.build(this.context.mainModulePath))
      .instantiateFromPath(this.context.cwd);
    await experiment.prepare(this.context);

    // Create a hidden marker file in generate/ to indicate that this experiment has been successfully prepared
    await fs.writeFile(markerPath, '', 'utf8');
  }
}

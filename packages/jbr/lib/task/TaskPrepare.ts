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
    const experiment = await (await ExperimentLoader.build(this.context.mainModulePath))
      .instantiateFromPath(this.context.cwd);
    await experiment.prepare(this.context);
  }
}

import { ExperimentLoader } from './ExperimentLoader';
import type { ITaskContext } from './ITaskContext';

/**
 * Runs the run phase of an experiment.
 */
export class TaskRun {
  private readonly context: ITaskContext;

  public constructor(
    context: ITaskContext,
  ) {
    this.context = context;
  }

  public async run(): Promise<void> {
    await ExperimentLoader.requireExperimentPrepared(this.context.cwd);
    const experiment = await (await ExperimentLoader.build(this.context.mainModulePath))
      .instantiateFromPath(this.context.cwd);
    await experiment.run(this.context);
  }
}

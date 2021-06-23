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
    await ExperimentLoader.requireExperimentPrepared(this.context.experimentPaths.root);
    const { experiments, experimentPathsArray } = await (await ExperimentLoader.build(this.context.mainModulePath))
      .instantiateExperiments(this.context.experimentPaths.root);
    for (const [ i, experiment ] of experiments.entries()) {
      await experiment.run({ ...this.context, experimentPaths: experimentPathsArray[i] });
    }
  }
}

import { ExperimentLoader } from './ExperimentLoader';
import type { ICleanTargets } from './ICleanTargets';
import type { ITaskContext } from './ITaskContext';

/**
 * Cleans an experiment.
 */
export class TaskClean {
  private readonly context: ITaskContext;
  private readonly cleanTargets: ICleanTargets;

  public constructor(
    context: ITaskContext,
    cleanTargets: ICleanTargets,
  ) {
    this.context = context;
    this.cleanTargets = cleanTargets;
  }

  public async clean(): Promise<void> {
    const { experiments, experimentPathsArray } = await (await ExperimentLoader
      .build(this.context.mainModulePath)).instantiateExperiments(this.context.experimentPaths.root);
    for (const [ i, experiment ] of experiments.entries()) {
      await experiment.clean({ ...this.context, experimentPaths: experimentPathsArray[i] }, this.cleanTargets);
    }
  }
}


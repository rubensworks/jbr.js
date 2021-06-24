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
    const markerPath = ExperimentLoader.getPreparedMarkerPath(this.context.experimentPaths.root);
    if (await fs.pathExists(markerPath)) {
      await fs.unlink(markerPath);
    }

    // Run experiment's prepare logic
    const { experiments, experimentPathsArray, combinationProvider } = await (await ExperimentLoader
      .build(this.context.mainModulePath)).instantiateExperiments(this.context.experimentPaths.root);
    for (const [ i, experiment ] of experiments.entries()) {
      // Log status
      if (experiments.length > 1 && !combinationProvider?.commonPrepare) {
        this.context.logger.info(`🧩 Preparing experiment combination ${i}`);
      }

      if (i > 0 && combinationProvider?.commonPrepare) {
        // Only run prepare once if the generated output is shared between combinations
        break;
      }
      await experiment.prepare({ ...this.context, experimentPaths: experimentPathsArray[i] });
    }

    // Create a hidden marker file in generate/ to indicate that this experiment has been successfully prepared
    await fs.writeFile(markerPath, '', 'utf8');
  }
}

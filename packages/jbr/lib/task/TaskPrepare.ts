import * as Path from 'node:path';
import * as fs from 'fs-extra';
import { ExperimentLoader } from './ExperimentLoader';
import type { ITaskContext } from './ITaskContext';

/**
 * Runs the preparation phase of an experiment.
 */
export class TaskPrepare {
  private readonly context: ITaskContext;
  private readonly forceOverwriteGenerated: boolean;
  private readonly combination: number | undefined;

  public constructor(
    context: ITaskContext,
    forceOverwriteGenerated: boolean,
    combination: number | undefined,
  ) {
    this.context = context;
    this.forceOverwriteGenerated = forceOverwriteGenerated;
    this.combination = combination;
  }

  public async prepare(): Promise<void> {
    // Remove hidden marker file if it exists
    const markerPath = ExperimentLoader.getPreparedMarkerPath(this.context.experimentPaths.root);
    if (await fs.pathExists(markerPath)) {
      await fs.unlink(markerPath);
    }

    // Run experiment's prepare logic
    const { experiments, experimentPathsArray } = await (await ExperimentLoader
      .build(this.context.mainModulePath))
      .instantiateExperiments(this.context.experimentName, this.context.experimentPaths.root);
    // Combinations can share a generated directory, which then only has to be overwritten once.
    const overwrittenGenerated = new Set<string>();
    for (const [ i, experiment ] of experiments.entries()) {
      if (this.combination === undefined || this.combination === i) {
        this.context.logger.info(`🧩 Preparing experiment combination ${i}`);
        const experimentPaths = experimentPathsArray[i];

        // Create it ourselves, as Docker would create it owned by root when mounting it.
        await fs.ensureDir(experimentPaths.generated);

        await experiment.prepare(
          { ...this.context, experimentPaths },
          this.forceOverwriteGenerated && !overwrittenGenerated.has(experimentPaths.generated),
        );
        overwrittenGenerated.add(experimentPaths.generated);
      }
    }

    // Create a hidden marker file in generate/ to indicate that this experiment has been successfully prepared
    await fs.ensureDir(Path.dirname(markerPath));
    await fs.writeFile(markerPath, '', 'utf8');
  }
}

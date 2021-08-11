import * as Path from 'path';
import * as tar from 'tar';
import { ExperimentLoader } from './ExperimentLoader';
import type { ITaskContext } from './ITaskContext';

/**
 * Archives an experiment.
 */
export class TaskPack {
  private readonly context: ITaskContext;
  private readonly outputName?: string;

  public constructor(
    context: ITaskContext,
    outputName?: string,
  ) {
    this.context = context;
    this.outputName = outputName;
  }

  public async pack(): Promise<void> {
    const { experimentPathsArray } = await (await ExperimentLoader.build(this.context.mainModulePath))
      .instantiateExperiments(this.context.experimentPaths.root);

    await tar.create(
      {
        cwd: this.context.cwd,
        gzip: true,
        file: this.outputName ?? `jbr-${Path.basename(this.context.cwd)}-output.tar.gz`,
      },
      experimentPathsArray.map(experimentPaths => {
        if (!experimentPaths.output.startsWith(this.context.cwd)) {
          throw new Error(`Illegal experiment output path '${experimentPaths.output}' outside of cwd scope '${this.context.cwd}'`);
        }
        return experimentPaths.output.slice(this.context.cwd.length + 1);
      }),
    );
  }
}

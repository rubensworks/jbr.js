import * as Path from 'path';
import * as fs from 'fs-extra';
import type { ITaskContext } from '../task/ITaskContext';

/**
 * A utility to generate HDT files.
 */
export class HdtConverter {
  public static readonly DOCKER_IMAGE_HDT = `rdfhdt/hdt-cpp:v1.3.3`;

  public constructor(
    public readonly context: ITaskContext,
    public readonly forceOverwriteGenerated: boolean,
    public readonly scope: string,
  ) {}

  public async generate(): Promise<void> {
    // Create HDT file
    this.context.logger.info(`Converting WatDiv dataset to HDT`);

    if (!this.forceOverwriteGenerated &&
      await fs.pathExists(Path.join(this.context.experimentPaths.generated, 'dataset.hdt'))) {
      this.context.logger.info(`  Skipped`);
    } else {
      // Pull HDT Docker image
      await this.context.docker.imagePuller.pull({ repoTag: HdtConverter.DOCKER_IMAGE_HDT });

      // Remove any existing index files
      await fs.rm(Path.join(this.context.experimentPaths.generated, 'dataset.hdt.index.v1-1'), { force: true });

      // Convert dataset to HDT
      await (await this.context.docker.containerCreator.start({
        imageName: HdtConverter.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'rdf2hdt', '/output/dataset.nt', '/output/dataset.hdt' ],
        hostConfig: {
          Binds: [
            `${this.context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(this.context.experimentPaths.output, 'logs', `${this.scope}-hdt.txt`),
      })).join();

      // Generate HDT index file
      await (await this.context.docker.containerCreator.start({
        imageName: HdtConverter.DOCKER_IMAGE_HDT,
        cmdArgs: [ 'hdtSearch', '/output/dataset.hdt', '-q', '0' ],
        hostConfig: {
          Binds: [
            `${this.context.experimentPaths.generated}:/output`,
          ],
        },
        logFilePath: Path.join(this.context.experimentPaths.output, 'logs', `${this.scope}-hdt-index.txt`),
      })).join();
    }
  }
}

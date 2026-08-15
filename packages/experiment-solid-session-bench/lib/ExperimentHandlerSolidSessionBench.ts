/* eslint-disable import/no-nodejs-modules -- jbr is a Node CLI benchmark runner */
import * as Path from 'node:path';
import { ExperimentHandlerSolidBench } from '@jbr-experiment/solidbench';
import { Templates } from 'solidbench';
import { ExperimentSolidSessionBench } from './ExperimentSolidSessionBench';

/**
 * An experiment handler for the SolidBench social network benchmark (Session variant).
 */
export class ExperimentHandlerSolidSessionBench extends ExperimentHandlerSolidBench<ExperimentSolidSessionBench> {
  public constructor() {
    super('solid-session-bench', ExperimentSolidSessionBench.name);
  }

  protected getTemplates(): Record<'enhance' | 'fragment' | 'queries', string> {
    return {
      enhance: Templates.ENHANCEMENT_SIMILARITIES_CONFIG,
      fragment: Templates.FRAGMENT_CONFIG_SEQUENCES,
      queries: Templates.QUERY_SEQUENCE_CONFIG,
    };
  }

  protected override getDockerfilePath(): string {
    // Resolve the root of the parent package and point to its template directory
    const parentPackagePath = Path.dirname(require.resolve('@jbr-experiment/solidbench/package.json'));
    return Path.join(parentPackagePath, 'lib', 'templates', 'dockerfiles', 'Dockerfile-server');
  }
}

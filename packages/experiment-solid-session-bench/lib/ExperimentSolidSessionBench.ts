import type { IExperimentSolidBenchOptions } from '@jbr-experiment/solidbench';
import { ExperimentSolidBench } from '@jbr-experiment/solidbench';
import type { QueryLoaderFile } from 'sparql-benchmark-runner';
import {
  SparqlBenchmarkRunner,
} from 'sparql-benchmark-runner';

/**
 * An experiment instance for the SolidBench social network benchmark.
 */
export class ExperimentSolidSessionBench extends ExperimentSolidBench {
  public constructor(options: IExperimentSolidBenchOptions) {
    super(options);
  }

  protected override async createSparqlBenchmarkRunner(queryLoader: QueryLoaderFile):
  Promise<SparqlBenchmarkRunner> {
    return new SparqlBenchmarkRunner({
      endpoint: this.endpointUrl,
      querySets: await queryLoader.loadQueries(),
      querySetsMetadata: await queryLoader.loadQueriesMetadata(),
      replication: this.queryRunnerReplication,
      warmup: this.queryRunnerWarmupRounds,
      requestDelay: this.queryRunnerRequestDelay,
      availabilityCheckTimeout: this.queryRunnerEndpointAvailabilityCheckTimeout,
      logger: (message: string) => process.stderr.write(`${message}\n`),
      additionalUrlParams: new URLSearchParams(this.queryRunnerUrlParams),
      timeout: this.queryTimeoutFallback,
      invalidateCacheBetweenSetExecutions: true,
    });
  }
}

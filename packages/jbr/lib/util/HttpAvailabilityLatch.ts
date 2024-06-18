import type { ITaskContext } from '../task/ITaskContext';

/**
 * A utility class to wait for a server to be available.
 */
export class HttpAvailabilityLatch {
  /**
   * Based on a hrtime start, obtain the duration.
   * @param hrstart process.hrtime
   */
  public countTime(hrstart: [number, number]): number {
    const hrend = process.hrtime(hrstart);
    return hrend[0] * 1_000 + hrend[1] / 1_000_000;
  }

  /**
   * Sleep for a given amount of time.
   * @param durationMs A duration in milliseconds.
   */
  public async sleep(durationMs: number): Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, durationMs));
  }

  /**
   * Check if the server is available.
   */
  public async isEndpointAvailable(url: string): Promise<boolean> {
    let timeoutHandle: NodeJS.Timeout | undefined;
    const promiseTimeout = new Promise<boolean>(resolve => {
      timeoutHandle = setTimeout(() => resolve(false), 1_000);
    });
    const promiseFetch = new Promise<boolean>(resolve => {
      fetch(url, {
        method: 'HEAD',
      }).then(respose => resolve(respose.ok)).catch(() => resolve(false));
    });
    const available = await Promise.race([ promiseTimeout, promiseFetch ]);
    clearTimeout(timeoutHandle);
    return available;
  }

  /**
   * Wait until the server is available.
   */
  public async sleepUntilAvailable(context: ITaskContext, url: string): Promise<void> {
    const hrstart = process.hrtime();
    const elapsed = (): number => Math.round(this.countTime(hrstart) / 1_000);
    while (!await this.isEndpointAvailable(url)) {
      await this.sleep(1_000);
      context.logger.info(`Server at ${url} not available yet, waited for ${elapsed()} seconds...`);
    }
    context.logger.info(`Server at ${url} available after ${elapsed()} seconds`);
  }
}

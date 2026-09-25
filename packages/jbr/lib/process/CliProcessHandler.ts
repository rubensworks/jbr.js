import type { ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import pidtree from 'pidtree';
import pidusage from 'pidusage';
import type { ProcessHandler } from '../experiment/ProcessHandler';

export class CliProcessHandler implements ProcessHandler {
  public readonly childProcess: ChildProcess;
  public readonly statsFilePath?: string;
  public readonly processGroup: boolean;
  public readonly terminationHandlers: Set<(processName: string, error?: Error) => void>;

  public ended: boolean;
  public errored?: Error;

  /**
   * @param childProcess The child process.
   * @param statsFilePath Optional path to write CPU and memory stats of the process tree to.
   * @param processGroup If the child process leads its own process group (spawned as detached),
   *                     so that signals are sent to the whole group, including grandchildren.
   */
  public constructor(
    childProcess: ChildProcess,
    statsFilePath?: string,
    processGroup = false,
  ) {
    this.childProcess = childProcess;
    this.statsFilePath = statsFilePath;
    this.processGroup = processGroup;
    this.terminationHandlers = new Set<() => void>();

    this.ended = false;
    this.childProcess.on('close', () => {
      if (!this.ended && !this.errored) {
        this.onTerminated();
      }

      this.ended = true;
    });
    this.childProcess.on('error', (error: Error) => {
      if (!this.ended && !this.errored) {
        this.onTerminated(error);
      }

      this.errored = error;
    });
  }

  public async close(): Promise<void> {
    if (!this.ended && !this.errored) {
      this.ended = true;

      // Make sure streams are closed.
      this.childProcess.stdin?.end();
      this.childProcess.stdout?.unpipe();
      this.childProcess.stderr?.unpipe();

      // First try a graceful SIGTERM, and if the process hasn't been closed after 3 seconds,
      // forcefully stop with SIGKILL.

      const timeout = setTimeout(() => {
        this.kill('SIGKILL');
      }, 3000);
      const promise = new Promise<void>((resolve, reject) => {
        this.childProcess.on('close', () => {
          clearTimeout(timeout);
          resolve();
        });
        this.childProcess.on('error', reject);
      });

      this.kill('SIGTERM');
      await promise;
    }
  }

  /**
   * Send a signal to the child process, or to its whole process group if enabled.
   * @param signal A signal.
   */
  protected kill(signal: NodeJS.Signals): void {
    if (this.processGroup && this.childProcess.pid !== undefined) {
      try {
        // A negative pid targets the process group
        process.kill(-this.childProcess.pid, signal);
        return;
      } catch {
        // Fall back to only the child process
      }
    }
    this.childProcess.kill(signal);
  }

  public async join(): Promise<void> {
    if (this.errored) {
      throw this.errored;
    }

    if (!this.ended) {
      await new Promise((resolve, reject) => {
        this.childProcess.on('close', resolve);
        this.childProcess.on('error', reject);
      });
    }
  }

  public async startCollectingStats(): Promise<() => void> {
    // Do nothing if we don't have a statsFilePath
    if (!this.statsFilePath) {
      return () => {
        // Do nothing
      };
    }

    // Create a CSV file output stream
    const out = fs.createWriteStream(this.statsFilePath, 'utf8');
    out.write('cpu_percentage,memory\n');

    // Periodically read the stats of the process tree and write a line to the file
    const interval = setInterval(() => {
      this.getProcessTreeStats().then(
        stats => out.write(`${stats.cpu},${stats.memory}\n`),
        () => {
          // Skip samples while processes are starting or stopping
        },
      );
    }, 1000);

    // Stop the interval and close the file when done
    return () => {
      clearInterval(interval);
      out.end();
    };
  }

  /**
   * Sum the CPU and memory usage of the child process and all its descendants.
   */
  protected async getProcessTreeStats(): Promise<{ cpu: number; memory: number }> {
    const pids = await pidtree(this.childProcess.pid!, { root: true });
    const stats = Object.values(await pidusage(pids));
    return {
      cpu: stats.reduce((sum, stat) => sum + stat.cpu, 0),
      memory: stats.reduce((sum, stat) => sum + stat.memory, 0),
    };
  }

  public addTerminationHandler(handler: (processName: string, error?: Error) => void): void {
    this.terminationHandlers.add(handler);
  }

  public removeTerminationHandler(handler: (processName: string, error?: Error) => void): void {
    this.terminationHandlers.delete(handler);
  }

  protected onTerminated(error?: Error): void {
    for (const terminationListener of this.terminationHandlers) {
      terminationListener(`CLI process (${this.childProcess.pid})`, error);
    }
  }
}

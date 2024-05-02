import fs from 'fs';
import type { ChildProcess } from 'node:child_process';
import type { ProcessHandler } from '../experiment/ProcessHandler';

const pidusage = require('pidusage');

export class CliProcessHandler implements ProcessHandler {
  public readonly childProcess: ChildProcess;
  public readonly statsFilePath?: string;
  public readonly terminationHandlers: Set<(processName: string, error?: Error) => void>;

  public ended: boolean;
  public errored?: Error;

  public constructor(
    childProcess: ChildProcess,
    statsFilePath?: string,
  ) {
    this.childProcess = childProcess;
    this.statsFilePath = statsFilePath;
    this.terminationHandlers = new Set<() => void>();

    this.ended = false;
    this.childProcess.on('exit', () => {
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
      // First try a graceful SIGTERM, and if the process hasn't been closed after 3 seconds,
      // forcefully stop with SIGKILL.

      // eslint-disable-next-line no-console
      console.log('STOPPING CHILD PROCESS');
      const timeout = setTimeout(() => {
        // eslint-disable-next-line no-console
        console.log('KILLING CHILD PROCESS');
        this.childProcess.kill('SIGKILL');
      }, 3000);
      const promise = new Promise<void>((resolve, reject) => {
        this.childProcess.on('exit', () => {
          // eslint-disable-next-line no-console
          console.log('CHILD PROCESS HAS BEEN CLOSED');
          clearTimeout(timeout);
          resolve();
        });
        this.childProcess.on('error', reject);
      });

      this.childProcess.kill('SIGTERM');
      await promise;
    }
  }

  public async join(): Promise<void> {
    if (this.errored) {
      throw this.errored;
    }

    if (!this.ended) {
      await new Promise((resolve, reject) => {
        this.childProcess.on('exit', resolve);
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

    // Periodically read the stats and write an line to the file
    const interval = setInterval(() => {
      pidusage(this.childProcess.pid, (err: Error, stats: any) => {
        if (!err) {
          out.write(`${stats.cpu},${stats.memory}\n`);
        }
      });
    }, 1000);

    // Stop the interval and close the file when done
    return () => {
      clearInterval(interval);
      out.end();
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

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import Path from 'node:path';
import type { ITaskContext, ProcessHandler, Hook, IHookStartOptions, ICleanTargets } from 'jbr';
import { CliProcessHandler } from 'jbr';

/**
 * A hook instance for a CLI-based hook.
 */
export class HookCli implements Hook {
  public readonly entrypoint: string[];
  public readonly statsFilePath?: string;
  public readonly logName?: string;

  /**
   * @param entrypoint - The command parts to execute.
   * @param statsFilePath - An optional path to a CSV file in which the stats of the process will be written.
   * @param logName - An optional name to include in the names of the log files, to distinguish multiple CLI hooks.
   */
  public constructor(
    entrypoint: string[],
    statsFilePath?: string,
    logName?: string,
  ) {
    this.entrypoint = entrypoint;
    this.statsFilePath = statsFilePath;
    this.logName = logName;
  }

  public async prepare(_context: ITaskContext, _forceOverwriteGenerated: boolean): Promise<void> {
    // Nothing to prepare
  }

  public async start(context: ITaskContext, _options?: IHookStartOptions): Promise<ProcessHandler> {
    const [ base, ...args ] = this.entrypoint;
    // Run in a separate process group (not supported on Windows), so that wrappers such as npx can be stopped with
    // all their descendants.
    const processGroup = process.platform !== 'win32';
    const childProcess = spawn(base, args, { detached: processGroup });
    const prefix = this.logName ? `cli-${this.logName}` : 'cli';
    childProcess.stdout.pipe(fs.createWriteStream(Path
      .join(context.experimentPaths.output, 'logs', `${prefix}-stdout.txt`), 'utf8'));
    childProcess.stderr.pipe(fs.createWriteStream(Path
      .join(context.experimentPaths.output, 'logs', `${prefix}-stderr.txt`), 'utf8'));
    return new CliProcessHandler(childProcess, this.statsFilePath, processGroup);
  }

  public async clean(_context: ITaskContext, _cleanTargets: ICleanTargets): Promise<void> {
    // Nothing to clean
  }
}

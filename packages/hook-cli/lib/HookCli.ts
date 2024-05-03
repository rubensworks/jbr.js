import fs from 'fs';
import { execFile } from 'node:child_process';
import Path from 'path';
import type { ITaskContext, ProcessHandler, Hook, IHookStartOptions, ICleanTargets } from 'jbr';
import { CliProcessHandler } from 'jbr';

/**
 * A hook instance for a CLI-based hook.
 */
export class HookCli implements Hook {
  public readonly command: string;
  public readonly statsFilePath?: string;

  public constructor(
    command: string,
    statsFilePath?: string,
  ) {
    this.command = command;
    this.statsFilePath = statsFilePath;
  }

  public async prepare(context: ITaskContext, forceOverwriteGenerated: boolean): Promise<void> {
    // Nothing to prepare
  }

  public async start(context: ITaskContext, options?: IHookStartOptions): Promise<ProcessHandler> {
    const [ file, ...args ] = this.command.split(' ');
    const childProcess = execFile(file, args);
    childProcess.stdout!.pipe(fs.createWriteStream(Path
      .join(context.experimentPaths.output, 'logs', 'cli-stdout.txt'), 'utf8'));
    childProcess.stderr!.pipe(fs.createWriteStream(Path
      .join(context.experimentPaths.output, 'logs', 'cli-stderr.txt'), 'utf8'));

    return new CliProcessHandler(childProcess, this.statsFilePath);
  }

  public async clean(context: ITaskContext, cleanTargets: ICleanTargets): Promise<void> {
    // Nothing to clean
  }
}

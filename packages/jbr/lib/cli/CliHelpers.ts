import ora from 'ora';
import type { ITaskContext } from '../task/ITaskContext';

export async function wrapCommandHandler(
  argv: Record<string, any>,
  handler: (context: ITaskContext) => Promise<void>,
): Promise<void> {
  const startTime = process.hrtime();

  const context: ITaskContext = {
    cwd: argv.cwd,
    mainModulePath: argv.mainModulePath,
    verbose: argv.verbose,
    // eslint-disable-next-line unicorn/no-process-exit
    exitProcess: () => process.exit(),
  };
  let completed = false;
  try {
    await handler(context);
    completed = true;
  } catch (error: unknown) {
    if ('handled' in (<Error> error)) {
      process.stderr.write(`${(<Error> error).message}\n`);
    } else {
      throw error;
    }
  } finally {
    const endTime = process.hrtime(startTime);
    const seconds = (endTime[0] + endTime[1] / 1_000_000_000).toFixed(2);
    if (completed) {
      process.stderr.write(`✨ Done in ${seconds}s\n`);
    } else {
      process.stderr.write(`🚨 Errored in ${seconds}s\n`);
    }
  }
}

export async function wrapVisualProgress<T>(label: string, handler: () => Promise<T>): Promise<T> {
  const spinner = ora(label).start();
  const ret = await handler();
  spinner.stop();
  return ret;
}

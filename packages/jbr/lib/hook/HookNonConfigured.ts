import { command as commandSetHook } from '../cli/commands/CommandSetHook';
import { ErrorHandled } from '../cli/ErrorHandled';
import type { ProcessHandler } from '../experiment/ProcessHandler';
import type { ICleanTargets } from '../task/ICleanTargets';
import type { ITaskContext } from '../task/ITaskContext';
import type { Hook } from './Hook';

/**
 * A hook that always errors upon usage.
 *
 * This hook should be used by default for hooks in new experiments, which have not been configured yet.
 */
export class HookNonConfigured implements Hook {
  public async prepare(context: ITaskContext): Promise<void> {
    throw this.makeError();
  }

  public async start(context: ITaskContext): Promise<ProcessHandler> {
    throw this.makeError();
  }

  public async clean(context: ITaskContext, cleanTargets: ICleanTargets): Promise<void> {
    throw this.makeError();
  }

  protected makeError(): Error {
    return new ErrorHandled(`Unable to run an experiment with a non-configured hook ('ExperimentHookNonConfigured').
Initialize this hook via 'jbr ${commandSetHook}'`);
  }
}

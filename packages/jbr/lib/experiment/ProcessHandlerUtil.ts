import type { ITaskContext } from '../task/ITaskContext';
import type { ProcessHandler } from './ProcessHandler';

/**
 * Utility function to register the proper handlers for a process
 * to make sure it handles early termination and cleanup correctly.
 * The returned callback must be invoked at the end of the experiment, to stop the process in a clean manner.
 * @param processHandler The process handler.
 * @param context The task context.
 */
export function secureProcessHandler(processHandler: ProcessHandler, context: ITaskContext): () => Promise<void> {
  // Register termination listener
  function terminationHandler(processName: string): void {
    context.logger.error(`A process (${processName}) exited prematurely.\nThis may be caused by a software error or insufficient memory being allocated to the system or Docker.\nPlease inspect the output logs for more details.`);
    context.closeExperiment();
  }
  processHandler.addTerminationHandler(terminationHandler);

  // Register cleanup handler
  async function cleanupHandler(): Promise<void> {
    // Before closing the actual processes, remove the termination listener
    // Otherwise, we may run into infinite loops
    processHandler.removeTerminationHandler(terminationHandler);

    // Close the processes
    await processHandler.close();
  }
  context.cleanupHandlers.push(cleanupHandler);

  // Return a callback to safely close the process
  return async() => {
    // Remove termination listener
    processHandler.removeTerminationHandler(terminationHandler);

    // Close process
    await cleanupHandler();
  };
}

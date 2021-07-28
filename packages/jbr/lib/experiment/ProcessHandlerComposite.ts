import type { ProcessHandler } from './ProcessHandler';

/**
 * A process handler that combines an array of process handlers.
 */
export class ProcessHandlerComposite implements ProcessHandler {
  private readonly processHandlers: ProcessHandler[];

  public constructor(processHandlers: ProcessHandler[]) {
    this.processHandlers = processHandlers;
  }

  public async close(): Promise<void> {
    const errors: Error[] = [];
    for (const handler of this.processHandlers) {
      try {
        await handler.close();
      } catch (error: unknown) {
        errors.push(<Error> error);
      }
    }
    if (errors.length > 0) {
      throw new Error(errors.map(error => error.message).join(', '));
    }
  }

  public async join(): Promise<void> {
    for (const handler of this.processHandlers) {
      await handler.join();
    }
  }

  public async startCollectingStats(): Promise<() => void> {
    const callbacks = await Promise.all(this.processHandlers
      .map(processHandler => processHandler.startCollectingStats()));
    return () => {
      for (const cb of callbacks) {
        cb();
      }
    };
  }
}

/**
 * Handles a started process.
 */
export abstract class ProcessHandler {
  /**
   * Stop and clean this process.
   */
  public abstract close(): Promise<void>;
}

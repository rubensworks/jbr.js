/**
 * Handles a started process.
 */
export interface ProcessHandler {
  /**
   * Stop and clean this process.
   */
  close: () => Promise<void>;

  /**
   * Start collecting runtime statistics into the target stats file.
   * The returned callback is used to end stat collection.
   */
  startCollectingStats: () => Promise<() => void>;
}

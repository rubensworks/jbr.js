import fs from 'fs';
import type Dockerode from 'dockerode';
import type { ProcessHandler } from '../experiment/ProcessHandler';

/**
 * Docker container wrapped in a convenience datastructure.
 */
export class DockerContainerHandler implements ProcessHandler {
  public readonly container: Dockerode.Container;
  public readonly outputStream: NodeJS.ReadableStream;
  public readonly statsFilePath?: string;
  public readonly terminationHandlers: Set<(processName: string, error?: Error) => void>;

  public ended: boolean;
  public errored?: Error;

  public constructor(container: Dockerode.Container, outputStream: NodeJS.ReadableStream, statsFilePath?: string) {
    this.container = container;
    this.outputStream = outputStream;
    this.ended = false;
    this.outputStream.on('end', () => {
      if (!this.ended && !this.errored) {
        this.onTerminated();
      }

      this.ended = true;
    });
    this.outputStream.on('error', (error: Error) => {
      if (!this.ended && !this.errored) {
        this.onTerminated(error);
      }

      this.errored = error;
    });
    this.statsFilePath = statsFilePath;
    this.terminationHandlers = new Set<() => void>();
  }

  /**
   * Stop and clean this container
   */
  public async close(): Promise<void> {
    try {
      await this.container.kill();
    } catch {
      // Ignore error
    }
    try {
      await this.container.remove();
    } catch {
      // Ignore error
    }
  }

  /**
   * Wait until this container is ended.
   */
  public async join(): Promise<void> {
    if (this.errored) {
      throw this.errored;
    }
    if (!this.ended) {
      await new Promise<void>((resolve, reject) => {
        this.outputStream.on('error', reject);
        this.outputStream.on('end', resolve);
      });
      await this.container.remove();
    }
  }

  public async startCollectingStats(): Promise<() => void> {
    // Just consume the stats stream if we don't have a statsFilePath
    if (!this.statsFilePath) {
      const statsStream: NodeJS.ReadableStream = <any> await this.container.stats({});
      statsStream.resume();
      return () => {
        statsStream.removeAllListeners('data');
      };
    }

    // Create a CSV file output stream
    const out = fs.createWriteStream(this.statsFilePath, 'utf8');
    out.write('cpu_percentage,memory,memory_percentage,received,transmitted\n');

    // Read the stats stream
    const statsStream: NodeJS.ReadableStream = <any> await this.container.stats({});
    statsStream.setEncoding('utf8');
    let first = true;
    statsStream.on('data', (stats: string) => {
      const lines = stats.split('\n');
      for (const line of lines) {
        if (line) {
          // Skip first output, because we don't have a reference to create a delta with (CPU will always be zero)
          if (first) {
            first = false;
            continue;
          }

          let data;
          try {
            data = JSON.parse(line);
          } catch {
            continue;
          }

          // Skip line if network hasn't been set yet, or has been shutdown already
          if (!data.networks) {
            continue;
          }

          // Calculate CPU percentage
          let cpuPercentage = 0;
          const cpuDelta = data.cpu_stats.cpu_usage.total_usage - data.precpu_stats.cpu_usage.total_usage;
          const systemDelta = data.cpu_stats.system_cpu_usage - data.precpu_stats.system_cpu_usage;
          if (systemDelta > 0) {
            cpuPercentage = cpuDelta / systemDelta * 100;
          }

          // Calculate memory usage
          const memory = data.memory_stats.usage;
          const memoryPercentage = data.memory_stats.usage / data.memory_stats.limit * 100;

          // Calculate I/O
          let receivedBytes = 0;
          let transmittedBytes = 0;
          for (const network of Object.keys(data.networks)) {
            receivedBytes += data.networks[network].rx_bytes;
            transmittedBytes += data.networks[network].tx_bytes;
          }

          out.write(`${cpuPercentage},${memory},${memoryPercentage},${receivedBytes},${transmittedBytes}\n`);
        }
      }
    });

    return () => {
      statsStream.removeAllListeners('data');
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
      terminationListener(`Docker container ${this.container.id}`, error);
    }
  }
}

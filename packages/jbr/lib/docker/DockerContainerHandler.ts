import fs from 'fs';
import type Dockerode from 'dockerode';
import type { ProcessHandler } from '../experiment/ProcessHandler';

/**
 * Docker container wrapped in a convenience datastructure.
 */
export class DockerContainerHandler implements ProcessHandler {
  public readonly container: Dockerode.Container;
  public readonly statsFilePath: string;

  public constructor(container: Dockerode.Container, statsFilePath: string) {
    this.container = container;
    this.statsFilePath = statsFilePath;
  }

  /**
   * Stop and clean this container
   */
  public async close(): Promise<void> {
    await this.container.kill();
    await this.container.remove();
  }

  public async startCollectingStats(): Promise<() => void> {
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

          const data = JSON.parse(line);

          // Skip line if network hasn't been set yet, or has been shutdown already
          if (!data.networks) {
            continue;
          }

          // Calculate CPU percentage
          let cpuPercentage = 0;
          const cpuDelta = data.cpu_stats.cpu_usage.total_usage - data.precpu_stats.cpu_usage.total_usage;
          const systemDelta = data.cpu_stats.system_cpu_usage - data.precpu_stats.system_cpu_usage;
          if (systemDelta > 0 && systemDelta > 0) {
            cpuPercentage = cpuDelta / systemDelta * data.cpu_stats.cpu_usage.percpu_usage.length * 100;
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
}
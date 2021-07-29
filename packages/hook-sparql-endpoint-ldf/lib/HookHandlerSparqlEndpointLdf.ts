import Path from 'path';
import * as fs from 'fs-extra';
import type { IExperimentPaths } from 'jbr';
import { HookHandler } from 'jbr';
import { HookSparqlEndpointLdf } from './HookSparqlEndpointLdf';

/**
 * Hook handler for a LDF server-based SPARQL endpoint.
 */
export class HookHandlerSparqlEndpointLdf extends HookHandler<HookSparqlEndpointLdf> {
  public constructor() {
    super('sparql-endpoint-ldf', HookSparqlEndpointLdf.name);
  }

  public getDefaultParams(experimentPaths: IExperimentPaths): Record<string, any> {
    return {
      dockerfile: 'input/dockerfiles/Dockerfile-ldf-server',
      dockerfileCache: 'input/dockerfiles/Dockerfile-ldf-server-cache',
      resourceConstraints: {
        '@type': 'StaticDockerResourceConstraints',
        cpu_percentage: 100,
      },
      config: 'input/config-ldf-server.json',
      portServer: 2_999,
      portCache: 3_000,
      workers: 4,
      maxMemory: 8_192,
      dataset: 'generated/dataset.hdt',
    };
  }

  public getSubHookNames(): string[] {
    return [ 'hookSparqlEndpointLdfEngine' ];
  }

  public async init(experimentPaths: IExperimentPaths, hookHandler: HookSparqlEndpointLdf): Promise<void> {
    // Create Dockerfile for server
    if (!await fs.pathExists(Path.join(experimentPaths.input, 'dockerfiles'))) {
      await fs.mkdir(Path.join(experimentPaths.input, 'dockerfiles'));
    }
    await fs.copyFile(Path.join(__dirname, 'templates', 'dockerfiles', 'Dockerfile-ldf-server'),
      Path.join(experimentPaths.input, 'dockerfiles', 'Dockerfile-ldf-server'));
    await fs.copyFile(Path.join(__dirname, 'templates', 'dockerfiles', 'Dockerfile-ldf-server-cache'),
      Path.join(experimentPaths.input, 'dockerfiles', 'Dockerfile-ldf-server-cache'));

    // Create config for server
    if (!await fs.pathExists(Path.join(experimentPaths.input))) {
      await fs.mkdir(Path.join(experimentPaths.input));
    }
    await fs.copyFile(Path.join(__dirname, 'templates', 'input', 'config-ldf-server.json'),
      Path.join(experimentPaths.input, 'config-ldf-server.json'));
    await fs.copyFile(Path.join(__dirname, 'templates', 'input', 'nginx.conf'),
      Path.join(experimentPaths.input, 'nginx.conf'));
    await fs.copyFile(Path.join(__dirname, 'templates', 'input', 'nginx-default'),
      Path.join(experimentPaths.input, 'nginx-default'));
  }
}

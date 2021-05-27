import Path from 'path';
import * as fs from 'fs-extra';
import { HookHandler } from 'jbr/lib/hook/HookHandler';
import { HookSparqlEndpointComunica } from './HookSparqlEndpointComunica';

/**
 * Hook handler for a Comunica-based SPARQL endpoint.
 */
export class HookHandlerSparqlEndpointComunica extends HookHandler<HookSparqlEndpointComunica> {
  public constructor() {
    super('sparql-endpoint-comunica', HookSparqlEndpointComunica.name);
  }

  public getDefaultParams(experimentDirectory: string): Record<string, any> {
    return {
      dockerfileClient: 'input/dockerfiles/Dockerfile-client',
      configClient: 'input/config-client.json',
      clientPort: 3_001,
      clientLogLevel: 'info',
      queryTimeout: 300,
      maxMemory: 8_192,
    };
  }

  public async init(experimentDirectory: string, hookHandler: HookSparqlEndpointComunica): Promise<void> {
    // Create Dockerfile for client
    if (!await fs.pathExists(Path.join(experimentDirectory, 'input', 'dockerfiles'))) {
      await fs.mkdir(Path.join(experimentDirectory, 'input', 'dockerfiles'));
    }
    await fs.copyFile(Path.join(__dirname, 'templates', 'dockerfiles', 'Dockerfile-client'),
      Path.join(experimentDirectory, 'input', 'dockerfiles', 'Dockerfile-client'));

    // Create config for client
    if (!await fs.pathExists(Path.join(experimentDirectory, 'input'))) {
      await fs.mkdir(Path.join(experimentDirectory, 'input'));
    }
    await fs.copyFile(Path.join(__dirname, 'templates', 'input', 'config-client.json'),
      Path.join(experimentDirectory, 'input', 'config-client.json'));
    await fs.copyFile(Path.join(__dirname, 'templates', 'input', 'context-client.json'),
      Path.join(experimentDirectory, 'input', 'context-client.json'));
  }
}

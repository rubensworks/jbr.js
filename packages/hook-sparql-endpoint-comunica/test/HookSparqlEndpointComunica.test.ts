import Path from 'path';
import type { ITaskContext, DockerContainerHandler, DockerResourceConstraints } from 'jbr';
import { StaticDockerResourceConstraints } from 'jbr';
import { TestLogger } from '../../jbr/test/TestLogger';
import { HookSparqlEndpointComunica } from '../lib/HookSparqlEndpointComunica';

describe('HookSparqlEndpointComunica', () => {
  let endpointHandler: DockerContainerHandler;
  let context: ITaskContext;
  let resourceConstraints: DockerResourceConstraints;
  let hook: HookSparqlEndpointComunica;
  beforeEach(() => {
    endpointHandler = <any> {
      close: jest.fn(),
      startCollectingStats: jest.fn(),
    };
    context = {
      cwd: 'CWD',
      mainModulePath: 'MMP',
      verbose: true,
      cleanupHandlers: [],
      logger: <any> new TestLogger(),
      docker: <any> {
        imageBuilder: {
          build: jest.fn(),
        },
        containerCreator: <any> {
          start: jest.fn(async() => endpointHandler),
        },
        statsCollector: {
          collect: jest.fn(),
        },
      },
    };
    resourceConstraints = new StaticDockerResourceConstraints({}, {});
    hook = new HookSparqlEndpointComunica(
      'input/dockerfiles/Dockerfile-client',
      resourceConstraints,
      'input/config-client.json',
      3_001,
      'info',
      300,
      8_192,
    );
  });

  describe('prepare', () => {
    it('should prepare the hook', async() => {
      await hook.prepare(context);

      expect(context.docker.imageBuilder.build).toHaveBeenCalledWith({
        cwd: context.cwd,
        dockerFile: 'input/dockerfiles/Dockerfile-client',
        auxiliaryFiles: [ 'input/config-client.json' ],
        imageName: 'jrb-experiment-CWD-sparql-endpoint-comunica',
        buildArgs: {
          CONFIG_CLIENT: 'input/config-client.json',
          LOG_LEVEL: 'info',
          MAX_MEMORY: '8192',
          QUERY_TIMEOUT: '300',
        },
      });
    });
  });

  describe('start', () => {
    it('should start the hook', async() => {
      const handler = await hook.start(context);
      expect(handler).toBe(endpointHandler);

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        imageName: 'jrb-experiment-CWD-sparql-endpoint-comunica',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'sparql-endpoint-comunica.txt'),
        statsFilePath: Path.join(context.cwd, 'output', 'stats-sparql-endpoint-comunica.csv'),
        hostConfig: {
          Binds: [
            `${context.cwd}/input/context-client.json:/tmp/context.json`,
          ],
          PortBindings: {
            '3000/tcp': [
              { HostPort: `3001` },
            ],
          },
        },
      });
      expect(endpointHandler.startCollectingStats).not.toHaveBeenCalled();
      expect(endpointHandler.close).not.toHaveBeenCalled();
    });
  });
});

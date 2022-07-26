import Path from 'path';
import type { ITaskContext, DockerContainerHandler, DockerResourceConstraints } from 'jbr';
import { createExperimentPaths, StaticDockerResourceConstraints } from 'jbr';
import { TestLogger } from '../../jbr/test/TestLogger';
import { HookSparqlEndpointComunica } from '../lib/HookSparqlEndpointComunica';

describe('HookSparqlEndpointComunica', () => {
  let endpointHandler: DockerContainerHandler;
  let logger: any;
  let context: ITaskContext;
  let resourceConstraints: DockerResourceConstraints;
  let hook: HookSparqlEndpointComunica;
  beforeEach(() => {
    endpointHandler = <any> {
      close: jest.fn(),
      startCollectingStats: jest.fn(),
    };
    logger = <any> new TestLogger();
    context = {
      cwd: 'CWD',
      experimentPaths: createExperimentPaths('CWD'),
      experimentName: 'EXP',
      mainModulePath: 'MMP',
      verbose: true,
      closeExperiment: jest.fn(),
      cleanupHandlers: [],
      logger,
      docker: <any> {
        imageBuilder: {
          build: jest.fn(),
          getImageName: (ctx: any, suffix: string) => `IMG-${suffix}`,
        },
        containerCreator: <any> {
          start: jest.fn(async() => endpointHandler),
          remove: jest.fn(),
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
      'input/context-client.json',
      3_001,
      'info',
      300,
      8_192,
    );
  });

  describe('prepare', () => {
    it('should prepare the hook', async() => {
      await hook.prepare(context, false);

      expect(context.docker.imageBuilder.build).toHaveBeenCalledWith({
        cwd: context.cwd,
        dockerFile: 'input/dockerfiles/Dockerfile-client',
        auxiliaryFiles: [ 'input/config-client.json' ],
        imageName: 'IMG-sparql-endpoint-comunica',
        buildArgs: {
          CONFIG_CLIENT: 'input/config-client.json',
          LOG_LEVEL: 'info',
          MAX_MEMORY: '8192',
          QUERY_TIMEOUT: '300',
        },
        logger,
      });
    });
  });

  describe('start', () => {
    it('should start the hook', async() => {
      const handler = await hook.start(context);
      expect(handler).toBe(endpointHandler);

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        containerName: 'comunica',
        imageName: 'IMG-sparql-endpoint-comunica',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'sparql-endpoint-comunica.txt'),
        statsFilePath: Path.join(context.cwd, 'output', 'stats-sparql-endpoint-comunica.csv'),
        hostConfig: {
          Binds: [
            `${context.experimentPaths.root}/input/context-client.json:/tmp/context.json`,
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

    it('should start the hook with a network', async() => {
      const handler = await hook.start(context, { docker: { network: 'n1' }});
      expect(handler).toBe(endpointHandler);

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        containerName: 'comunica',
        imageName: 'IMG-sparql-endpoint-comunica',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'sparql-endpoint-comunica.txt'),
        statsFilePath: Path.join(context.cwd, 'output', 'stats-sparql-endpoint-comunica.csv'),
        hostConfig: {
          Binds: [
            `${context.experimentPaths.root}/input/context-client.json:/tmp/context.json`,
          ],
          PortBindings: {
            '3000/tcp': [
              { HostPort: `3001` },
            ],
          },
          NetworkMode: 'n1',
        },
      });
      expect(endpointHandler.startCollectingStats).not.toHaveBeenCalled();
      expect(endpointHandler.close).not.toHaveBeenCalled();
    });
  });

  describe('clean', () => {
    it('should clean without targets', async() => {
      await hook.clean(context, {});

      expect(context.docker.containerCreator.remove).not.toHaveBeenCalled();
    });

    it('should clean with docker target', async() => {
      await hook.clean(context, { docker: true });

      expect(context.docker.containerCreator.remove).toHaveBeenCalledWith('comunica');
    });
  });
});

import Path from 'path';
import type { ITaskContext, DockerContainerHandler, DockerResourceConstraints, Hook } from 'jbr';
import { createExperimentPaths, ProcessHandlerComposite, StaticDockerResourceConstraints } from 'jbr';
import { TestLogger } from '../../jbr/test/TestLogger';
import { HookSparqlEndpointLdf } from '../lib/HookSparqlEndpointLdf';

describe('HookSparqlEndpointLdf', () => {
  let endpointHandler: DockerContainerHandler;
  let context: ITaskContext;
  let resourceConstraints: DockerResourceConstraints;
  let subHook: Hook;
  let hook: HookSparqlEndpointLdf;
  beforeEach(() => {
    endpointHandler = <any> {
      close: jest.fn(),
      startCollectingStats: jest.fn(),
    };
    context = {
      cwd: 'CWD',
      experimentPaths: createExperimentPaths('CWD'),
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
          remove: jest.fn(),
        },
        statsCollector: {
          collect: jest.fn(),
        },
        networkCreator: {
          create: jest.fn(() => ({ network: { id: 'NETWORK' }})),
          remove: jest.fn(),
        },
      },
    };
    resourceConstraints = new StaticDockerResourceConstraints({}, {});
    subHook = {
      prepare: jest.fn(),
      start: jest.fn(),
      clean: jest.fn(),
    };
    hook = new HookSparqlEndpointLdf(
      'input/dockerfiles/Dockerfile-ldf-server',
      'input/dockerfiles/Dockerfile-ldf-server-cache',
      resourceConstraints,
      'input/config-ldf-server.json',
      3_001,
      3_000,
      4,
      8_192,
      'generated/dataset.hdt',
      subHook,
    );
  });

  describe('prepare', () => {
    it('should prepare the hook', async() => {
      await hook.prepare(context);

      expect(context.docker.imageBuilder.build).toHaveBeenCalledWith({
        cwd: context.cwd,
        dockerFile: 'input/dockerfiles/Dockerfile-ldf-server',
        auxiliaryFiles: [ 'input/config-ldf-server.json' ],
        imageName: 'jrb-experiment-CWD-sparql-endpoint-ldf-server',
        buildArgs: {
          SERVER_CONFIG: 'input/config-ldf-server.json',
          SERVER_WORKERS: '4',
          MAX_MEMORY: '8192',
        },
      });

      expect(context.docker.imageBuilder.build).toHaveBeenCalledWith({
        cwd: context.cwd,
        dockerFile: 'input/dockerfiles/Dockerfile-ldf-server-cache',
        imageName: 'jrb-experiment-CWD-sparql-endpoint-ldf-cache',
      });

      expect(subHook.prepare).toHaveBeenCalledWith(context);
    });
  });

  describe('start', () => {
    it('should start the hook', async() => {
      const handler = await hook.start(context);
      expect(handler).toBeInstanceOf(ProcessHandlerComposite);
      expect((<any> handler).processHandlers).toHaveLength(4);

      expect(context.docker.networkCreator.create).toHaveBeenCalledWith({
        Name: 'jrb-experiment-CWD-sparql-endpoint-ldf-network',
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        containerName: 'ldfserver',
        imageName: 'jrb-experiment-CWD-sparql-endpoint-ldf-server',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'sparql-endpoint-ldf-server.txt'),
        statsFilePath: Path.join(context.cwd, 'output', 'stats-sparql-endpoint-ldf-server.csv'),
        hostConfig: {
          Binds: [
            `${context.experimentPaths.root}/generated/dataset.hdt:/data/dataset.hdt`,
            `${context.experimentPaths.root}/generated/dataset.hdt.index.v1-1:/data/dataset.hdt.index.v1-1`,
          ],
          PortBindings: {
            '3000/tcp': [
              { HostPort: `3001` },
            ],
          },
          NetworkMode: 'NETWORK',
        },
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        containerName: 'cache',
        imageName: 'jrb-experiment-CWD-sparql-endpoint-ldf-cache',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'sparql-endpoint-ldf-cache.txt'),
        statsFilePath: Path.join(context.cwd, 'output', 'stats-sparql-endpoint-ldf-cache.csv'),
        hostConfig: {
          Binds: [
            `${context.experimentPaths.root}/input/nginx-default:/etc/nginx/sites-enabled/default`,
            `${context.experimentPaths.root}/input/nginx.conf:/etc/nginx/nginx.conf`,
          ],
          PortBindings: {
            '80/tcp': [
              { HostPort: `3000` },
            ],
          },
          NetworkMode: 'NETWORK',
        },
      });

      expect(subHook.start).toHaveBeenCalledWith(context, { docker: { network: 'NETWORK' }});
    });

    it('should start the hook within a given network', async() => {
      const handler = await hook.start(context, { docker: { network: 'MY-NETWORK' }});
      expect(handler).toBeInstanceOf(ProcessHandlerComposite);
      expect((<any> handler).processHandlers).toHaveLength(3);

      expect(context.docker.networkCreator.create).not.toHaveBeenCalled();

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        containerName: 'ldfserver',
        imageName: 'jrb-experiment-CWD-sparql-endpoint-ldf-server',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'sparql-endpoint-ldf-server.txt'),
        statsFilePath: Path.join(context.cwd, 'output', 'stats-sparql-endpoint-ldf-server.csv'),
        hostConfig: {
          Binds: [
            `${context.experimentPaths.root}/generated/dataset.hdt:/data/dataset.hdt`,
            `${context.experimentPaths.root}/generated/dataset.hdt.index.v1-1:/data/dataset.hdt.index.v1-1`,
          ],
          PortBindings: {
            '3000/tcp': [
              { HostPort: `3001` },
            ],
          },
          NetworkMode: 'MY-NETWORK',
        },
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        containerName: 'cache',
        imageName: 'jrb-experiment-CWD-sparql-endpoint-ldf-cache',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'sparql-endpoint-ldf-cache.txt'),
        statsFilePath: Path.join(context.cwd, 'output', 'stats-sparql-endpoint-ldf-cache.csv'),
        hostConfig: {
          Binds: [
            `${context.experimentPaths.root}/input/nginx-default:/etc/nginx/sites-enabled/default`,
            `${context.experimentPaths.root}/input/nginx.conf:/etc/nginx/nginx.conf`,
          ],
          PortBindings: {
            '80/tcp': [
              { HostPort: `3000` },
            ],
          },
          NetworkMode: 'MY-NETWORK',
        },
      });

      expect(subHook.start).toHaveBeenCalledWith(context, { docker: { network: 'MY-NETWORK' }});
    });

    it('should start the hook for a different dataset path', async() => {
      hook = new HookSparqlEndpointLdf(
        'input/dockerfiles/Dockerfile-ldf-server',
        'input/dockerfiles/Dockerfile-ldf-server-cache',
        resourceConstraints,
        'input/config-ldf-server.json',
        3_001,
        3_000,
        4,
        8_192,
        'input/dataset.hdt',
        subHook,
      );

      const handler = await hook.start(context);
      expect(handler).toBeInstanceOf(ProcessHandlerComposite);
      expect((<any> handler).processHandlers).toHaveLength(4);

      expect(context.docker.networkCreator.create).toHaveBeenCalledWith({
        Name: 'jrb-experiment-CWD-sparql-endpoint-ldf-network',
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        containerName: 'ldfserver',
        imageName: 'jrb-experiment-CWD-sparql-endpoint-ldf-server',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'sparql-endpoint-ldf-server.txt'),
        statsFilePath: Path.join(context.cwd, 'output', 'stats-sparql-endpoint-ldf-server.csv'),
        hostConfig: {
          Binds: [
            `${context.experimentPaths.root}/input/dataset.hdt:/data/dataset.hdt`,
            `${context.experimentPaths.root}/input/dataset.hdt.index.v1-1:/data/dataset.hdt.index.v1-1`,
          ],
          PortBindings: {
            '3000/tcp': [
              { HostPort: `3001` },
            ],
          },
          NetworkMode: 'NETWORK',
        },
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        containerName: 'cache',
        imageName: 'jrb-experiment-CWD-sparql-endpoint-ldf-cache',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'sparql-endpoint-ldf-cache.txt'),
        statsFilePath: Path.join(context.cwd, 'output', 'stats-sparql-endpoint-ldf-cache.csv'),
        hostConfig: {
          Binds: [
            `${context.experimentPaths.root}/input/nginx-default:/etc/nginx/sites-enabled/default`,
            `${context.experimentPaths.root}/input/nginx.conf:/etc/nginx/nginx.conf`,
          ],
          PortBindings: {
            '80/tcp': [
              { HostPort: `3000` },
            ],
          },
          NetworkMode: 'NETWORK',
        },
      });

      expect(subHook.start).toHaveBeenCalledWith(context, { docker: { network: 'NETWORK' }});
    });
  });

  describe('clean', () => {
    it('should clean without targets', async() => {
      await hook.clean(context, {});

      expect(subHook.clean).toHaveBeenCalledWith(context, {});

      expect(context.docker.containerCreator.remove).not.toHaveBeenCalled();
    });

    it('should clean with docker target', async() => {
      await hook.clean(context, { docker: true });

      expect(subHook.clean).toHaveBeenCalledWith(context, { docker: true });

      expect(context.docker.networkCreator.remove)
        .toHaveBeenCalledWith('jrb-experiment-CWD-sparql-endpoint-ldf-network');
      expect(context.docker.containerCreator.remove).toHaveBeenCalledWith('ldfserver');
      expect(context.docker.containerCreator.remove).toHaveBeenCalledWith('cache');
    });
  });
});

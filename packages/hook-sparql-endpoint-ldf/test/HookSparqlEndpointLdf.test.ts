import Path from 'path';
import type { ITaskContext, DockerContainerHandler, DockerResourceConstraints, Hook } from 'jbr';
import { createExperimentPaths, ProcessHandlerComposite, StaticDockerResourceConstraints } from 'jbr';
import { TestLogger } from '../../jbr/test/TestLogger';
import { HookSparqlEndpointLdf } from '../lib/HookSparqlEndpointLdf';

describe('HookSparqlEndpointLdf', () => {
  let endpointHandler: DockerContainerHandler;
  let logger: any;
  let context: ITaskContext;
  let resourceConstraints: DockerResourceConstraints;
  let subHook: Hook;
  let hook: HookSparqlEndpointLdf;
  beforeAll(() => {
    jest.useFakeTimers();
  });

  beforeEach(() => {
    endpointHandler = <any> {
      close: jest.fn(),
      startCollectingStats: jest.fn(),
    };
    logger = new TestLogger();
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
      await hook.prepare(context, false);

      expect(context.docker.imageBuilder.build).toHaveBeenCalledWith({
        cwd: context.cwd,
        dockerFile: 'input/dockerfiles/Dockerfile-ldf-server',
        auxiliaryFiles: [ 'input/config-ldf-server.json' ],
        imageName: 'IMG-sparql-endpoint-ldf-server',
        buildArgs: {
          SERVER_CONFIG: 'input/config-ldf-server.json',
          SERVER_WORKERS: '4',
          MAX_MEMORY: '8192',
        },
        logger,
      });

      expect(context.docker.imageBuilder.build).toHaveBeenCalledWith({
        cwd: context.cwd,
        dockerFile: 'input/dockerfiles/Dockerfile-ldf-server-cache',
        imageName: 'IMG-sparql-endpoint-ldf-cache',
        logger,
      });

      expect(subHook.prepare).toHaveBeenCalledWith(context, false);
    });

    it('should forcefully prepare the hook', async() => {
      await hook.prepare(context, true);

      expect(context.docker.imageBuilder.build).toHaveBeenCalledWith({
        cwd: context.cwd,
        dockerFile: 'input/dockerfiles/Dockerfile-ldf-server',
        auxiliaryFiles: [ 'input/config-ldf-server.json' ],
        imageName: 'IMG-sparql-endpoint-ldf-server',
        buildArgs: {
          SERVER_CONFIG: 'input/config-ldf-server.json',
          SERVER_WORKERS: '4',
          MAX_MEMORY: '8192',
        },
        logger,
      });

      expect(context.docker.imageBuilder.build).toHaveBeenCalledWith({
        cwd: context.cwd,
        dockerFile: 'input/dockerfiles/Dockerfile-ldf-server-cache',
        imageName: 'IMG-sparql-endpoint-ldf-cache',
        logger,
      });

      expect(subHook.prepare).toHaveBeenCalledWith(context, true);
    });
  });

  describe('start', () => {
    beforeEach(() => {
      hook.waitForEndpoint = () => Promise.resolve();
    });

    it('should start the hook', async() => {
      const handler = await hook.start(context);
      expect(handler).toBeInstanceOf(ProcessHandlerComposite);
      expect((<any> handler).processHandlers).toHaveLength(4);

      expect(context.docker.networkCreator.create).toHaveBeenCalledWith({
        Name: 'IMG-sparql-endpoint-ldf-network',
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        containerName: 'ldfserver',
        imageName: 'IMG-sparql-endpoint-ldf-server',
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
        imageName: 'IMG-sparql-endpoint-ldf-cache',
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
        imageName: 'IMG-sparql-endpoint-ldf-server',
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
        imageName: 'IMG-sparql-endpoint-ldf-cache',
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
      hook.waitForEndpoint = () => Promise.resolve();

      const handler = await hook.start(context);
      expect(handler).toBeInstanceOf(ProcessHandlerComposite);
      expect((<any> handler).processHandlers).toHaveLength(4);

      expect(context.docker.networkCreator.create).toHaveBeenCalledWith({
        Name: 'IMG-sparql-endpoint-ldf-network',
      });

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        containerName: 'ldfserver',
        imageName: 'IMG-sparql-endpoint-ldf-server',
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
        imageName: 'IMG-sparql-endpoint-ldf-cache',
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
        .toHaveBeenCalledWith('IMG-sparql-endpoint-ldf-network');
      expect(context.docker.containerCreator.remove).toHaveBeenCalledWith('ldfserver');
      expect(context.docker.containerCreator.remove).toHaveBeenCalledWith('cache');
    });
  });

  describe('countTime', () => {
    it('returns duration in milliseconds', async() => {
      process.hrtime = <any> (() => [ 1, 1_000_000 ]);
      expect(hook.countTime([ 10, 10 ])).toBe(1_001);
    });
  });

  describe('endpointAvailable', () => {
    it('returns true for a valid endpoint', async() => {
      // eslint-disable-next-line no-undef
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(<Response>{ ok: true });
      await expect(hook.endpointAvailable('http://localhost:8080/')).resolves.toBeTruthy();
    });

    it('returns false for an invalid endpoint', async() => {
      // eslint-disable-next-line no-undef
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(<Response>{ ok: false });
      await expect(hook.endpointAvailable('http://localhost:8080/')).resolves.toBeFalsy();
    });

    it('returns false for a hanging request', async() => {
      // eslint-disable-next-line no-undef
      jest.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {
        // Do nothing
      }));
      const available = hook.endpointAvailable('http://localhost:8080/');
      await jest.runAllTimersAsync();
      await expect(available).resolves.toBeFalsy();
    });

    it('returns false for an erroring request', async() => {
      // eslint-disable-next-line no-undef
      jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Endpoint fetch failed'));
      const available = hook.endpointAvailable('http://localhost:8080/');
      await expect(available).resolves.toBeFalsy();
    });
  });

  describe('waitForEndpoint', () => {
    it('returns true for a valid endpoint', async() => {
      // eslint-disable-next-line no-undef
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(<Response>{ ok: true });
      await expect(hook.waitForEndpoint(context, 'http://localhost:8080/')).resolves.toBe(undefined);
    });

    it('returns true for an endpoint that becomes available later', async() => {
      let ok = false;
      // eslint-disable-next-line no-undef
      jest.spyOn(globalThis, 'fetch').mockImplementation(async() => <Response>({ ok }));

      const resolve = jest.fn();
      const p = hook.waitForEndpoint(context, 'http://localhost:8080/');
      p.then(resolve, resolve);

      await jest.runOnlyPendingTimersAsync();
      expect(resolve).not.toHaveBeenCalled();

      ok = true;

      await jest.runOnlyPendingTimersAsync();
      expect(resolve).toHaveBeenCalled();
    });
  });
});

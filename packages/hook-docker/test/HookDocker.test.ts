import Path from 'path';
import type { ITaskContext, DockerContainerHandler, DockerResourceConstraints } from 'jbr';
import { createExperimentPaths, StaticDockerResourceConstraints } from 'jbr';
import { TestLogger } from '../../jbr/test/TestLogger';
import { HookDocker } from '../lib/HookDocker';

describe('HookDocker', () => {
  let endpointHandler: DockerContainerHandler;
  let logger: any;
  let context: ITaskContext;
  let resourceConstraints: DockerResourceConstraints;
  let hook: HookDocker;
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
    hook = new HookDocker(
      'input/dockerfiles/Dockerfile',
      resourceConstraints,
      [ '/generated/dataset.nt:/tmp/dataset.nt' ],
      [ '/input/file.js' ],
      3_001,
      3000,
    );
  });

  describe('prepare', () => {
    it('should prepare the hook', async() => {
      await hook.prepare(context, false);

      expect(context.docker.imageBuilder.build).toHaveBeenCalledWith({
        cwd: context.cwd,
        dockerFile: 'input/dockerfiles/Dockerfile',
        auxiliaryFiles: [ '/input/file.js' ],
        imageName: 'IMG-hook-docker',
        logger,
      });
    });
  });

  describe('start', () => {
    it('should start the hook', async() => {
      const handler = await hook.start(context);
      const additionalMaps = [ '/generated/dataset.nt:/tmp/dataset.nt' ]
        .map(x => Path.join(context.experimentPaths.root, x));
      expect(handler).toBe(endpointHandler);

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        containerName: 'hook-docker',
        imageName: 'IMG-hook-docker',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'hook-docker.txt'),
        statsFilePath: Path.join(context.cwd, 'output', 'stats-hook-docker.csv'),
        hostConfig: {
          Binds: [
            ...additionalMaps,
          ],
          PortBindings: {
            '3001/tcp': [
              { HostPort: `3000` },
            ],
          },
        },
      });
      expect(endpointHandler.startCollectingStats).not.toHaveBeenCalled();
      expect(endpointHandler.close).not.toHaveBeenCalled();
    });

    it('should start the hook with a network', async() => {
      const handler = await hook.start(context, { docker: { network: 'n1' }});
      const additionalMaps = [ '/generated/dataset.nt:/tmp/dataset.nt' ]
        .map(x => Path.join(context.experimentPaths.root, x));
      expect(handler).toBe(endpointHandler);

      expect(context.docker.containerCreator.start).toHaveBeenCalledWith({
        containerName: 'hook-docker',
        imageName: 'IMG-hook-docker',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'hook-docker.txt'),
        statsFilePath: Path.join(context.cwd, 'output', 'stats-hook-docker.csv'),
        hostConfig: {
          Binds: [
            ...additionalMaps,
          ],
          PortBindings: {
            '3001/tcp': [
              { HostPort: `3000` },
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

      expect(context.docker.containerCreator.remove).toHaveBeenCalledWith('hook-docker');
    });
  });
});

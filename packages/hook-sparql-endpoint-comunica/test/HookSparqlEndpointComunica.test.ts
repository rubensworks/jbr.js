import Path from 'path';
import type { ITaskContext,
  DockerContainerCreator,
  DockerContainerHandler, DockerResourceConstraints } from 'jbr';
import {
  DockerStatsCollector,
  StaticDockerResourceConstraints,
} from 'jbr';
import { TestLogger } from '../../jbr/test/TestLogger';
import { HookSparqlEndpointComunica } from '../lib/HookSparqlEndpointComunica';

let buildImage: any;
let modem: any;
jest.mock('dockerode', () => jest.fn().mockImplementation(() => ({
  buildImage,
  modem,
})));

describe('HookSparqlEndpointComunica', () => {
  let context: ITaskContext;
  let resourceConstraints: DockerResourceConstraints;
  let containerCreator: DockerContainerCreator;
  let endpointHandler: DockerContainerHandler;
  let statsCollector: DockerStatsCollector;
  let hook: HookSparqlEndpointComunica;
  beforeEach(() => {
    context = {
      cwd: 'CWD',
      mainModulePath: 'MMP',
      verbose: true,
      exitProcess: jest.fn(),
      logger: <any> new TestLogger(),
    };
    resourceConstraints = new StaticDockerResourceConstraints({}, {});
    statsCollector = {
      collect: jest.fn(),
    };
    endpointHandler = <any> {
      close: jest.fn(),
    };
    containerCreator = {
      start: jest.fn(async() => endpointHandler),
    };
    hook = new HookSparqlEndpointComunica(
      'input/dockerfiles/Dockerfile-client',
      resourceConstraints,
      'input/config-client.json',
      3_001,
      'info',
      300,
      8_192,
      containerCreator,
      statsCollector,
    );

    buildImage = jest.fn(() => 'IMAGE');
    modem = {
      followProgress: jest.fn((stream, cb) => cb(undefined, true)),
    };
    (<any> process).on = jest.fn();
  });

  describe('instantiated with default values', () => {
    it('should have a DockerStatsCollector', async() => {
      hook = new HookSparqlEndpointComunica(
        'input/dockerfiles/Dockerfile-client',
        new StaticDockerResourceConstraints({}, {}),
        'input/config-client.json',
        3_001,
        'info',
        300,
        8_192,
      );
      expect(hook.statsCollector).toBeInstanceOf(DockerStatsCollector);
    });
  });

  describe('prepare', () => {
    it('should prepare the hook', async() => {
      await hook.prepare(context);

      expect(buildImage).toHaveBeenCalledWith({
        context: context.cwd,
        src: [ 'input/dockerfiles/Dockerfile-client', 'input/config-client.json' ],
      }, {
        t: 'jrb-experiment-CWD-sparql-endpoint-comunica',
        buildargs: {
          CONFIG_CLIENT: 'input/config-client.json',
          LOG_LEVEL: 'info',
          MAX_MEMORY: '8192',
          QUERY_TIMEOUT: '300',
        },
        dockerfile: 'input/dockerfiles/Dockerfile-client',
      });
      expect(modem.followProgress).toHaveBeenCalledWith('IMAGE', expect.any(Function));
    });

    it('should propagate modem errors', async() => {
      modem.followProgress = jest.fn((stream, cb) => {
        cb(new Error('Container modem error'));
      });
      await expect(hook.prepare(context)).rejects.toThrowError('Container modem error');
    });
  });

  describe('start', () => {
    it('should start the hook', async() => {
      const stopHook = await hook.start(context);

      expect(containerCreator.start).toHaveBeenCalledWith({
        dockerode: expect.anything(),
        imageName: 'jrb-experiment-CWD-sparql-endpoint-comunica',
        resourceConstraints,
        logFilePath: Path.join('CWD', 'output', 'logs', 'sparql-endpoint-comunica.txt'),
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
      expect(statsCollector.collect)
        .toHaveBeenCalledWith(endpointHandler, Path.join(context.cwd, 'output', 'stats-sparql-endpoint-comunica.csv'));
      expect(endpointHandler.close).not.toHaveBeenCalled();
    });
  });
});

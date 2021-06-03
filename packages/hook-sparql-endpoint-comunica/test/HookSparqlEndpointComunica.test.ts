import Path from 'path';
import type { ITaskContext } from 'jbr';
import { DockerStatsCollector, StaticDockerResourceConstraints } from 'jbr';
import { TestLogger } from '../../jbr/test/TestLogger';
import { HookSparqlEndpointComunica } from '../lib/HookSparqlEndpointComunica';

let buildImage: any;
let createContainer: any;
let modem: any;
jest.mock('dockerode', () => jest.fn().mockImplementation(() => ({
  buildImage,
  createContainer,
  modem,
})));

let files: Record<string, boolean | string> = {};
let filesOut: Record<string, boolean | string> = {};
let dirsOut: Record<string, boolean | string> = {};
jest.mock('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async pathExists(path: string) {
    return path in files;
  },
  async mkdir(dirPath: string) {
    dirsOut[dirPath] = true;
  },
  createWriteStream: jest.fn((path: string) => {
    filesOut[path] = true;
  }),
}));

describe('HookSparqlEndpointComunica', () => {
  let context: ITaskContext;
  let statsCollector: DockerStatsCollector;
  let hook: HookSparqlEndpointComunica;
  let container: any;
  beforeEach(() => {
    context = {
      cwd: 'CWD',
      mainModulePath: 'MMP',
      verbose: true,
      exitProcess: jest.fn(),
      logger: <any> new TestLogger(),
    };
    statsCollector = {
      collect: jest.fn(),
    };
    hook = new HookSparqlEndpointComunica(
      'input/dockerfiles/Dockerfile-client',
      new StaticDockerResourceConstraints({}, {}),
      'input/config-client.json',
      3_001,
      'info',
      300,
      8_192,
      statsCollector,
    );

    buildImage = jest.fn(() => 'IMAGE');
    container = {
      attach: jest.fn(() => ({ pipe: jest.fn() })),
      start: jest.fn(),
      kill: jest.fn(),
      remove: jest.fn(),
    };
    createContainer = jest.fn(() => container);
    modem = {
      followProgress: jest.fn((stream, cb) => cb(undefined, true)),
    };
    files = {};
    dirsOut = {};
    filesOut = {};
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

      expect(createContainer).toHaveBeenCalledWith({
        Image: 'jrb-experiment-CWD-sparql-endpoint-comunica',
        Tty: true,
        AttachStdout: true,
        AttachStderr: true,
        HostConfig: {
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
      expect(container.attach).toHaveBeenCalledWith({
        stream: true,
        stdout: true,
        stderr: true,
      });
      expect(container.start).toHaveBeenCalled();
      expect(statsCollector.collect)
        .toHaveBeenCalledWith(container, Path.join(context.cwd, 'output', 'stats-sparql-endpoint-comunica.csv'));
      expect(container.kill).not.toHaveBeenCalled();

      expect(filesOut).toEqual({
        'CWD/output/logs/sparql-endpoint-comunica.txt': true,
      });

      await stopHook();
      expect(container.kill).toHaveBeenCalled();
      expect(container.remove).toHaveBeenCalled();
      expect(context.exitProcess).not.toHaveBeenCalled();
    });
  });
});

import { EventEmitter } from 'node:events';
import * as http from 'node:http';
import Path from 'node:path';
import type { ITaskContext, DockerContainerHandler, DockerResourceConstraints } from 'jbr';
import { createExperimentPaths, StaticDockerResourceConstraints } from 'jbr';
import { TestLogger } from '../../jbr/test/TestLogger';
import { HookSparqlEndpointComunica } from '../lib/HookSparqlEndpointComunica';

let filesOut: Record<string, string> = {};
jest.mock<any>('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async writeFile(path: string, contents: string) {
    filesOut[path] = contents;
  },
}));

let httpStatusCode: number;
let httpRequestError: Error | undefined;
let httpResponseError: Error | undefined;
jest.mock<any>('node:http', () => ({
  ...jest.requireActual('node:http'),
  get: jest.fn((url: string, callback: (response: any) => void) => {
    const request = new EventEmitter();
    const response: any = Object.assign(new EventEmitter(), { statusCode: httpStatusCode, resume: jest.fn() });
    setImmediate(() => {
      if (httpRequestError) {
        request.emit('error', httpRequestError);
        return;
      }
      callback(response);
      if (httpResponseError) {
        response.emit('error', httpResponseError);
        return;
      }
      response.emit('end');
    });
    return request;
  }),
}));

describe('HookSparqlEndpointComunica', () => {
  let endpointHandler: DockerContainerHandler;
  let logger: any;
  let context: ITaskContext;
  let resourceConstraints: DockerResourceConstraints;
  let hook: HookSparqlEndpointComunica;
  beforeEach(() => {
    filesOut = {};
    httpStatusCode = 200;
    httpRequestError = undefined;
    httpResponseError = undefined;
    jest.mocked(http.get).mockClear();
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
      [ '/generated/dataset.nt:/tmp/dataset.nt' ],
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
      const additionalMaps = [ '/generated/dataset.nt:/tmp/dataset.nt' ]
        .map(x => Path.join(context.experimentPaths.root, x));
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
            ...additionalMaps,
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
      const additionalMaps = [ '/generated/dataset.nt:/tmp/dataset.nt' ]
        .map(x => Path.join(context.experimentPaths.root, x));
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
            ...additionalMaps,
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

  describe('start with preload query', () => {
    beforeEach(() => {
      hook = new HookSparqlEndpointComunica(
        'input/dockerfiles/Dockerfile-client',
        resourceConstraints,
        'input/config-client.json',
        'input/context-client.json',
        [],
        3_001,
        'info',
        300,
        8_192,
        'ASK { ?s ?p ?o }',
      );
      jest.spyOn(hook.httpAvailabilityLatch, 'sleepUntilAvailable').mockResolvedValue();
    });

    it('should not preload without preload query', async() => {
      hook = new HookSparqlEndpointComunica(
        'input/dockerfiles/Dockerfile-client',
        resourceConstraints,
        'input/config-client.json',
        'input/context-client.json',
        [],
        3_001,
        'info',
        300,
        8_192,
      );
      jest.spyOn(hook.httpAvailabilityLatch, 'sleepUntilAvailable').mockResolvedValue();

      await expect(hook.start(context)).resolves.toBe(endpointHandler);

      expect(hook.httpAvailabilityLatch.sleepUntilAvailable).not.toHaveBeenCalled();
      expect(http.get).not.toHaveBeenCalled();
      expect(filesOut).toEqual({});
    });

    it('should execute the preload query once the endpoint is available', async() => {
      await expect(hook.start(context)).resolves.toBe(endpointHandler);

      expect(hook.httpAvailabilityLatch.sleepUntilAvailable)
        .toHaveBeenCalledWith(context, 'http://localhost:3001/sparql');
      expect(http.get).toHaveBeenCalledTimes(1);
      expect(http.get).toHaveBeenCalledWith(
        'http://localhost:3001/sparql?query=ASK%20%7B%20%3Fs%20%3Fp%20%3Fo%20%7D',
        expect.any(Function),
      );
      expect(filesOut[Path.join('CWD', 'output', 'logs', 'sparql-endpoint-comunica-preload-time.csv')])
        .toMatch(/^time\n\d+$/u);
      expect(endpointHandler.close).not.toHaveBeenCalled();
    });

    it('should close the endpoint and throw if the preload query fails', async() => {
      httpStatusCode = 500;

      await expect(hook.start(context)).rejects
        .toThrow('Preload query failed with status code 500 on http://localhost:3001/sparql?query=ASK%20%7B%20%3Fs%20%3Fp%20%3Fo%20%7D');

      expect(endpointHandler.close).toHaveBeenCalledWith();
      expect(filesOut).toEqual({});
    });

    it('should close the endpoint and throw if the preload request errors', async() => {
      httpRequestError = new Error('request error');

      await expect(hook.start(context)).rejects.toThrow('request error');

      expect(endpointHandler.close).toHaveBeenCalledWith();
    });

    it('should close the endpoint and throw if the preload response errors', async() => {
      httpResponseError = new Error('response error');

      await expect(hook.start(context)).rejects.toThrow('response error');

      expect(endpointHandler.close).toHaveBeenCalledWith();
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

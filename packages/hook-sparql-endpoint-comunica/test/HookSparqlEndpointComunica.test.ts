import Path from 'node:path';
import { SparqlEndpointFetcher } from 'fetch-sparql-endpoint';
import type { ITaskContext, DockerContainerHandler, DockerResourceConstraints } from 'jbr';
import { createExperimentPaths, StaticDockerResourceConstraints } from 'jbr';
import { Agent, fetch } from 'undici';
import { TestLogger } from '../../jbr/test/TestLogger';
import { HookSparqlEndpointComunica } from '../lib/HookSparqlEndpointComunica';

let filesOut: Record<string, string> = {};
jest.mock<any>('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async writeFile(path: string, contents: string) {
    filesOut[path] = contents;
  },
}));

let fetchAsk: jest.Mock;
jest.mock<any>('fetch-sparql-endpoint', () => ({
  SparqlEndpointFetcher: jest.fn(() => ({ fetchAsk })),
}));

const agentClose = jest.fn();
jest.mock<any>('undici', () => ({
  Agent: jest.fn(() => ({ close: agentClose })),
  fetch: jest.fn(),
}));

describe('HookSparqlEndpointComunica', () => {
  let endpointHandler: DockerContainerHandler;
  let logger: any;
  let context: ITaskContext;
  let resourceConstraints: DockerResourceConstraints;
  let hook: HookSparqlEndpointComunica;
  beforeEach(() => {
    filesOut = {};
    fetchAsk = jest.fn(async() => true);
    jest.clearAllMocks();
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
        true,
      );
      jest.spyOn(hook.httpAvailabilityLatch, 'sleepUntilAvailable').mockResolvedValue();
    });

    it('should not preload if preload query is disabled', async() => {
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
        false,
      );
      jest.spyOn(hook.httpAvailabilityLatch, 'sleepUntilAvailable').mockResolvedValue();

      await expect(hook.start(context)).resolves.toBe(endpointHandler);

      expect(hook.httpAvailabilityLatch.sleepUntilAvailable).not.toHaveBeenCalled();
      expect(fetchAsk).not.toHaveBeenCalled();
      expect(filesOut).toEqual({});
    });

    it('should execute an ASK query once the endpoint is available', async() => {
      await expect(hook.start(context)).resolves.toBe(endpointHandler);

      expect(hook.httpAvailabilityLatch.sleepUntilAvailable)
        .toHaveBeenCalledWith(context, 'http://localhost:3001/sparql');
      expect(fetchAsk).toHaveBeenCalledTimes(1);
      expect(fetchAsk).toHaveBeenCalledWith('http://localhost:3001/sparql', 'ASK { ?s ?p ?o }');
      expect(filesOut[Path.join('CWD', 'output', 'logs', 'sparql-endpoint-comunica-preload-time.csv')])
        .toMatch(/^time\n\d+$/u);
      expect(agentClose).toHaveBeenCalledTimes(1);
      expect(endpointHandler.close).not.toHaveBeenCalled();
    });

    it('should send requests without timeouts', async() => {
      await hook.start(context);

      expect(Agent).toHaveBeenCalledWith({ headersTimeout: 0, bodyTimeout: 0 });
      const options = jest.mocked(SparqlEndpointFetcher).mock.calls[0][0]!;
      expect(options.method).toBe('GET');
      await options.fetch!('URL', { method: 'GET' });
      expect(fetch).toHaveBeenCalledWith('URL', {
        method: 'GET',
        dispatcher: jest.mocked(Agent).mock.results[0].value,
      });
    });

    it('should close the endpoint and throw if the preload query fails', async() => {
      fetchAsk = jest.fn(async() => {
        throw new Error('preload failure');
      });

      await expect(hook.start(context)).rejects.toThrow('preload failure');

      expect(agentClose).toHaveBeenCalledTimes(1);
      expect(endpointHandler.close).toHaveBeenCalledWith();
      expect(filesOut).toEqual({});
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

import type { IExperimentPaths } from 'jbr';
import { createExperimentPaths } from 'jbr';
import { ExperimentHandlerLdbcSnb } from '../lib/ExperimentHandlerLdbcSnb';

let filesOut: Record<string, string> = {};
let dirsOut: Record<string, boolean | string> = {};
jest.mock<any>('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async copyFile(from: string, to: string) {
    filesOut[to] = await jest.requireActual('fs-extra').readFile(from, 'utf8');
  },
  async copy(from: string, to: string) {
    dirsOut[to] = from;
  },
  async mkdir(dirPath: string) {
    dirsOut[dirPath] = true;
  },
}));

describe('ExperimentHandlerLdbcSnb', () => {
  let handler: ExperimentHandlerLdbcSnb;
  let experimentPaths: IExperimentPaths;
  beforeEach(() => {
    handler = new ExperimentHandlerLdbcSnb();
    experimentPaths = createExperimentPaths('dir');

    filesOut = {};
    dirsOut = {};
  });

  describe('exposes public fields', () => {
    it('should expose an id', () => {
      expect(handler.id).toBe('ldbc-snb');
    });

    it('should expose an experimentClassName', () => {
      expect(handler.experimentClassName).toBe('ExperimentLdbcSnb');
    });
  });

  describe('getDefaultParams', () => {
    it('returns a hash', () => {
      expect(handler.getDefaultParams(experimentPaths)).toEqual({
        scale: '0.1',
        hadoopMemory: '4G',
        queryCount: 5,
        querySeed: 12345,
        workload: 'interactive',
        generateHdt: false,
        endpointUrl: 'http://localhost:3001/sparql',
        endpointUrlExternal: 'http://localhost:3001/',
        queryRunnerReplication: 3,
        queryRunnerWarmupRounds: 1,
        queryRunnerRequestDelay: 0,
        queryRunnerEndpointAvailabilityCheckTimeout: 1_000,
        queryRunnerUrlParams: {},
      });
    });
  });

  describe('getHookNames', () => {
    it('returns the hook names', () => {
      expect(handler.getHookNames()).toEqual([ 'hookSparqlEndpoint' ]);
    });
  });

  describe('init', () => {
    it('initializes directories and files', async() => {
      await handler.init(experimentPaths, <any> {});

      expect(dirsOut).toEqual({});
      expect(filesOut).toEqual({});
    });
  });
});

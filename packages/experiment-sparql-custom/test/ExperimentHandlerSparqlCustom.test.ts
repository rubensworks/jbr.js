import type { IExperimentPaths } from 'jbr';
import { createExperimentPaths } from 'jbr';
import { ExperimentHandlerSparqlCustom } from '../lib/ExperimentHandlerSparqlCustom';

let filesOut: Record<string, string> = {};
let dirsOut: Record<string, boolean | string> = {};
jest.mock('fs-extra', () => ({
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

describe('ExperimentHandlerSparqlCustom', () => {
  let handler: ExperimentHandlerSparqlCustom;
  let experimentPaths: IExperimentPaths;
  beforeEach(() => {
    handler = new ExperimentHandlerSparqlCustom();
    experimentPaths = createExperimentPaths('dir');

    filesOut = {};
    dirsOut = {};
  });

  describe('exposes public fields', () => {
    it('should expose an id', () => {
      expect(handler.id).toEqual('sparql-custom');
    });

    it('should expose an experimentClassName', () => {
      expect(handler.experimentClassName).toEqual('ExperimentSparqlCustom');
    });
  });

  describe('getDefaultParams', () => {
    it('returns a hash', () => {
      expect(handler.getDefaultParams(experimentPaths)).toBeInstanceOf(Object);
      expect(Object.entries(handler.getDefaultParams(experimentPaths)).length).toEqual(7);
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

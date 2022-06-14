import * as Path from 'path';
import type { IExperimentPaths } from 'jbr';
import { createExperimentPaths } from 'jbr';
import { Templates } from 'ldbc-snb-decentralized/lib/Templates';
import { ExperimentHandlerLdbcSnbDecentralized } from '../lib/ExperimentHandlerLdbcSnbDecentralized';

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

describe('ExperimentHandlerLdbcSnbDecentralized', () => {
  let handler: ExperimentHandlerLdbcSnbDecentralized;
  let experimentPaths: IExperimentPaths;
  beforeEach(() => {
    handler = new ExperimentHandlerLdbcSnbDecentralized();
    experimentPaths = createExperimentPaths('dir');

    filesOut = {};
    dirsOut = {};
  });

  describe('exposes public fields', () => {
    it('should expose an id', () => {
      expect(handler.id).toEqual('ldbc-snb-decentralized');
    });

    it('should expose an experimentClassName', () => {
      expect(handler.experimentClassName).toEqual('ExperimentLdbcSnbDecentralized');
    });
  });

  describe('getDefaultParams', () => {
    it('returns a hash', () => {
      expect(handler.getDefaultParams(experimentPaths)).toBeInstanceOf(Object);
      expect(Object.entries(handler.getDefaultParams(experimentPaths)).length).toEqual(18);
    });
  });

  describe('getHookNames', () => {
    it('returns the hook names', () => {
      expect(handler.getHookNames()).toEqual([ 'hookSparqlEndpoint' ]);
    });
  });

  describe('init', () => {
    it('initializes directories and files', async() => {
      await handler.init(experimentPaths, <any> {
        configGenerateAux: 'configGenerateAux.json',
        configFragment: 'configFragment.json',
        configFragmentAux: 'configFragmentAux.json',
        configQueries: 'configQueries.json',
        configServer: 'configServer.json',
        configValidation: 'configValidation.json',
        directoryQueryTemplates: 'queryTemplates',
      });

      expect(dirsOut).toEqual({
        [Path.join('dir', 'input', 'dockerfiles')]: true,
        [Path.join('dir', 'queryTemplates')]: Templates.QUERIES_DIRECTORY,
      });
      expect(filesOut).toEqual({
        [Path.join('dir', 'configGenerateAux.json')]: expect.any(String),
        [Path.join('dir', 'configFragment.json')]: expect.any(String),
        [Path.join('dir', 'configFragmentAux.json')]: expect.any(String),
        [Path.join('dir', 'configQueries.json')]: expect.any(String),
        [Path.join('dir', 'configServer.json')]: expect.any(String),
        [Path.join('dir', 'configValidation.json')]: expect.any(String),
        [Path.join('dir', 'input', 'dockerfiles', 'Dockerfile-server')]: expect.any(String),
      });
    });
  });
});

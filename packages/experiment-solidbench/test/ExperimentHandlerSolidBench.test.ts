import * as Path from 'path';
import type { IExperimentPaths } from 'jbr';
import { createExperimentPaths } from 'jbr';
import { ExperimentHandlerSolidBench } from '../lib/ExperimentHandlerSolidBench';

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
  async readdir(dir: string) {
    const ret: any[] = [];
    for (const path of Object.keys(filesOut)) {
      if (path.startsWith(dir)) {
        let name = path.slice(dir.length + 1);
        const slashPos = name.indexOf('/');
        const isFile = slashPos < 0;
        if (!isFile) {
          name = name.slice(0, slashPos);
        }
        ret.push({
          name,
          isFile: () => isFile,
          isDirectory: () => !isFile,
        });
      }
    }
    return ret;
  },
  async readFile(path: string) {
    if (!(path in filesOut)) {
      throw new Error(`Could not find file at ${path}`);
    }
    return filesOut[path];
  },
  async writeFile(path: string, contents: string) {
    return filesOut[path] = contents;
  },
}));

describe('ExperimentHandlerSolidBench', () => {
  let handler: ExperimentHandlerSolidBench;
  let experimentPaths: IExperimentPaths;
  beforeEach(() => {
    handler = new ExperimentHandlerSolidBench();
    experimentPaths = createExperimentPaths('dir');

    filesOut = {};
    dirsOut = {};
  });

  describe('exposes public fields', () => {
    it('should expose an id', () => {
      expect(handler.id).toEqual('solidbench');
    });

    it('should expose an experimentClassName', () => {
      expect(handler.experimentClassName).toEqual('ExperimentSolidBench');
    });
  });

  describe('getDefaultParams', () => {
    it('returns a hash', () => {
      expect(handler.getDefaultParams(experimentPaths)).toBeInstanceOf(Object);
      expect(Object.entries(handler.getDefaultParams(experimentPaths)).length).toEqual(22);
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
        replaceBaseUrlInDir: jest.fn(),
      });

      expect(dirsOut).toEqual({
        [Path.join('dir', 'input', 'dockerfiles')]: true,
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

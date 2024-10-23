import * as Path from 'path';
import type { IExperimentPaths } from 'jbr';
import { createExperimentPaths } from 'jbr';
import { HookHandlerDocker } from '../lib/HookHandlerDocker';

let files: Record<string, string> = {};
let filesOut: Record<string, string> = {};
let dirsOut: Record<string, boolean | string> = {};
jest.mock('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async pathExists(path: string) {
    return path in files;
  },
  async copyFile(from: string, to: string) {
    filesOut[to] = await jest.requireActual('fs-extra').readFile(from, 'utf8');
  },
  async mkdir(dirPath: string) {
    dirsOut[dirPath] = true;
  },
}));

describe('HookHandlerDocker', () => {
  let handler: HookHandlerDocker;
  let experimentPaths: IExperimentPaths;
  beforeEach(() => {
    handler = new HookHandlerDocker();
    experimentPaths = createExperimentPaths('dir');

    files = {};
    filesOut = {};
    dirsOut = {};
  });

  describe('exposes public fields', () => {
    it('should expose an id', () => {
      expect(handler.id).toEqual('docker');
    });

    it('should expose an experimentClassName', () => {
      expect(handler.hookClassName).toEqual('HookDocker');
    });
  });

  describe('getDefaultParams', () => {
    it('returns a hash', () => {
      expect(handler.getDefaultParams(experimentPaths)).toBeInstanceOf(Object);
      expect(Object.entries(handler.getDefaultParams(experimentPaths)).length).toEqual(6);
    });
  });

  describe('getSubHookNames', () => {
    it('returns an empty array', () => {
      expect(handler.getSubHookNames()).toEqual([]);
    });
  });

  describe('init', () => {
    it('initializes directories and files', async() => {
      await handler.init(experimentPaths, <any> {});

      expect(dirsOut).toEqual({
        [Path.join('dir', 'input', 'dockerfiles')]: true,
      });
      expect(filesOut).toEqual({
        [Path.join('dir', 'input', 'dockerfiles', 'Dockerfile')]: expect.any(String),
      });
    });

    it('initializes directories and files when some directories already exist', async() => {
      files = {
        [Path.join('dir', 'input', 'dockerfiles')]: `TRUE`,
        [Path.join('dir', 'input')]: `TRUE`,
      };
      await handler.init(experimentPaths, <any> {});

      expect(dirsOut).toEqual({});
      expect(filesOut).toEqual({
        [Path.join('dir', 'input', 'dockerfiles', 'Dockerfile')]: expect.any(String),
      });
    });
  });
});

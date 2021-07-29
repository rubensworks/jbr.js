import * as Path from 'path';
import type { IExperimentPaths } from 'jbr';
import { createExperimentPaths } from 'jbr';
import { HookHandlerSparqlEndpointLdf } from '../lib/HookHandlerSparqlEndpointLdf';

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

describe('HookHandlerSparqlEndpointLdf', () => {
  let handler: HookHandlerSparqlEndpointLdf;
  let experimentPaths: IExperimentPaths;
  beforeEach(() => {
    handler = new HookHandlerSparqlEndpointLdf();
    experimentPaths = createExperimentPaths('dir');

    files = {};
    filesOut = {};
    dirsOut = {};
  });

  describe('exposes public fields', () => {
    it('should expose an id', () => {
      expect(handler.id).toEqual('sparql-endpoint-ldf');
    });

    it('should expose an experimentClassName', () => {
      expect(handler.hookClassName).toEqual('HookSparqlEndpointLdf');
    });
  });

  describe('getDefaultParams', () => {
    it('returns a hash', () => {
      expect(handler.getDefaultParams(experimentPaths)).toBeInstanceOf(Object);
      expect(Object.entries(handler.getDefaultParams(experimentPaths)).length).toEqual(9);
    });
  });

  describe('getSubHookNames', () => {
    it('returns an array', () => {
      expect(handler.getSubHookNames()).toEqual([ 'hookSparqlEndpointLdfEngine' ]);
    });
  });

  describe('init', () => {
    it('initializes directories and files', async() => {
      await handler.init(experimentPaths, <any> {});

      expect(dirsOut).toEqual({
        [Path.join('dir', 'input', 'dockerfiles')]: true,
        [Path.join('dir', 'input')]: true,
      });
      expect(filesOut).toEqual({
        [Path.join('dir', 'input', 'dockerfiles', 'Dockerfile-ldf-server')]: expect.any(String),
        [Path.join('dir', 'input', 'dockerfiles', 'Dockerfile-ldf-server-cache')]: expect.any(String),
        [Path.join('dir', 'input', 'config-ldf-server.json')]: expect.any(String),
        [Path.join('dir', 'input', 'nginx-default')]: expect.any(String),
        [Path.join('dir', 'input', 'nginx.conf')]: expect.any(String),
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
        [Path.join('dir', 'input', 'dockerfiles', 'Dockerfile-ldf-server')]: expect.any(String),
        [Path.join('dir', 'input', 'dockerfiles', 'Dockerfile-ldf-server-cache')]: expect.any(String),
        [Path.join('dir', 'input', 'config-ldf-server.json')]: expect.any(String),
        [Path.join('dir', 'input', 'nginx-default')]: expect.any(String),
        [Path.join('dir', 'input', 'nginx.conf')]: expect.any(String),
      });
    });
  });
});

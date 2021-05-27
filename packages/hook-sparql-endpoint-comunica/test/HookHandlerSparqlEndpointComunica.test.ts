import * as Path from 'path';
import { HookHandlerSparqlEndpointComunica } from '../lib/HookHandlerSparqlEndpointComunica';

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

describe('HookHandlerSparqlEndpointComunica', () => {
  let handler: HookHandlerSparqlEndpointComunica;
  beforeEach(() => {
    handler = new HookHandlerSparqlEndpointComunica();

    files = {};
    filesOut = {};
    dirsOut = {};
  });

  describe('exposes public fields', () => {
    it('should expose an id', () => {
      expect(handler.id).toEqual('sparql-endpoint-comunica');
    });

    it('should expose an experimentClassName', () => {
      expect(handler.hookClassName).toEqual('HookSparqlEndpointComunica');
    });
  });

  describe('getDefaultParams', () => {
    it('returns a hash', () => {
      expect(handler.getDefaultParams('dir')).toBeInstanceOf(Object);
      expect(Object.entries(handler.getDefaultParams('dir')).length).toEqual(6);
    });
  });

  describe('init', () => {
    it('initializes directories and files', async() => {
      await handler.init('dir', <any> {});

      expect(dirsOut).toEqual({
        [Path.join('dir', 'input', 'dockerfiles')]: true,
        [Path.join('dir', 'input')]: true,
      });
      expect(filesOut).toEqual({
        [Path.join('dir', 'input', 'dockerfiles', 'Dockerfile-client')]: expect.any(String),
        [Path.join('dir', 'input', 'config-client.json')]: expect.any(String),
        [Path.join('dir', 'input', 'context-client.json')]: expect.any(String),
      });
    });

    it('initializes directories and files when some directories already exist', async() => {
      files = {
        [Path.join('dir', 'input', 'dockerfiles')]: `TRUE`,
        [Path.join('dir', 'input')]: `TRUE`,
      };
      await handler.init('dir', <any> {});

      expect(dirsOut).toEqual({});
      expect(filesOut).toEqual({
        [Path.join('dir', 'input', 'dockerfiles', 'Dockerfile-client')]: expect.any(String),
        [Path.join('dir', 'input', 'config-client.json')]: expect.any(String),
        [Path.join('dir', 'input', 'context-client.json')]: expect.any(String),
      });
    });
  });
});

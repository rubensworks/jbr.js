import * as Path from 'path';
import * as spawn from 'cross-spawn';
import type { HookHandler } from '../../lib/hook/HookHandler';
import type { ExperimentLoader } from '../../lib/task/ExperimentLoader';
import { TaskSetHook } from '../../lib/task/TaskSetHook';

let files: Record<string, string | boolean> = {};
let filesOut: Record<string, string> = {};
let filesUnlinked: Record<string, boolean> = {};
jest.mock('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async readFile(filePath: string) {
    if (!(filePath in files)) {
      throw new Error(`File does not exist in TaskSetHook tests: '${filePath}'`);
    }
    return files[filePath];
  },
  async writeFile(filePath: string, contents: string) {
    filesOut[filePath] = contents;
  },
  async pathExists(filePath: string) {
    return filePath in files;
  },
  async unlink(filePath: string) {
    filesUnlinked[filePath] = true;
  },
}));

let experimentLoader: ExperimentLoader;
jest.mock('../../lib/task/ExperimentLoader', () => ({
  ExperimentLoader: {
    ...jest.requireActual('../../lib/task/ExperimentLoader').ExperimentLoader,
    build: jest.fn(() => experimentLoader),
    getDefaultExperimentIri: () => 'IRI',
    getPreparedMarkerPath: jest.requireActual('../../lib/task/ExperimentLoader').ExperimentLoader.getPreparedMarkerPath,
  },
}));

jest.mock('cross-spawn', () => ({
  sync: jest.fn(() => ({ error: undefined })),
}));

describe('TaskSetHook', () => {
  let task: TaskSetHook;
  let handler: HookHandler<any>;
  beforeEach(() => {
    task = new TaskSetHook(
      { cwd: 'CWD', mainModulePath: 'MMP', verbose: true, exitProcess: jest.fn() },
      'hook1',
      'TYPE',
      false,
    );

    handler = <any> {
      hookClassName: 'TYPE',
      getDefaultParams: jest.fn(() => ({ param1: 'value1' })),
      init: jest.fn(),
    };
    experimentLoader = <any> {
      discoverHookHandlers: jest.fn(() => ({
        TYPE: {
          handler,
          contexts: [ 'context2', 'context3' ],
        },
      })),
      instantiateFromConfig: jest.fn((path, iri) => ({ CONFIG: iri })),
    };

    files = {
      [Path.join('CWD', 'jbr-experiment.json')]: `{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^0.0.0/components/context.jsonld",
    "context1",
    "context2"
  ],
  "@id": "IRI",
  "@type": "TYPE",
  "hook1": {
    "@id": "IRI:hook1",
    "@type": "HookNonConfigured"
  }
}`,
    };
    filesOut = {};
    filesUnlinked = {};
  });

  describe('set', () => {
    it('sets a valid hook', async() => {
      await task.set();

      expect(filesOut).toEqual({
        [Path.join('CWD', 'jbr-experiment.json')]: `{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^0.0.0/components/context.jsonld",
    "context1",
    "context2",
    "context3"
  ],
  "@id": "IRI",
  "@type": "TYPE",
  "hook1": {
    "@id": "IRI:hook1",
    "@type": "TYPE",
    "param1": "value1"
  }
}`,
      });
      expect(filesUnlinked).toEqual({});
    });

    it('sets a valid hook with an existing marker file', async() => {
      files[Path.join('CWD', 'generated', '.prepared')] = true;

      await task.set();

      expect(filesOut).toEqual({
        [Path.join('CWD', 'jbr-experiment.json')]: `{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^0.0.0/components/context.jsonld",
    "context1",
    "context2",
    "context3"
  ],
  "@id": "IRI",
  "@type": "TYPE",
  "hook1": {
    "@id": "IRI:hook1",
    "@type": "TYPE",
    "param1": "value1"
  }
}`,
      });
      expect(filesUnlinked[Path.join('CWD', 'generated', '.prepared')]).toBeTruthy();
    });

    it('should throw when initializing an unknown handler type', async() => {
      task = new TaskSetHook(
        { cwd: 'CWD', mainModulePath: 'MMP', verbose: true, exitProcess: jest.fn() },
        'hook1',
        'TYPEUNKNOWN',
        false,
      );

      await expect(task.set()).rejects.toThrow(`Invalid hook type 'TYPEUNKNOWN'. Must be one of 'TYPE'`);
    });

    it('should throw when initializing an unknown hook', async() => {
      task = new TaskSetHook(
        { cwd: 'CWD', mainModulePath: 'MMP', verbose: true, exitProcess: jest.fn() },
        'hookunknown',
        'TYPE',
        false,
      );

      await expect(task.set()).rejects.toThrow(`Could not find a hook by name 'hookunknown' in '${Path.join('CWD', 'jbr-experiment.json')}'`);
    });

    it('sets a valid hook with npm install', async() => {
      task = new TaskSetHook(
        { cwd: 'CWD', mainModulePath: 'MMP', verbose: true, exitProcess: jest.fn() },
        'hook1',
        'TYPE',
        true,
      );

      await task.set();

      expect(spawn.sync).toHaveBeenCalledWith('npm', [ 'install', '@jrb-hook/TYPE' ], {
        cwd: 'CWD',
        stdio: 'inherit',
      });
    });

    it('throws if npm install fails', async() => {
      task = new TaskSetHook(
        { cwd: 'CWD', mainModulePath: 'MMP', verbose: true, exitProcess: jest.fn() },
        'hook1',
        'TYPE',
        true,
      );

      (<any> spawn.sync).mockImplementation(() => ({ error: new Error('NPM INSTALL FAILURE') }));
      await expect(task.set()).rejects.toThrow('NPM INSTALL FAILURE');
    });
  });
});

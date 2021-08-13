import * as Path from 'path';
import { createExperimentPaths } from '../../lib/cli/CliHelpers';
import type { HookHandler } from '../../lib/hook/HookHandler';
import type { NpmInstaller } from '../../lib/npm/NpmInstaller';
import type { ExperimentLoader } from '../../lib/task/ExperimentLoader';
import type { ITaskContext } from '../../lib/task/ITaskContext';
import { TaskSetHook } from '../../lib/task/TaskSetHook';
import { TestLogger } from '../TestLogger';

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
let isCombinationsExperiment = false;
jest.mock('../../lib/task/ExperimentLoader', () => ({
  ExperimentLoader: {
    ...jest.requireActual('../../lib/task/ExperimentLoader').ExperimentLoader,
    build: jest.fn(() => experimentLoader),
    getDefaultExperimentIri: () => 'IRI',
    getPreparedMarkerPath: jest.requireActual('../../lib/task/ExperimentLoader').ExperimentLoader.getPreparedMarkerPath,
    isCombinationsExperiment: () => isCombinationsExperiment,
  },
}));

let taskGenerateCombinations: any;
jest.mock('../../lib/task/TaskGenerateCombinations', () => ({
  TaskGenerateCombinations: jest.fn().mockImplementation(() => ({
    generate: taskGenerateCombinations,
  })),
}));

describe('TaskSetHook', () => {
  let context: ITaskContext;
  let npmInstaller: NpmInstaller;
  let task: TaskSetHook;
  let handler: HookHandler<any>;
  beforeEach(() => {
    context = {
      cwd: 'CWD',
      experimentPaths: createExperimentPaths('CWD'),
      mainModulePath: 'MMP',
      verbose: true,
      cleanupHandlers: [],
      logger: <any> new TestLogger(),
      docker: <any> {},
    };
    npmInstaller = {
      install: jest.fn(),
    };
    task = new TaskSetHook(
      context,
      [ 'hook1' ],
      'TYPE',
      npmInstaller,
    );

    handler = <any> {
      hookClassName: 'TYPE',
      getDefaultParams: jest.fn(() => ({ param1: 'value1' })),
      getSubHookNames: () => [],
      init: jest.fn(),
    };
    isCombinationsExperiment = false;
    experimentLoader = <any> {
      discoverHookHandlers: jest.fn(() => ({
        TYPE: {
          handler,
          contexts: [ 'context2', 'context3' ],
        },
      })),
      instantiateExperiments: jest.fn(path => ({
        experiments: [
          {
            CONFIG: path,
            hook1: {
              hook2: 'abc',
            },
          },
        ],
        experimentPathsArray: [
          'PATH1',
        ],
      })),
    };
    taskGenerateCombinations = jest.fn();

    files = {
      [Path.join('CWD', 'jbr-experiment.json')]: `{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^1.0.0/components/context.jsonld",
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
      [Path.join('CWD', 'jbr-experiment.json.template')]: `{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^1.0.0/components/context.jsonld",
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
      expect(await task.set()).toEqual({ subHookNames: []});

      expect(handler.init).toHaveBeenCalledWith(context.experimentPaths, { hook2: 'abc' });
      expect(filesOut).toEqual({
        [Path.join('CWD', 'jbr-experiment.json')]: `{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^1.0.0/components/context.jsonld",
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
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^1.0.0/components/context.jsonld",
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

    it('sets a valid hook for a combinations-based experiment', async() => {
      isCombinationsExperiment = true;
      expect(await task.set()).toEqual({ subHookNames: []});

      expect(taskGenerateCombinations).toHaveBeenCalled();
      expect(filesOut).toEqual({
        [Path.join('CWD', 'jbr-experiment.json.template')]: `{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^1.0.0/components/context.jsonld",
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

    it('should throw when initializing an unknown handler type', async() => {
      task = new TaskSetHook(
        context,
        [ 'hook1' ],
        'TYPEUNKNOWN',
        npmInstaller,
      );

      await expect(task.set()).rejects.toThrow(`Invalid hook type 'TYPEUNKNOWN'. Must be one of 'TYPE'`);
    });

    it('should throw when initializing an unknown hook', async() => {
      task = new TaskSetHook(
        context,
        [ 'hookunknown' ],
        'TYPE',
        npmInstaller,
      );

      await expect(task.set()).rejects.toThrow(`Illegal hook path: could not find 'hookunknown' in '${Path.join('CWD', 'jbr-experiment.json')}'`);
    });

    it('sets a valid hook with npm install', async() => {
      task = new TaskSetHook(
        context,
        [ 'hook1' ],
        'TYPE',
        npmInstaller,
      );

      await task.set();

      expect(npmInstaller.install).toHaveBeenCalledWith('CWD', [ '@jbr-hook/TYPE' ], 'jbr-hook');
    });

    it('sets a valid hook with sub-hooks', async() => {
      handler.getSubHookNames = () => [ 'subHook1', 'subHook2' ];

      expect(await task.set()).toEqual({ subHookNames: [ 'subHook1', 'subHook2' ]});

      expect(filesOut).toEqual({
        [Path.join('CWD', 'jbr-experiment.json')]: `{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^1.0.0/components/context.jsonld",
    "context1",
    "context2",
    "context3"
  ],
  "@id": "IRI",
  "@type": "TYPE",
  "hook1": {
    "@id": "IRI:hook1",
    "@type": "TYPE",
    "param1": "value1",
    "subHook1": {
      "@id": "IRI:subHook1",
      "@type": "HookNonConfigured"
    },
    "subHook2": {
      "@id": "IRI:subHook2",
      "@type": "HookNonConfigured"
    }
  }
}`,
      });
      expect(filesUnlinked).toEqual({});
    });

    it('sets a valid sub-hook', async() => {
      task = new TaskSetHook(
        context,
        [ 'hook1', 'hook2' ],
        'TYPE',
        npmInstaller,
      );

      files[Path.join('CWD', 'jbr-experiment.json')] = `{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^1.0.0/components/context.jsonld",
    "context1",
    "context2"
  ],
  "@id": "IRI",
  "@type": "TYPE",
  "hook1": {
    "@id": "IRI:hook1",
    "@type": "HookNonConfigured",
    "hook2": {
      "@id": "IRI:hook2",
      "@type": "HookNonConfigured"
    }
  }
}`;

      expect(await task.set()).toEqual({ subHookNames: []});

      expect(filesOut).toEqual({
        [Path.join('CWD', 'jbr-experiment.json')]: `{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^1.0.0/components/context.jsonld",
    "context1",
    "context2",
    "context3"
  ],
  "@id": "IRI",
  "@type": "TYPE",
  "hook1": {
    "@id": "IRI:hook1",
    "@type": "HookNonConfigured",
    "hook2": {
      "@id": "IRI:hook1_hook2",
      "@type": "TYPE",
      "param1": "value1"
    }
  }
}`,
      });
      expect(filesUnlinked).toEqual({});
    });

    it('should throw on a non-existing sub-hook', async() => {
      task = new TaskSetHook(
        context,
        [ 'hook1', 'hook2' ],
        'TYPE',
        npmInstaller,
      );
      await expect(task.set()).rejects.toThrowError(`Illegal hook path: could not find 'hook2' in 'CWD/jbr-experiment.json' on`);
    });

    it('should throw on empty hook path', async() => {
      task = new TaskSetHook(
        context,
        [],
        'TYPE',
        npmInstaller,
      );
      await expect(task.set()).rejects.toThrowError(`Illegal hook path of length 0`);
    });
  });

  describe('setObjectPath', () => {
    it('should throw on non existing path element', () => {
      expect(() => TaskSetHook.setObjectPath('CONFIG', { a: {}}, [ 'a', 'b', 'c' ], 'V'))
        .toThrowError(`Illegal hook path: could not set a child for 'b' in 'CONFIG' on {}`);
    });
  });
});

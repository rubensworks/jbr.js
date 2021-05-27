import * as Path from 'path';
import * as spawn from 'cross-spawn';
import type { ExperimentHandler } from '../../lib/experiment/ExperimentHandler';
import type { ExperimentLoader } from '../../lib/task/ExperimentLoader';
import { TaskInitialize } from '../../lib/task/TaskInitialize';

let files: Record<string, string> = {};
let filesOut: Record<string, string> = {};
let filesDeleted: Record<string, boolean> = {};
let dirsOut: Record<string, boolean> = {};
jest.mock('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async writeFile(filePath: string, contents: string) {
    filesOut[filePath] = contents;
  },
  async remove(filePath: string) {
    filesDeleted[filePath] = true;
  },
  async mkdir(dirPath: string) {
    dirsOut[dirPath] = true;
  },
  async pathExists(filePath: string) {
    return filePath in files;
  },
}));

let experimentLoader: ExperimentLoader;
jest.mock('../../lib/task/ExperimentLoader', () => ({
  ExperimentLoader: {
    ...jest.requireActual('../../lib/task/ExperimentLoader').ExperimentLoader,
    build: jest.fn(() => experimentLoader),
    getDefaultExperimentIri: () => 'IRI',
  },
}));

jest.mock('cross-spawn', () => ({
  sync: jest.fn(() => ({ error: undefined })),
}));

describe('TaskInitialize', () => {
  let task: TaskInitialize;
  let handler: ExperimentHandler<any>;
  beforeEach(() => {
    task = new TaskInitialize(
      { cwd: 'CWD', mainModulePath: 'MMP', verbose: true },
      'TYPE',
      'NAME',
      'TARGETDIR',
      false,
      false,
    );

    handler = <any> {
      experimentClassName: 'TYPE',
      getHookNames: jest.fn(() => [ 'hook1', 'hook2' ]),
      getDefaultParams: jest.fn(() => ({ param1: 'value1' })),
      init: jest.fn(),
    };
    experimentLoader = <any> {
      discoverExperimentHandlers: jest.fn(() => ({
        TYPE: {
          handler,
          contexts: [ 'context1', 'context2' ],
        },
      })),
      instantiateFromConfig: jest.fn((path, iri) => ({ CONFIG: iri })),
    };

    files = {};
    filesOut = {};
    filesDeleted = {};
    dirsOut = {};
  });

  describe('init', () => {
    it('initializes a valid experiment', async() => {
      expect(await task.init()).toEqual({
        experimentDirectory: Path.join('CWD', 'TARGETDIR'),
        hookNames: [ 'hook1', 'hook2' ],
      });

      expect(handler.init).toHaveBeenCalledWith(Path.join('CWD', 'TARGETDIR'), { CONFIG: 'IRI' });

      expect(dirsOut).toEqual({
        [Path.join('CWD', 'TARGETDIR')]: true,
        [Path.join('CWD', 'TARGETDIR', 'generated')]: true,
        [Path.join('CWD', 'TARGETDIR', 'input')]: true,
        [Path.join('CWD', 'TARGETDIR', 'output')]: true,
      });
      expect(filesOut).toEqual({
        [Path.join('CWD', 'TARGETDIR', '.gitignore')]: `/componentsjs-error-state.json
/node_modules
/generated
/output`,
        [Path.join('CWD', 'TARGETDIR', 'jbr-experiment.json')]: `{
  "@context": [
    "https://linkedsoftwaredependencies.org/bundles/npm/jbr/^0.0.0/components/context.jsonld",
    "context1",
    "context2"
  ],
  "@id": "IRI",
  "@type": "TYPE",
  "param1": "value1",
  "hook1": {
    "@id": "IRI:hook1",
    "@type": "HookNonConfigured"
  },
  "hook2": {
    "@id": "IRI:hook2",
    "@type": "HookNonConfigured"
  }
}`,
        [Path.join('CWD', 'TARGETDIR', 'package.json')]: `{
  "private": true,
  "name": "NAME",
  "dependencies": {},
  "scripts": {
    "jbr": "jbr"
  }
}`,
      });
    });

    it('should throw if the destination already exists', async() => {
      files[Path.join('CWD', 'TARGETDIR')] = `TRUE`;
      await expect(task.init()).rejects.toThrow('The target directory already exists: \'CWD/TARGETDIR\'');
    });

    it('should not throw if the destination already exists and forceReInit is true', async() => {
      task = new TaskInitialize(
        { cwd: 'CWD', mainModulePath: 'MMP', verbose: true },
        'TYPE',
        'NAME',
        'TARGETDIR',
        true,
        false,
      );
      files[Path.join('CWD', 'TARGETDIR')] = `TRUE`;

      await expect(task.init()).resolves.toBeTruthy();

      expect(filesDeleted).toEqual({
        [Path.join('CWD', 'TARGETDIR')]: true,
      });
    });

    it('should throw when initializing an unknown experiment type', async() => {
      task = new TaskInitialize(
        { cwd: 'CWD', mainModulePath: 'MMP', verbose: true },
        'TYPEUNKNOWN',
        'NAME',
        'TARGETDIR',
        false,
        false,
      );

      await expect(task.init()).rejects.toThrow(`Invalid experiment type 'TYPEUNKNOWN'. Must be one of 'TYPE'`);
    });
  });

  it('initializes a valid experiment with npm install', async() => {
    task = new TaskInitialize(
      { cwd: 'CWD', mainModulePath: 'MMP', verbose: true },
      'TYPE',
      'NAME',
      'TARGETDIR',
      false,
      true,
    );

    expect(await task.init()).toBeTruthy();

    expect(spawn.sync).toHaveBeenCalledWith('npm', [ 'install', 'jbr', '@jrb-experiment/TYPE' ], {
      cwd: 'CWD/TARGETDIR',
      stdio: 'inherit',
    });
  });

  it('throws if npm install fails', async() => {
    task = new TaskInitialize(
      { cwd: 'CWD', mainModulePath: 'MMP', verbose: true },
      'TYPE',
      'NAME',
      'TARGETDIR',
      false,
      true,
    );

    (<any> spawn.sync).mockImplementation(() => ({ error: new Error('NPM INSTALL FAILURE') }));
    await expect(task.init()).rejects.toThrow('NPM INSTALL FAILURE');
  });
});

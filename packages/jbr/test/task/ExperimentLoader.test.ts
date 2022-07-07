import * as Path from 'path';
import { ComponentsManagerBuilder } from 'componentsjs';
import type { RdfObjectLoader } from 'rdf-object';
import { createExperimentPaths } from '../../lib/cli/CliHelpers';
import { ExperimentLoader } from '../../lib/task/ExperimentLoader';

let componentsManager: any;
jest.mock('componentsjs', () => ({
  ...jest.requireActual('componentsjs'),
  ComponentsManager: {
    build: jest.fn(async(options: any) => {
      componentsManager.options = options;
      return componentsManager;
    }),
  },
}));

let files: Record<string, string | boolean> = {};
jest.mock('fs-extra', () => ({
  ...jest.requireActual('fs-extra'),
  async pathExists(filePath: string) {
    return filePath in files;
  },
}));

describe('ExperimentLoader', () => {
  let objectLoader: RdfObjectLoader;
  let loader: ExperimentLoader;
  beforeEach(async() => {
    objectLoader = ComponentsManagerBuilder.createObjectLoader();
    await objectLoader.context;
    componentsManager = {
      objectLoader,
      configRegistry: {
        register: jest.fn(),
      },
      configConstructorPool: {
        instantiate: jest.fn(component => {
          return {
            id: `id-${component.property.types}`,
          };
        }),
      },
      instantiate: jest.fn(iri => {
        if (iri === 'urn:jrb:experiment-combinations') {
          return {
            getFactorCombinations: () => [{}, {}],
          };
        }
        return { CONFIG: iri };
      }),
      moduleState: {
        packageJsons: {},
      },
      componentResources: {},
    };
    loader = await ExperimentLoader.build('path');

    files = {};
  });

  describe('build', () => {
    it('returns a new ExperimentLoader', async() => {
      const experimentLoader = await ExperimentLoader.build('path');
      expect((<any> experimentLoader).componentsManager).toBe(componentsManager);
      expect(componentsManager.options).toEqual({
        logLevel: 'warn',
        mainModulePath: 'path',
        skipContextValidation: true,
      });
    });
  });

  describe('buildComponentsManager', () => {
    it('returns a new ComponentsManager', async() => {
      expect(await ExperimentLoader.buildComponentsManager('path'))
        .toBe(componentsManager);
    });
  });

  describe('getDefaultExperimentIri', () => {
    it('returns an IRI', () => {
      expect(ExperimentLoader.getDefaultExperimentIri('experiment'))
        .toEqual('urn:jrb:experiment');
    });
  });

  describe('instantiateFromConfig', () => {
    it('instantiates a config', async() => {
      expect(await loader.instantiateFromConfig('configpath', 'configiri'))
        .toEqual({ CONFIG: 'configiri' });
      expect(componentsManager.configRegistry.register).toHaveBeenCalledWith('configpath');
      expect(componentsManager.instantiate).toHaveBeenCalledWith('configiri');
    });
  });

  describe('instantiateExperiments', () => {
    it('instantiates a config', async() => {
      files['path/to/experiment/jbr-experiment.json'] = `TRUE`;
      expect(await loader.instantiateExperiments('path/to/experiment'))
        .toEqual({
          experiments: [
            { CONFIG: 'urn:jrb:experiment' },
          ],
          experimentPathsArray: [
            createExperimentPaths('path/to/experiment'),
          ],
          combinationProvider: undefined,
        });
      expect(componentsManager.configRegistry.register).toHaveBeenCalledWith('path/to/experiment/jbr-experiment.json');
      expect(componentsManager.instantiate).toHaveBeenCalledWith('urn:jrb:experiment');
    });

    it('throws when config file does not exist', async() => {
      await expect(loader.instantiateExperiments('path/to/experiment'))
        .rejects.toThrowError(`Experiment config file could not be found at 'path/to/experiment/jbr-experiment.json'`);
    });

    it('instantiates a combinations-based config', async() => {
      files['path/to/experiment/jbr-experiment.json.template'] = `TRUE`;
      files['path/to/experiment/jbr-combinations.json'] = `TRUE`;
      files[Path.join('path/to/experiment', 'combinations', 'combination_0')] = true;
      files[Path.join('path/to/experiment', 'combinations', 'combination_0', 'jbr-experiment.json')] = true;
      files[Path.join('path/to/experiment', 'combinations', 'combination_1')] = true;
      files[Path.join('path/to/experiment', 'combinations', 'combination_1', 'jbr-experiment.json')] = true;
      expect(await loader.instantiateExperiments('path/to/experiment'))
        .toEqual({
          experiments: [
            { CONFIG: 'urn:jrb:experiment:combination_0' },
            { CONFIG: 'urn:jrb:experiment:combination_1' },
          ],
          experimentPathsArray: [
            createExperimentPaths(Path.join('path/to/experiment', 'combinations', 'combination_0'), 0),
            createExperimentPaths(Path.join('path/to/experiment', 'combinations', 'combination_1'), 1),
          ],
          combinationProvider: expect.anything(),
        });
      expect(componentsManager.configRegistry.register).toHaveBeenNthCalledWith(1,
        'path/to/experiment/jbr-combinations.json');
      expect(componentsManager.configRegistry.register).toHaveBeenNthCalledWith(2,
        Path.join('path/to/experiment', 'combinations', 'combination_0', 'jbr-experiment.json'));
      expect(componentsManager.configRegistry.register).toHaveBeenNthCalledWith(3,
        Path.join('path/to/experiment', 'combinations', 'combination_1', 'jbr-experiment.json'));
      expect(componentsManager.instantiate).toHaveBeenCalledWith('urn:jrb:experiment:combination_0');
      expect(componentsManager.instantiate).toHaveBeenCalledWith('urn:jrb:experiment:combination_1');
    });

    it('instantiates a combinations-based config with common generated', async() => {
      (componentsManager).instantiate = jest.fn(iri => {
        if (iri === 'urn:jrb:experiment-combinations') {
          return {
            commonGenerated: true,
            getFactorCombinations: () => [{}, {}],
          };
        }
        return { CONFIG: iri };
      });

      files['path/to/experiment/jbr-experiment.json.template'] = `TRUE`;
      files['path/to/experiment/jbr-combinations.json'] = `TRUE`;
      files[Path.join('path/to/experiment', 'combinations', 'combination_0')] = true;
      files[Path.join('path/to/experiment', 'combinations', 'combination_0', 'jbr-experiment.json')] = true;
      files[Path.join('path/to/experiment', 'combinations', 'combination_1')] = true;
      files[Path.join('path/to/experiment', 'combinations', 'combination_1', 'jbr-experiment.json')] = true;
      expect(await loader.instantiateExperiments('path/to/experiment'))
        .toEqual({
          experiments: [
            { CONFIG: 'urn:jrb:experiment:combination_0' },
            { CONFIG: 'urn:jrb:experiment:combination_1' },
          ],
          experimentPathsArray: [
            {
              ...createExperimentPaths(Path.join('path/to/experiment', 'combinations', 'combination_0'), 0),
              generated: Path.join('path/to/experiment', 'generated'),
            },
            {
              ...createExperimentPaths(Path.join('path/to/experiment', 'combinations', 'combination_1'), 1),
              generated: Path.join('path/to/experiment', 'generated'),
            },
          ],
          combinationProvider: expect.anything(),
        });
      expect(componentsManager.configRegistry.register).toHaveBeenNthCalledWith(1,
        'path/to/experiment/jbr-combinations.json');
      expect(componentsManager.configRegistry.register).toHaveBeenNthCalledWith(2,
        Path.join('path/to/experiment', 'combinations', 'combination_0', 'jbr-experiment.json'));
      expect(componentsManager.configRegistry.register).toHaveBeenNthCalledWith(3,
        Path.join('path/to/experiment', 'combinations', 'combination_1', 'jbr-experiment.json'));
      expect(componentsManager.instantiate).toHaveBeenCalledWith('urn:jrb:experiment:combination_0');
      expect(componentsManager.instantiate).toHaveBeenCalledWith('urn:jrb:experiment:combination_1');
    });

    it('throws when a combinations-based experiment is not generated', async() => {
      files['path/to/experiment/jbr-experiment.json.template'] = `TRUE`;
      files['path/to/experiment/jbr-combinations.json'] = `TRUE`;
      await expect(loader.instantiateExperiments('path/to/experiment'))
        .rejects.toThrowError(`Detected invalid combination-based experiment. It is required to (re-)run 'jbr generate-combinations' first.`);
    });
  });

  describe('discoverExperimentHandlers', () => {
    it('should discover all available experiment handlers', async() => {
      componentsManager.moduleState.packageJsons = {
        packagejson1: {
          name: 'package1',
          'lsd:contexts': {
            'packagejson1/context1': true,
            'packagejson1/context2': true,
          },
        },
        packagejson2: {
          name: 'package2',
          'lsd:contexts': {
            'packagejson2/context1': true,
            'packagejson2/context2': true,
          },
        },
      };
      componentsManager.componentResources = {
        Experiment1: objectLoader.createCompactedResource({
          '@id': 'urn:Experiment1',
          types: ExperimentLoader.IRI_EXPERIMENT_HANDLER,
          module: {
            requireName: 'package1',
          },
        }),
        Experiment2: objectLoader.createCompactedResource({
          '@id': 'urn:Experiment2',
          types: ExperimentLoader.IRI_EXPERIMENT_HANDLER,
          module: {
            requireName: 'package2',
          },
        }),
      };

      expect(await loader.discoverExperimentHandlers())
        .toEqual({
          'id-urn:Experiment1': {
            contexts: [
              'packagejson1/context1',
              'packagejson1/context2',
            ],
            handler: {
              id: 'id-urn:Experiment1',
            },
          },
          'id-urn:Experiment2': {
            contexts: [
              'packagejson2/context1',
              'packagejson2/context2',
            ],
            handler: {
              id: 'id-urn:Experiment2',
            },
          },
        });
    });

    it('should ignore components with different types', async() => {
      componentsManager.moduleState.packageJsons = {
        packagejson1: {
          name: 'package1',
          'lsd:contexts': {
            'packagejson1/context1': true,
            'packagejson1/context2': true,
          },
        },
        packagejson2: {
          name: 'package2',
          'lsd:contexts': {
            'packagejson2/context1': true,
            'packagejson2/context2': true,
          },
        },
      };
      componentsManager.componentResources = {
        Experiment1: objectLoader.createCompactedResource({
          '@id': 'urn:Experiment1',
          types: ExperimentLoader.IRI_EXPERIMENT_HANDLER,
          module: {
            requireName: 'package1',
          },
        }),
        Experiment2: objectLoader.createCompactedResource({
          '@id': 'urn:Experiment2',
          types: ExperimentLoader.IRI_HOOK_HANDLER,
          module: {
            requireName: 'package2',
          },
        }),
      };

      expect(await loader.discoverExperimentHandlers())
        .toEqual({
          'id-urn:Experiment1': {
            contexts: [
              'packagejson1/context1',
              'packagejson1/context2',
            ],
            handler: {
              id: 'id-urn:Experiment1',
            },
          },
        });
    });

    it('should throw on duplicate experiment handler ids', async() => {
      componentsManager.moduleState.packageJsons = {
        packagejson1: {
          name: 'package1',
          'lsd:contexts': {
            'packagejson1/context1': true,
            'packagejson1/context2': true,
          },
        },
        packagejson2: {
          name: 'package2',
          'lsd:contexts': {
            'packagejson2/context1': true,
            'packagejson2/context2': true,
          },
        },
      };
      componentsManager.componentResources = {
        Experiment1: objectLoader.createCompactedResource({
          '@id': 'urn:Experiment1',
          types: ExperimentLoader.IRI_EXPERIMENT_HANDLER,
          module: {
            requireName: 'package1',
          },
        }),
        Experiment2: objectLoader.createCompactedResource({
          '@id': 'urn:Experiment1',
          types: ExperimentLoader.IRI_EXPERIMENT_HANDLER,
          module: {
            requireName: 'package2',
          },
        }),
      };

      await expect(loader.discoverExperimentHandlers()).rejects
        .toThrow('Double registration of component id \'id-urn:Experiment1\' detected');
    });

    it('should throw when a package.json doesn\'t exist', async() => {
      componentsManager.componentResources = {
        Experiment1: objectLoader.createCompactedResource({
          '@id': 'urn:Experiment1',
          types: ExperimentLoader.IRI_EXPERIMENT_HANDLER,
          module: {
            requireName: 'package1',
          },
        }),
      };

      await expect(loader.discoverExperimentHandlers()).rejects
        .toThrow('Could not find a package.json for \'package1\'');
    });
  });

  describe('discoverHookHandlers', () => {
    it('should discover all available hook handlers', async() => {
      componentsManager.moduleState.packageJsons = {
        packagejson1: {
          name: 'package1',
          'lsd:contexts': {
            'packagejson1/context1': true,
            'packagejson1/context2': true,
          },
        },
        packagejson2: {
          name: 'package2',
          'lsd:contexts': {
            'packagejson2/context1': true,
            'packagejson2/context2': true,
          },
        },
      };
      componentsManager.componentResources = {
        Hook1: objectLoader.createCompactedResource({
          '@id': 'urn:Hook1',
          types: ExperimentLoader.IRI_HOOK_HANDLER,
          module: {
            requireName: 'package1',
          },
        }),
        Hook2: objectLoader.createCompactedResource({
          '@id': 'urn:Hook2',
          types: ExperimentLoader.IRI_HOOK_HANDLER,
          module: {
            requireName: 'package2',
          },
        }),
      };

      expect(await loader.discoverHookHandlers())
        .toEqual({
          'id-urn:Hook1': {
            contexts: [
              'packagejson1/context1',
              'packagejson1/context2',
            ],
            handler: {
              id: 'id-urn:Hook1',
            },
          },
          'id-urn:Hook2': {
            contexts: [
              'packagejson2/context1',
              'packagejson2/context2',
            ],
            handler: {
              id: 'id-urn:Hook2',
            },
          },
        });
    });
  });

  describe('getPreparedMarkerPath', () => {
    it('returns a path', () => {
      expect(ExperimentLoader.getPreparedMarkerPath('path'))
        .toEqual(Path.join('path', 'generated', '.prepared'));
    });
  });

  describe('isExperimentPrepared', () => {
    it('returns false if the marker does not exist', async() => {
      expect(await ExperimentLoader.isExperimentPrepared('path')).toBeFalsy();
    });

    it('returns true if the marker exists', async() => {
      files[Path.join('path', 'generated', '.prepared')] = true;
      expect(await ExperimentLoader.isExperimentPrepared('path')).toBeTruthy();
    });
  });

  describe('requireExperimentPrepared', () => {
    it('throws if the marker does not exist', async() => {
      await expect(ExperimentLoader.requireExperimentPrepared('path')).rejects
        .toThrowError(`The experiment at 'path' has not been prepared successfully yet, invoke 'jbr prepare' first.`);
    });

    it('resolves if the marker exists', async() => {
      files[Path.join('path', 'generated', '.prepared')] = true;
      await ExperimentLoader.requireExperimentPrepared('path');
    });
  });

  describe('isCombinationsExperiment', () => {
    it('returns false if no files exists', async() => {
      expect(await ExperimentLoader.isCombinationsExperiment('path')).toBeFalsy();
    });

    it('returns true if all required files exists', async() => {
      files[Path.join('path', 'jbr-combinations.json')] = `true`;
      files[Path.join('path', 'jbr-experiment.json.template')] = `true`;
      expect(await ExperimentLoader.isCombinationsExperiment('path')).toBeTruthy();
    });

    it('throws if only jbr-combinations.json exists', async() => {
      files[Path.join('path', 'jbr-combinations.json')] = `true`;
      await expect(ExperimentLoader.isCombinationsExperiment('path')).rejects
        .toThrowError(`Found 'jbr-combinations.json' for a combinations-based experiment, but 'jbr-experiment.json.template' is missing.`);
    });

    it('throws if only jbr-experiment.json.template exists', async() => {
      files[Path.join('path', 'jbr-experiment.json.template')] = `true`;
      await expect(ExperimentLoader.isCombinationsExperiment('path')).rejects
        .toThrowError(`Found 'jbr-experiment.json.template' for a combinations-based experiment, but 'jbr-combinations.json' is missing.`);
    });
  });

  describe('requireCombinationsExperiment', () => {
    it('throws if not all required files exist', async() => {
      await expect(ExperimentLoader.requireCombinationsExperiment('path')).rejects
        .toThrowError(`A combinations-based experiments requires the files 'jbr-experiment.json.template' and 'jbr-combinations.json'.`);
    });

    it('does not throw if all required files exist', async() => {
      files[Path.join('path', 'jbr-combinations.json')] = `true`;
      files[Path.join('path', 'jbr-experiment.json.template')] = `true`;
      await ExperimentLoader.requireCombinationsExperiment('path');
    });
  });
});

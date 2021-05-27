import { ComponentsManagerBuilder } from 'componentsjs';
import type { RdfObjectLoader } from 'rdf-object';
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

let files: Record<string, string> = {};
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    async stat(filePath: string) {
      if (filePath in files) {
        return files[filePath];
      }
      throw new Error(`Unknown file in ExperimentLoader tests: ${filePath}`);
    },
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
      instantiate: jest.fn(iri => ({ CONFIG: iri })),
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

  describe('instantiateFromPath', () => {
    it('instantiates a config', async() => {
      files['path/to/experiment/jbr-experiment.json'] = `TRUE`;
      expect(await loader.instantiateFromPath('path/to/experiment'))
        .toEqual({ CONFIG: 'urn:jrb:experiment' });
      expect(componentsManager.configRegistry.register).toHaveBeenCalledWith('path/to/experiment/jbr-experiment.json');
      expect(componentsManager.instantiate).toHaveBeenCalledWith('urn:jrb:experiment');
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
});

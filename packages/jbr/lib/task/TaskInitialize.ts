import * as Path from 'path';
import * as fs from 'fs-extra';
import { ErrorHandled } from '../cli/ErrorHandled';
import { HookNonConfigured } from '../hook/HookNonConfigured';
import type { NpmInstaller } from '../npm/NpmInstaller';
import { ExperimentLoader } from './ExperimentLoader';
import type { ITaskContext } from './ITaskContext';

/**
 * Initializes an experiment of the given type.
 */
export class TaskInitialize {
  private readonly context: ITaskContext;
  private readonly experimentTypeId: string;
  private readonly experimentName: string;
  private readonly targetDirectory: string;
  private readonly forceReInit: boolean;
  private readonly npmInstaller: NpmInstaller;

  public constructor(
    context: ITaskContext,
    experimentTypeId: string,
    experimentName: string,
    targetDirectory: string,
    forceReInit: boolean,
    npmInstaller: NpmInstaller,
  ) {
    this.context = context;
    this.experimentTypeId = experimentTypeId;
    this.experimentName = experimentName;
    this.targetDirectory = Path.join(this.context.cwd, targetDirectory);
    this.forceReInit = forceReInit;
    this.npmInstaller = npmInstaller;
  }

  public async init(): Promise<ITaskInitializeOutput> {
    // Require target not to exist
    if (await fs.pathExists(this.targetDirectory)) {
      if (this.forceReInit) {
        await fs.remove(this.targetDirectory);
      } else {
        throw new ErrorHandled(`The target directory already exists: '${this.targetDirectory}'`);
      }
    }

    // Create experiment directory
    await fs.mkdir(this.targetDirectory);
    await fs.mkdir(Path.join(this.targetDirectory, 'input'));
    await fs.mkdir(Path.join(this.targetDirectory, 'generated'));
    await fs.mkdir(Path.join(this.targetDirectory, 'output'));

    // Create package.json
    const experimentPackageJson = {
      private: true,
      name: this.experimentName,
      dependencies: {},
      scripts: {
        jbr: 'jbr',
        validate: 'jbr validate',
      },
    };
    const packageJsonPath = Path.join(this.targetDirectory, ExperimentLoader.PACKAGEJSON_NAME);
    await fs.writeFile(packageJsonPath, JSON.stringify(experimentPackageJson, null, '  '), 'utf8');

    // Invoke npm install for jbr and experiment
    const experimentPackageName = `@jbr-experiment/${this.experimentTypeId}`;
    await this.npmInstaller.install(this.targetDirectory, [ 'jbr', experimentPackageName ]);

    // Resolve experiment type
    const experimentLoader = await ExperimentLoader.build(this.targetDirectory);
    const experimentTypes = await experimentLoader.discoverExperimentHandlers();
    const experimentTypeWrapped = experimentTypes[this.experimentTypeId];
    if (!experimentTypeWrapped) {
      throw new Error(`Invalid experiment type '${this.experimentTypeId}'. Must be one of '${Object.keys(experimentTypes).join(', ')}'`);
    }
    const { handler: experimentType, contexts } = experimentTypeWrapped;

    // Determine jbr context url
    const jbrContextUrl = JSON.parse(await fs
      .readFile(Path.join(__dirname, '../../components/components.jsonld'), 'utf8'))['@context'][0];

    // Create config
    const experimentIri = ExperimentLoader.getDefaultExperimentIri(this.experimentName);
    const hookNames = experimentType.getHookNames();
    const hookEntries = hookNames.reduce<Record<string, any>>((acc, hookName) => {
      acc[hookName] = {
        '@id': `${experimentIri}:${hookName}`,
        '@type': HookNonConfigured.name,
      };
      return acc;
    }, {});
    const experimentConfig = {
      '@context': [
        jbrContextUrl,
        ...contexts,
      ],
      '@id': experimentIri,
      '@type': experimentType.experimentClassName,
      ...experimentType.getDefaultParams(this.targetDirectory),
      ...hookEntries,
    };
    const configPath = Path.join(this.targetDirectory, ExperimentLoader.CONFIG_NAME);
    await fs.writeFile(configPath, JSON.stringify(experimentConfig, null, '  '), 'utf8');

    // Create .gitignore file
    await fs.writeFile(Path.join(this.targetDirectory, '.gitignore'), `/componentsjs-error-state.json
/node_modules
/generated
/output`, 'utf8');

    // Instantiate experiment for validation
    const experiment = await experimentLoader.instantiateFromConfig(configPath, experimentIri);

    // Invoke the experiment type's init logic
    await experimentType.init(this.targetDirectory, experiment);

    return {
      experimentDirectory: this.targetDirectory,
      hookNames,
    };
  }
}

export interface ITaskInitializeOutput {
  experimentDirectory: string;
  hookNames: string[];
}

import * as spawn from 'cross-spawn';
import type { ITaskContext } from '../../lib/task/ITaskContext';
import { ErrorHandled } from '../cli/ErrorHandled';
import type { NpmInstaller } from './NpmInstaller';

/**
 * Installs npm packages by invoking the CLI.
 */
export class CliNpmInstaller implements NpmInstaller {
  private readonly context: ITaskContext;
  private readonly nextVersion: boolean;

  public constructor(context: ITaskContext, nextVersion: boolean) {
    this.context = context;
    this.nextVersion = nextVersion;
  }

  public async install(cwd: string, packages: string[], scopeError: string): Promise<void> {
    // Append next tag if needed
    if (this.nextVersion) {
      packages = packages.map(pckg => `${pckg}@next`);
    }

    const { error, status, stderr } = spawn.sync('npm', [
      'install',
      ...packages,
      ...this.nextVersion ? [ '--legacy-peer-deps' ] : [],
    ], {
      stdio: 'pipe',
      encoding: 'utf8',
      cwd,
    });
    if (error) {
      throw error;
    }
    if (status !== 0) {
      try {
        const allPackages = await this.fetchPackageNames(scopeError);
        this.context.logger.warn(`\nInstalling package failed.\nAvailable types on npm:\n`);
        for (const pckg of allPackages) {
          this.context.logger.warn(`  - ${pckg.name.slice(`@${scopeError}/`.length)} - ${pckg.description} - ${pckg.link}`);
        }
        this.context.logger.warn(``);
      } catch {
        // Ignore fetch errors
      }
      throw new ErrorHandled(`Npm installation failed for ${packages.join(', ')}:\n${stderr}`);
    }
  }

  public async fetchPackageNames(scope: string): Promise<{ name: string; description: string; link: string }[]> {
    const response = await fetch(`https://api.npms.io/v2/search?q=scope:${scope}`);
    const data = await response.json();
    return data.results.map((result: any) => ({
      name: result.package.name,
      description: result.package.description,
      link: result.package.links.npm,
    }));
  }
}

import * as spawn from 'cross-spawn';
import { ErrorHandled } from '../cli/ErrorHandled';
import type { NpmInstaller } from './NpmInstaller';

/**
 * Installs npm packages by invoking the CLI.
 */
export class CliNpmInstaller implements NpmInstaller {
  private readonly nextVersion: boolean;

  public constructor(nextVersion: boolean) {
    this.nextVersion = nextVersion;
  }

  public async install(cwd: string, packages: string[]): Promise<void> {
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
      throw new ErrorHandled(`Npm installation failed for ${packages.join(', ')}:\n${stderr}`);
    }
  }
}

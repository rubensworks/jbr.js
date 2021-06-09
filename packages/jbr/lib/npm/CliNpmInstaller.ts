import * as spawn from 'cross-spawn';
import { ErrorHandled } from '../cli/ErrorHandled';
import type { NpmInstaller } from './NpmInstaller';

/**
 * Installs npm packages by invoking the CLI.
 */
export class CliNpmInstaller implements NpmInstaller {
  public async install(cwd: string, packages: string[]): Promise<void> {
    const { error, status, stderr } = spawn.sync('npm', [ 'install', ...packages ], {
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

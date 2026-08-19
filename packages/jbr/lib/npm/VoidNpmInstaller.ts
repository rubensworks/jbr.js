import type { NpmInstaller } from './NpmInstaller';

/**
 * A dummy npm installer that does not install anything.
 */
export class VoidNpmInstaller implements NpmInstaller {
  public async install(_cwd: string, _packages: string[]): Promise<void> {
    // Do nothing
  }
}

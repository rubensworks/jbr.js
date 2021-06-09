import type { NpmInstaller } from './NpmInstaller';

/**
 * A dummy npm installer that does not install anything.
 */
export class VoidNpmInstaller implements NpmInstaller {
  public async install(cwd: string, packages: string[]): Promise<void> {
    // Do nothing
  }
}

/**
 * Installs npm packages.
 */
export interface NpmInstaller {
  install: (cwd: string, packages: string[], scopeError: string) => Promise<void>;
}

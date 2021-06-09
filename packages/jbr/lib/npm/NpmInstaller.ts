/**
 * Installs npm packages.
 */
export interface NpmInstaller {
  install: (cwd: string, packages: string[]) => Promise<void>;
}

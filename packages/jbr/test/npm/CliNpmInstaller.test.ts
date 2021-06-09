import * as spawn from 'cross-spawn';
import { CliNpmInstaller } from '../../lib/npm/CliNpmInstaller';

jest.mock('cross-spawn', () => ({
  sync: jest.fn(() => ({ error: undefined, status: 0 })),
}));

describe('CliNpmInstaller', () => {
  let installer: CliNpmInstaller;
  beforeEach(() => {
    installer = new CliNpmInstaller();
  });

  describe('install', () => {
    it('should handle process with exit code 0', async() => {
      await installer.install('CWD', [ 'package' ]);
    });

    it('should reject on spawn errors', async() => {
      (<any> spawn.sync).mockImplementation(() => ({ error: new Error('NPM INSTALL FAILURE') }));
      await expect(installer.install('CWD', [ 'package' ])).rejects.toThrowError('NPM INSTALL FAILURE');
    });

    it('should reject on shell errors', async() => {
      (<any> spawn.sync).mockImplementation(() => ({ status: 1, stderr: 'MY ERROR' }));
      await expect(installer.install('CWD', [ 'package' ])).rejects
        .toThrowError(`Npm installation failed for package:\nMY ERROR`);
    });
  });
});

import * as spawn from 'cross-spawn';
import type { ITaskContext } from '../..';
import { createExperimentPaths } from '../..';
import { CliNpmInstaller } from '../../lib/npm/CliNpmInstaller';
import { TestLogger } from '../TestLogger';

jest.mock('cross-spawn', () => ({
  sync: jest.fn(() => ({ error: undefined, status: 0 })),
}));

let fetchError: Error | undefined;
jest.mock('cross-fetch', () => ({
  async fetch() {
    if (fetchError) {
      throw fetchError;
    }
    return {
      json: async() => ({
        results: [
          {
            package: {
              name: '@scope/aa',
              description: 'Descr a',
              links: {
                npm: 'LINK A',
              },
            },
          },
          {
            package: {
              name: '@scope/bb',
              description: 'Descr b',
              links: {
                npm: 'LINK B',
              },
            },
          },
        ],
      }),
    };
  },
}));

describe('CliNpmInstaller', () => {
  let context: ITaskContext;
  let installer: CliNpmInstaller;

  beforeEach(() => {
    context = {
      cwd: 'CWD',
      experimentPaths: createExperimentPaths('CWD'),
      mainModulePath: 'MMP',
      verbose: true,
      cleanupHandlers: [],
      logger: <any> new TestLogger(),
      docker: <any> {},
    };
    (<any> spawn.sync).mockImplementation(() => ({ error: undefined, status: 0 }));
    fetchError = undefined;
  });

  describe('without next version', () => {
    beforeEach(() => {
      installer = new CliNpmInstaller(context, false);
    });

    describe('install', () => {
      it('should handle process with exit code 0', async() => {
        await installer.install('CWD', [ 'package' ], 'scope');
      });

      it('should reject on spawn errors', async() => {
        (<any> spawn.sync).mockImplementation(() => ({ error: new Error('NPM INSTALL FAILURE') }));
        await expect(installer.install('CWD', [ 'package' ], 'scope')).rejects.toThrowError('NPM INSTALL FAILURE');
      });

      it('should reject on shell errors', async() => {
        (<any> spawn.sync).mockImplementation(() => ({ status: 1, stderr: 'MY ERROR' }));
        await expect(installer.install('CWD', [ 'package' ], 'scope')).rejects
          .toThrowError(`Npm installation failed for package:\nMY ERROR`);
      });
    });
  });

  describe('for next version', () => {
    beforeEach(() => {
      installer = new CliNpmInstaller(context, true);
    });

    describe('install', () => {
      it('should handle process with exit code 0', async() => {
        await installer.install('CWD', [ 'package' ], 'scope');
      });

      it('should reject on spawn errors', async() => {
        (<any> spawn.sync).mockImplementation(() => ({ error: new Error('NPM INSTALL FAILURE') }));
        await expect(installer.install('CWD', [ 'package' ], 'scope')).rejects
          .toThrowError('NPM INSTALL FAILURE');
      });

      it('should reject on shell errors', async() => {
        (<any> spawn.sync).mockImplementation(() => ({ status: 1, stderr: 'MY ERROR' }));

        await expect(installer.install('CWD', [ 'package' ], 'scope')).rejects
          .toThrowError(`Npm installation failed for package@next:\nMY ERROR`);

        expect(context.logger.warn).toHaveBeenCalledTimes(4);
        expect(context.logger.warn).toHaveBeenCalledWith(`\nInstalling package failed.\nAvailable types on npm:\n`);
        expect(context.logger.warn).toHaveBeenCalledWith(`  - aa - Descr a - LINK A`);
        expect(context.logger.warn).toHaveBeenCalledWith(`  - bb - Descr b - LINK B`);
        expect(context.logger.warn).toHaveBeenCalledWith(``);
      });

      it('should reject on shell errors and ignore fetch errors', async() => {
        (<any> spawn.sync).mockImplementation(() => ({ status: 1, stderr: 'MY ERROR' }));
        fetchError = new Error('FETCH ERROR');

        await expect(installer.install('CWD', [ 'package' ], 'scope')).rejects
          .toThrowError(`Npm installation failed for package@next:\nMY ERROR`);

        expect(context.logger.warn).toHaveBeenCalledTimes(0);
      });
    });
  });
});

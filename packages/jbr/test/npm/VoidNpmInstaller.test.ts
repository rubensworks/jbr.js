import { VoidNpmInstaller } from '../../lib/npm/VoidNpmInstaller';

describe('VoidNpmInstaller', () => {
  let installer: VoidNpmInstaller;
  beforeEach(() => {
    installer = new VoidNpmInstaller();
  });

  describe('install', () => {
    it('should not crash', async() => {
      await installer.install('CWD', [ 'package' ]);
    });
  });
});

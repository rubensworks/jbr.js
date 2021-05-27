import { HookNonConfigured } from '../../lib/hook/HookNonConfigured';

describe('HookNonConfigured', () => {
  let hook: HookNonConfigured;
  beforeEach(() => {
    hook = new HookNonConfigured();
  });

  describe('prepare', () => {
    it('always throws', async() => {
      await expect(hook.prepare(<any> {})).rejects.toThrow(`Unable to run an experiment with a non-configured hook ('ExperimentHookNonConfigured').
Initialize this hook via 'jbr set-hook <hook> <handler>'`);
    });
  });

  describe('start', () => {
    it('always throws', async() => {
      await expect(hook.start(<any> {})).rejects.toThrow(`Unable to run an experiment with a non-configured hook ('ExperimentHookNonConfigured').
Initialize this hook via 'jbr set-hook <hook> <handler>'`);
    });
  });
});

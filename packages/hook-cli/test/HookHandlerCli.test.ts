import type { IExperimentPaths } from 'jbr';
import { createExperimentPaths } from 'jbr';
import { HookHandlerCli } from '../lib/HookHandlerCli';

describe('HookHandlerCli', () => {
  let handler: HookHandlerCli;
  let experimentPaths: IExperimentPaths;
  beforeEach(() => {
    handler = new HookHandlerCli();
    experimentPaths = createExperimentPaths('dir');
  });

  describe('exposes public fields', () => {
    it('should expose an id', () => {
      expect(handler.id).toEqual('cli');
    });

    it('should expose an experimentClassName', () => {
      expect(handler.hookClassName).toEqual('HookCli');
    });
  });

  describe('getDefaultParams', () => {
    it('returns a hash', () => {
      expect(handler.getDefaultParams(experimentPaths)).toBeInstanceOf(Object);
      expect(Object.entries(handler.getDefaultParams(experimentPaths)).length).toEqual(1);
    });
  });

  describe('getSubHookNames', () => {
    it('returns an empty array', () => {
      expect(handler.getSubHookNames()).toEqual([]);
    });
  });

  describe('init', () => {
    it('does nothing', async() => {
      await handler.init(experimentPaths, <any> {});
    });
  });
});

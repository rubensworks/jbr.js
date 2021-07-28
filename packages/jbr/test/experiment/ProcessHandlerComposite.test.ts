import type { ProcessHandler } from '../../lib/experiment/ProcessHandler';
import { ProcessHandlerComposite } from '../../lib/experiment/ProcessHandlerComposite';

describe('ProcessHandlerComposite', () => {
  let stopCollecting1: () => void;
  let stopCollecting2: () => void;
  let stopCollecting3: () => void;
  let subHandler1: ProcessHandler;
  let subHandler2: ProcessHandler;
  let subHandler3: ProcessHandler;
  let handler: ProcessHandlerComposite;
  beforeEach(() => {
    stopCollecting1 = jest.fn();
    stopCollecting2 = jest.fn();
    stopCollecting3 = jest.fn();
    subHandler1 = {
      close: jest.fn(),
      join: jest.fn(),
      startCollectingStats: jest.fn(async() => stopCollecting1),
    };
    subHandler2 = {
      close: jest.fn(),
      join: jest.fn(),
      startCollectingStats: jest.fn(async() => stopCollecting2),
    };
    subHandler3 = {
      close: jest.fn(),
      join: jest.fn(),
      startCollectingStats: jest.fn(async() => stopCollecting3),
    };
    handler = new ProcessHandlerComposite([
      subHandler1,
      subHandler2,
      subHandler3,
    ]);
  });

  describe('close', () => {
    it('closes all sub handlers', async() => {
      await handler.close();
      expect(subHandler1.close).toHaveBeenCalledTimes(1);
      expect(subHandler2.close).toHaveBeenCalledTimes(1);
      expect(subHandler3.close).toHaveBeenCalledTimes(1);
    });

    it('with a single erroring handler still closes all', async() => {
      subHandler1.close = jest.fn(() => Promise.reject(new Error('Fail sub handler 1')));

      await expect(handler.close()).rejects.toThrowError('Fail sub handler 1');

      expect(subHandler1.close).toHaveBeenCalledTimes(1);
      expect(subHandler2.close).toHaveBeenCalledTimes(1);
      expect(subHandler3.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('join', () => {
    it('joins all sub handlers', async() => {
      await handler.join();
      expect(subHandler1.join).toHaveBeenCalledTimes(1);
      expect(subHandler2.join).toHaveBeenCalledTimes(1);
      expect(subHandler3.join).toHaveBeenCalledTimes(1);
    });

    it('with a single erroring handler stops further joins', async() => {
      subHandler2.join = jest.fn(() => Promise.reject(new Error('Fail sub handler 2')));

      await expect(handler.join()).rejects.toThrowError('Fail sub handler 2');

      expect(subHandler1.join).toHaveBeenCalledTimes(1);
      expect(subHandler2.join).toHaveBeenCalledTimes(1);
      expect(subHandler3.join).toHaveBeenCalledTimes(0);
    });
  });

  describe('startCollectingStats', () => {
    it('startCollectingStats all sub handlers', async() => {
      const cb = await handler.startCollectingStats();
      expect(subHandler1.startCollectingStats).toHaveBeenCalledTimes(1);
      expect(subHandler2.startCollectingStats).toHaveBeenCalledTimes(1);
      expect(subHandler3.startCollectingStats).toHaveBeenCalledTimes(1);

      expect(stopCollecting1).not.toHaveBeenCalled();
      expect(stopCollecting2).not.toHaveBeenCalled();
      expect(stopCollecting3).not.toHaveBeenCalled();

      cb();

      expect(stopCollecting1).toHaveBeenCalledTimes(1);
      expect(stopCollecting2).toHaveBeenCalledTimes(1);
      expect(stopCollecting3).toHaveBeenCalledTimes(1);
    });
  });
});

import { createExperimentPaths } from '../../lib/cli/CliHelpers';
import type { ITaskContext } from '../../lib/task/ITaskContext';
import { HttpAvailabilityLatch } from '../../lib/util/HttpAvailabilityLatch';
import { TestLogger } from '../TestLogger';

describe('HttpAvailabilityLatch', () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  let logger: any;
  let context: ITaskContext;
  let latch: HttpAvailabilityLatch;
  beforeEach(() => {
    logger = new TestLogger();
    context = <any> {
      cwd: 'CWD',
      experimentPaths: createExperimentPaths('CWD'),
      experimentName: 'EXP',
      mainModulePath: 'MMP',
      verbose: true,
      closeExperiment: jest.fn(),
      cleanupHandlers: [],
      logger,
    };
    latch = new HttpAvailabilityLatch();
  });

  describe('countTime', () => {
    it('returns duration in milliseconds', async() => {
      process.hrtime = <any> (() => [ 1, 1_000_000 ]);
      expect(latch.countTime([ 10, 10 ])).toBe(1_001);
    });
  });

  describe('isEndpointAvailable', () => {
    it('returns true for a valid endpoint', async() => {
      // eslint-disable-next-line no-undef
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(<Response>{ ok: true });
      await expect(latch.isEndpointAvailable('http://localhost:8080/')).resolves.toBeTruthy();
    });

    it('returns false for an invalid endpoint', async() => {
      // eslint-disable-next-line no-undef
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(<Response>{ ok: false });
      await expect(latch.isEndpointAvailable('http://localhost:8080/')).resolves.toBeFalsy();
    });

    it('returns false for a hanging request', async() => {
      // eslint-disable-next-line no-undef
      jest.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {
        // Do nothing
      }));
      const available = latch.isEndpointAvailable('http://localhost:8080/');
      await jest.runAllTimersAsync();
      await expect(available).resolves.toBeFalsy();
    });

    it('returns false for an erroring request', async() => {
      // eslint-disable-next-line no-undef
      jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Endpoint fetch failed'));
      const available = latch.isEndpointAvailable('http://localhost:8080/');
      await expect(available).resolves.toBeFalsy();
    });
  });

  describe('sleepUntilAvailable', () => {
    it('returns true for a valid endpoint', async() => {
      // eslint-disable-next-line no-undef
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(<Response>{ ok: true });
      await expect(latch.sleepUntilAvailable(context, 'http://localhost:8080/')).resolves.toBe(undefined);
    });

    it('returns true for an endpoint that becomes available later', async() => {
      let ok = false;
      // eslint-disable-next-line no-undef
      jest.spyOn(globalThis, 'fetch').mockImplementation(async() => <Response>({ ok }));

      const resolve = jest.fn();
      const p = latch.sleepUntilAvailable(context, 'http://localhost:8080/');
      p.then(resolve, resolve);

      await jest.runOnlyPendingTimersAsync();
      expect(resolve).not.toHaveBeenCalled();

      ok = true;

      await jest.runOnlyPendingTimersAsync();
      expect(resolve).toHaveBeenCalled();
    });
  });
});

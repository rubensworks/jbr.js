import * as Path from 'node:path';
import { createExperimentPaths, wrapCommandHandler } from '../../lib/cli/CliHelpers';
import type { ITaskContext } from '../../lib/task/ITaskContext';

jest.mock<any>('dockerode');

describe('CliHelpers', () => {
  describe('createExperimentPaths', () => {
    it('creates paths without combination', () => {
      expect(createExperimentPaths('base')).toEqual({
        root: 'base',
        input: Path.join('base', 'input'),
        generated: Path.join('base', 'generated'),
        output: Path.join('base', 'output'),
        combination: undefined,
      });
    });
  });

  describe('wrapCommandHandler', () => {
    const argv = {
      cwd: 'CWD',
      mainModulePath: 'MMP',
      verbose: false,
      dockerOptions: undefined,
      breakpoints: undefined,
    };
    let processListeners: Record<string, (arg?: unknown) => void>;
    let exitSpy: jest.SpyInstance;
    let context: ITaskContext | undefined;

    beforeEach(() => {
      processListeners = {};
      jest.spyOn(process, 'on').mockImplementation(<any>((event: string, listener: (arg?: unknown) => void) => {
        processListeners[event] = listener;
        return process;
      }));
      exitSpy = jest.spyOn(process, 'exit').mockImplementation(<any>(() => {
        // Do nothing
      }));
      context = undefined;
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    async function captureContext(ctx: ITaskContext): Promise<void> {
      context = ctx;
      jest.spyOn(ctx.logger, 'info').mockImplementation(<any>(() => {
        // Do nothing
      }));
      jest.spyOn(ctx.logger, 'error').mockImplementation(<any>(() => {
        // Do nothing
      }));
    }

    async function flushPromises(): Promise<void> {
      await new Promise(setImmediate);
      await new Promise(setImmediate);
    }

    it('runs a handler that resolves', async() => {
      const handler = jest.fn(captureContext);
      await wrapCommandHandler(argv, handler);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(context!.experimentName).toBe('dummy');
      expect(exitSpy).not.toHaveBeenCalled();
      expect(processListeners.SIGINT).toBeDefined();
      expect(processListeners.SIGTERM).toBeDefined();
      expect(processListeners.uncaughtException).toBeDefined();
    });

    it('exits with code 1 when the handler rejects', async() => {
      await wrapCommandHandler(argv, async(ctx) => {
        await captureContext(ctx);
        throw new Error('CliHelpers handler error');
      });

      expect(context!.logger.error).toHaveBeenCalledWith(expect.stringContaining('CliHelpers handler error'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('logs only the message of handled errors when the handler rejects', async() => {
      await wrapCommandHandler(argv, async(ctx) => {
        await captureContext(ctx);
        const error = new Error('CliHelpers handled error');
        (<any> error).handled = true;
        throw error;
      });

      expect(context!.logger.error).toHaveBeenCalledWith('CliHelpers handled error');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('runs cleanup handlers and exits on SIGINT', async() => {
      const cleanupHandler = jest.fn();
      await wrapCommandHandler(argv, async(ctx) => {
        await captureContext(ctx);
        ctx.cleanupHandlers.push(cleanupHandler);
      });

      processListeners.SIGINT();
      await flushPromises();

      expect(cleanupHandler).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('logs cleanup handler failures and still exits on SIGTERM', async() => {
      const cleanupHandler = jest.fn()
        .mockRejectedValue(new Error('CliHelpers cleanup error'));
      await wrapCommandHandler(argv, async(ctx) => {
        await captureContext(ctx);
        ctx.cleanupHandlers.push(cleanupHandler);
      });

      processListeners.SIGTERM();
      await flushPromises();

      expect(context!.logger.error).toHaveBeenCalledWith(expect.stringContaining('CliHelpers cleanup error'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('logs errors thrown by the cleanup itself', async() => {
      await wrapCommandHandler(argv, captureContext);
      exitSpy.mockImplementation(() => {
        throw new Error('CliHelpers exit error');
      });

      processListeners.SIGINT();
      await flushPromises();

      expect(context!.logger.error).toHaveBeenCalledWith(expect.stringContaining('CliHelpers exit error'));
    });

    it('prints uncaught exceptions before cleaning up', async() => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {
        // Do nothing
      });
      await wrapCommandHandler(argv, captureContext);

      processListeners.uncaughtException(new Error('CliHelpers uncaught error'));
      await flushPromises();

      expect(consoleErrorSpy).toHaveBeenCalledWith('Uncaught Exception:');
      expect(consoleErrorSpy).toHaveBeenCalledWith(new Error('CliHelpers uncaught error'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});

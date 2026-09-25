import type { ChildProcess } from 'node:child_process';
import EventEmitter from 'node:events';
import { CliProcessHandler } from '../../lib/process/CliProcessHandler';

let write: any;
let streamEnd: any;
let pidusageError: Error | undefined;
let pidtreeError: Error | undefined;
jest.mock<any>('node:fs', () => ({
  existsSync: jest.requireActual('node:fs').existsSync,
  createWriteStream: () => ({
    write,
    end: streamEnd,
  }),
}));
jest.mock<any>('pidusage', () => async(pids: number[]) => {
  if (pidusageError) {
    throw pidusageError;
  }
  return Object.fromEntries(pids.map(pid => [ pid, { cpu: 1, memory: 100 }]));
});
jest.mock<any>('pidtree', () => async(pid: number) => {
  if (pidtreeError) {
    throw pidtreeError;
  }
  return [ pid, 456 ];
});
jest.useFakeTimers();

describe('CliProcessHandler', () => {
  let childProcess: ChildProcess;
  let handler: CliProcessHandler;

  beforeEach(() => {
    childProcess = <any> Object.assign(new EventEmitter(), {
      kill: () => true,
      pid: 123,
    });
    jest.spyOn(childProcess, 'kill').mockImplementation(() => {
      setImmediate(() => {
        childProcess.emit('close');
      });
      return true;
    });
    handler = new CliProcessHandler(childProcess, 'out.csv');
    write = jest.fn();
    streamEnd = jest.fn();
    pidusageError = undefined;
    pidtreeError = undefined;
  });

  describe('close', () => {
    it('stops a process', async() => {
      const p = handler.close();
      jest.runAllTimers();
      await p;
      expect(childProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('stops a process and stops streams', async() => {
      (<any> childProcess).stdin = { end: jest.fn() };
      (<any> childProcess).stdout = { unpipe: jest.fn() };
      (<any> childProcess).stderr = { unpipe: jest.fn() };

      const p = handler.close();
      jest.runAllTimers();
      await p;
      expect(childProcess.kill).toHaveBeenCalledWith('SIGTERM');

      expect(childProcess.stdin!.end).toHaveBeenCalledWith();
      expect(childProcess.stdout!.unpipe).toHaveBeenCalledWith();
      expect(childProcess.stderr!.unpipe).toHaveBeenCalledWith();
    });

    it('kills a process if SIGTERM has no effect', async() => {
      jest.spyOn(childProcess, 'kill').mockImplementation((signal) => {
        if (signal === 'SIGKILL') {
          setImmediate(() => {
            childProcess.emit('close');
          });
        }
        jest.runAllTimers();
        return true;
      });

      const p = handler.close();
      jest.runAllTimers();
      await p;
      expect(childProcess.kill).toHaveBeenCalledTimes(2);
    });

    it('stops the process group if enabled', async() => {
      handler = new CliProcessHandler(childProcess, 'out.csv', true);
      const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => {
        setImmediate(() => {
          childProcess.emit('close');
        });
        return true;
      });

      const p = handler.close();
      jest.runAllTimers();
      await p;
      expect(killSpy).toHaveBeenCalledWith(-123, 'SIGTERM');
      expect(childProcess.kill).not.toHaveBeenCalled();
      killSpy.mockRestore();
    });

    it('kills the process group if SIGTERM has no effect', async() => {
      handler = new CliProcessHandler(childProcess, 'out.csv', true);
      const killSpy = jest.spyOn(process, 'kill').mockImplementation((_pid, signal) => {
        if (signal === 'SIGKILL') {
          setImmediate(() => {
            childProcess.emit('close');
          });
        }
        return true;
      });

      const p = handler.close();
      jest.runAllTimers();
      await p;
      expect(killSpy).toHaveBeenCalledWith(-123, 'SIGTERM');
      expect(killSpy).toHaveBeenCalledWith(-123, 'SIGKILL');
      expect(childProcess.kill).not.toHaveBeenCalled();
      killSpy.mockRestore();
    });

    it('falls back to the child process if the process group can not be signalled', async() => {
      handler = new CliProcessHandler(childProcess, 'out.csv', true);
      const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => {
        throw new Error('ESRCH');
      });

      const p = handler.close();
      jest.runAllTimers();
      await p;
      expect(killSpy).toHaveBeenCalledWith(-123, 'SIGTERM');
      expect(childProcess.kill).toHaveBeenCalledWith('SIGTERM');
      killSpy.mockRestore();
    });

    it('stops only the child process if the process group is enabled without pid', async() => {
      delete (<any> childProcess).pid;
      handler = new CliProcessHandler(childProcess, 'out.csv', true);
      const killSpy = jest.spyOn(process, 'kill');

      const p = handler.close();
      jest.runAllTimers();
      await p;
      expect(killSpy).not.toHaveBeenCalled();
      expect(childProcess.kill).toHaveBeenCalledWith('SIGTERM');
      killSpy.mockRestore();
    });

    it('does nothing if the process has already ended', async() => {
      childProcess.emit('close');

      await handler.close();

      expect(childProcess.kill).not.toHaveBeenCalled();
    });

    it('does nothing if the process has errored', async() => {
      childProcess.emit('error', new Error('Process error'));

      await handler.close();

      expect(childProcess.kill).not.toHaveBeenCalled();
    });
  });

  describe('join', () => {
    it('waits until a process ends', async() => {
      const onResolve = jest.fn();
      const onReject = jest.fn();

      // eslint-disable-next-line unicorn/require-array-join-separator -- not an array join
      handler.join().then(onResolve, onReject);
      await singleTick();

      expect(onResolve).not.toHaveBeenCalled();
      expect(onReject).not.toHaveBeenCalled();

      childProcess.emit('close');
      await singleTick();

      expect(onResolve).toHaveBeenCalledWith(undefined);
      expect(onReject).not.toHaveBeenCalled();
    });

    it('rejects if a process threw an error', async() => {
      const onResolve = jest.fn();
      const onReject = jest.fn();

      // eslint-disable-next-line unicorn/require-array-join-separator -- not an array join
      handler.join().then(onResolve, onReject);
      await singleTick();

      expect(onResolve).not.toHaveBeenCalled();
      expect(onReject).not.toHaveBeenCalled();

      childProcess.emit('error', new Error('CliProcessHandler test error'));
      await singleTick();

      expect(onResolve).not.toHaveBeenCalled();
      expect(onReject).toHaveBeenCalledWith(new Error('CliProcessHandler test error'));
    });

    it('returns immediately if a process is already finished', async() => {
      const onResolve = jest.fn();
      const onReject = jest.fn();

      childProcess.emit('close');
      await singleTick();

      // eslint-disable-next-line unicorn/require-array-join-separator -- not an array join
      handler.join().then(onResolve, onReject);
      await singleTick();

      expect(onResolve).toHaveBeenCalledWith(undefined);
      expect(onReject).not.toHaveBeenCalled();
    });

    it('rejects immediately if a process already threw', async() => {
      const onResolve = jest.fn();
      const onReject = jest.fn();

      childProcess.emit('error', new Error('CliProcessHandler test error'));
      await singleTick();

      // eslint-disable-next-line unicorn/require-array-join-separator -- not an array join
      handler.join().then(onResolve, onReject);
      await singleTick();

      expect(onResolve).not.toHaveBeenCalled();
      expect(onReject).toHaveBeenCalledWith(new Error('CliProcessHandler test error'));
    });
  });

  describe('startCollectingStats', () => {
    it('handles a valid stream, summing stats over the process tree', async() => {
      const stop = await handler.startCollectingStats();
      await jest.advanceTimersByTimeAsync(2000);

      expect(write).toHaveBeenCalledTimes(3);
      expect(write).toHaveBeenNthCalledWith(1, `cpu_percentage,memory\n`);
      expect(write).toHaveBeenNthCalledWith(2, `2,200\n`);
      expect(write).toHaveBeenNthCalledWith(3, `2,200\n`);

      expect(streamEnd).not.toHaveBeenCalled();
      stop();
      expect(streamEnd).toHaveBeenCalledWith();
    });

    it('ignores pidusage errors', async() => {
      pidusageError = new Error('pidusage error');

      const stop = await handler.startCollectingStats();
      await jest.advanceTimersByTimeAsync(2000);

      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith(`cpu_percentage,memory\n`);

      stop();
      expect(streamEnd).toHaveBeenCalledWith();
    });

    it('ignores pidtree errors', async() => {
      pidtreeError = new Error('pidtree error');

      const stop = await handler.startCollectingStats();
      await jest.advanceTimersByTimeAsync(2000);

      expect(write).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith(`cpu_percentage,memory\n`);

      stop();
      expect(streamEnd).toHaveBeenCalledWith();
    });

    it('is a no-op for no statsFilePath', async() => {
      handler = new CliProcessHandler(childProcess);

      const stop = await handler.startCollectingStats();
      expect(write).toHaveBeenCalledTimes(0);

      expect(streamEnd).not.toHaveBeenCalled();
      stop();
      expect(streamEnd).not.toHaveBeenCalled();
    });
  });

  describe('with termination listeners', () => {
    it('calls a termination listener on end', () => {
      const termHandler = jest.fn();

      handler.addTerminationHandler(termHandler);

      childProcess.emit('close');

      expect(termHandler).toHaveBeenCalledWith(`CLI process (123)`, undefined);
    });

    it('calls a termination listener on error', () => {
      const termHandler = jest.fn();

      handler.addTerminationHandler(termHandler);

      childProcess.emit('error', new Error('my error'));

      expect(termHandler).toHaveBeenCalledWith(`CLI process (123)`, new Error('my error'));
    });

    it('calls a termination listener after end and error', () => {
      const termHandler = jest.fn();

      handler.addTerminationHandler(termHandler);

      childProcess.emit('close');
      childProcess.emit('error', new Error('my error'));

      expect(termHandler).toHaveBeenCalledTimes(1);

      expect(termHandler).toHaveBeenCalledWith(`CLI process (123)`, undefined);
    });

    it('calls a termination listener after error and end', () => {
      const termHandler = jest.fn();

      handler.addTerminationHandler(termHandler);

      childProcess.emit('error', new Error('my error'));
      childProcess.emit('end');

      expect(termHandler).toHaveBeenCalledTimes(1);

      expect(termHandler).toHaveBeenCalledWith(`CLI process (123)`, new Error('my error'));
    });

    it('does not call a termination listener on end if it has been removed', () => {
      const termHandler = jest.fn();

      handler.addTerminationHandler(termHandler);
      handler.removeTerminationHandler(termHandler);

      childProcess.emit('close');

      expect(termHandler).not.toHaveBeenCalled();
    });
  });
});

async function singleTick(): Promise<void> {
  const p = new Promise(setImmediate);
  jest.runAllTimers();
  await p;
}

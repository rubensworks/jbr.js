import type { ChildProcess } from 'node:child_process';
import EventEmitter from 'node:events';
import { CliProcessHandler } from '../../lib/process/CliProcessHandler';

let write: any;
let streamEnd: any;
jest.mock('fs', () => ({
  existsSync: jest.requireActual('fs').existsSync,
  createWriteStream: () => ({
    write,
    end: streamEnd,
  }),
}));
jest.mock('pidusage', () => (pid: any, cb: any) => {
  return cb(undefined, { cpu: 1, memory: 100 });
});
jest.useFakeTimers();

describe('CliProcessHandler', () => {
  let childProcess: ChildProcess;
  let handler: CliProcessHandler;

  beforeEach(() => {
    childProcess = <any> new EventEmitter();
    (<any> childProcess).kill = jest.fn(() => {
      setImmediate(() => {
        childProcess.emit('close');
      });
    });
    (<any> childProcess).pid = 123;
    handler = new CliProcessHandler(childProcess, 'out.csv');
    write = jest.fn();
    streamEnd = jest.fn();
  });

  describe('close', () => {
    it('stops a process', async() => {
      const p = handler.close();
      jest.runAllTimers();
      await p;
      expect(childProcess.kill).toHaveBeenCalled();
    });

    it('kills a process if SIGTERM has no effect', async() => {
      (<any> childProcess).kill = jest.fn(signal => {
        if (signal === 'SIGKILL') {
          setImmediate(() => {
            childProcess.emit('close');
          });
        }
        jest.runAllTimers();
      });

      const p = handler.close();
      jest.runAllTimers();
      await p;
      expect(childProcess.kill).toHaveBeenCalledTimes(2);
    });
  });

  describe('join', () => {
    it('waits until a process ends', async() => {
      const onResolve = jest.fn();
      const onReject = jest.fn();

      handler.join().then(onResolve, onReject);
      await singleTick();

      expect(onResolve).not.toHaveBeenCalled();
      expect(onReject).not.toHaveBeenCalled();

      childProcess.emit('close');
      await singleTick();

      expect(onResolve).toHaveBeenCalled();
      expect(onReject).not.toHaveBeenCalled();
    });

    it('rejects if a process threw an error', async() => {
      const onResolve = jest.fn();
      const onReject = jest.fn();

      handler.join().then(onResolve, onReject);
      await singleTick();

      expect(onResolve).not.toHaveBeenCalled();
      expect(onReject).not.toHaveBeenCalled();

      childProcess.emit('error', new Error('CliProcessHandler test error'));
      await singleTick();

      expect(onResolve).not.toHaveBeenCalled();
      expect(onReject).toHaveBeenCalled();
    });

    it('returns immediately if a process is already finished', async() => {
      const onResolve = jest.fn();
      const onReject = jest.fn();

      childProcess.emit('close');
      await singleTick();

      handler.join().then(onResolve, onReject);
      await singleTick();

      expect(onResolve).toHaveBeenCalled();
      expect(onReject).not.toHaveBeenCalled();
    });

    it('rejects immediately if a process already threw', async() => {
      const onResolve = jest.fn();
      const onReject = jest.fn();

      childProcess.emit('error', new Error('CliProcessHandler test error'));
      await singleTick();

      handler.join().then(onResolve, onReject);
      await singleTick();

      expect(onResolve).not.toHaveBeenCalled();
      expect(onReject).toHaveBeenCalled();
    });
  });

  describe('startCollectingStats', () => {
    it('handles a valid stream', async() => {
      const stop = await handler.startCollectingStats();
      jest.advanceTimersByTime(2000);

      expect(write).toHaveBeenCalledTimes(3);
      expect(write).toHaveBeenCalledWith(`cpu_percentage,memory\n`);
      expect(write).toHaveBeenCalledWith(`1,100\n`);
      expect(write).toHaveBeenCalledWith(`1,100\n`);

      expect(streamEnd).not.toHaveBeenCalled();
      stop();
      expect(streamEnd).toHaveBeenCalled();
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

      // eslint-disable-next-line unicorn/no-useless-undefined
      expect(termHandler).toHaveBeenCalledWith(`CLI process (123)`, undefined);
    });

    it('calls a termination listener on error', () => {
      const termHandler = jest.fn();

      handler.addTerminationHandler(termHandler);

      childProcess.emit('error', new Error('my error'));

      // eslint-disable-next-line unicorn/no-useless-undefined
      expect(termHandler).toHaveBeenCalledWith(`CLI process (123)`, new Error('my error'));
    });

    it('calls a termination listener after end and error', () => {
      const termHandler = jest.fn();

      handler.addTerminationHandler(termHandler);

      childProcess.emit('close');
      childProcess.emit('error', new Error('my error'));

      expect(termHandler).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line unicorn/no-useless-undefined
      expect(termHandler).toHaveBeenCalledWith(`CLI process (123)`, undefined);
    });

    it('calls a termination listener after error and end', () => {
      const termHandler = jest.fn();

      handler.addTerminationHandler(termHandler);

      childProcess.emit('error', new Error('my error'));
      childProcess.emit('end');

      expect(termHandler).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line unicorn/no-useless-undefined
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

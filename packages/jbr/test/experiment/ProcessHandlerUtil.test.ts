import type { ChildProcess } from 'node:child_process';
import EventEmitter from 'node:events';
import { secureProcessHandler } from '../../lib/experiment/ProcessHandlerUtil';
import { CliProcessHandler } from '../../lib/process/CliProcessHandler';
import type { ITaskContext } from '../../lib/task/ITaskContext';

describe('secureProcessHandler', () => {
  let childProcess: ChildProcess;
  let handler: CliProcessHandler;
  let context: ITaskContext;

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
    context = <any> {
      logger: { error: jest.fn() },
      closeExperiment: jest.fn(),
      cleanupHandlers: [],
    };
  });

  it('handles terminations', () => {
    secureProcessHandler(handler, context);

    (<any> handler).onTerminated();

    expect(context.logger.error).toHaveBeenCalledWith(`A process (CLI process (123)) exited prematurely.
This may be caused by a software error or insufficient memory being allocated to the system or Docker.
Please inspect the output logs for more details.`);
    expect(context.closeExperiment).toHaveBeenCalledWith();
  });

  it('handles error terminations', () => {
    secureProcessHandler(handler, context);

    (<any> handler).onTerminated(new Error('ERROR'));

    expect(context.logger.error).toHaveBeenCalledWith(`A process (CLI process (123)) exited prematurely with error 'ERROR'.
This may be caused by a software error or insufficient memory being allocated to the system or Docker.
Please inspect the output logs for more details.`);
    expect(context.closeExperiment).toHaveBeenCalledWith();
  });
});

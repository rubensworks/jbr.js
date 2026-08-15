import type * as Dockerode from 'dockerode';
import * as fs from 'fs-extra';
import { DockerContainerCreator } from '../../lib/docker/DockerContainerCreator';
import { DockerContainerHandler } from '../../lib/docker/DockerContainerHandler';

jest.mock<any>('fs-extra', () => ({
  createWriteStream: jest.fn(),
}));

describe('DockerContainerCreator', () => {
  let container: any;
  let dockerode: Dockerode;
  let creator: DockerContainerCreator;
  beforeEach(() => {
    container = {
      attach: jest.fn(() => ({ pipe: jest.fn(), on: jest.fn(), resume: jest.fn() })),
      start: jest.fn(),
      kill: jest.fn(),
      remove: jest.fn(),
    };
    dockerode = <any> {
      createContainer: jest.fn(() => container),
      getContainer: jest.fn(() => container),
    };
    creator = new DockerContainerCreator(dockerode);
  });

  describe('start', () => {
    it('creates a container via the proper steps', async() => {
      const handler = await creator.start({
        imageName: 'IMAGE',
        resourceConstraints: {
          toHostConfig: () => ({ Memory: 123 }),
        },
        hostConfig: {
          Binds: [
            `a:b`,
          ],
        },
        logFilePath: 'LOGPATH',
        statsFilePath: 'STATSPATH',
      });
      expect(handler).toBeInstanceOf(DockerContainerHandler);
      expect(handler.container).toBe(container);
      expect(handler.statsFilePath).toBe('STATSPATH');

      expect(dockerode.createContainer).toHaveBeenCalledWith({
        Image: 'IMAGE',
        Tty: true,
        AttachStdout: true,
        AttachStderr: true,
        HostConfig: {
          Binds: [
            `a:b`,
          ],
          Memory: 123,
        },
      });
      expect(container.attach).toHaveBeenCalledWith({
        stream: true,
        stdout: true,
        stderr: true,
      });

      expect(fs.createWriteStream).toHaveBeenCalledWith('LOGPATH', 'utf8');
      expect(container.start).toHaveBeenCalledWith();
      expect(container.kill).not.toHaveBeenCalled();
      expect(container.remove).not.toHaveBeenCalled();
    });

    it('creates a container via the proper steps optional fields', async() => {
      const handler = await creator.start({
        imageName: 'IMAGE',
      });
      expect(handler).toBeInstanceOf(DockerContainerHandler);
      expect(handler.container).toBe(container);
      expect(handler.statsFilePath).toBeUndefined();

      expect(dockerode.createContainer).toHaveBeenCalledWith({
        Image: 'IMAGE',
        Tty: true,
        AttachStdout: true,
        AttachStderr: true,
        HostConfig: {},
      });
      expect(container.attach).toHaveBeenCalledWith({
        stream: true,
        stdout: true,
        stderr: true,
      });

      expect(fs.createWriteStream).toHaveBeenCalledWith('LOGPATH', 'utf8');
      expect(container.start).toHaveBeenCalledWith();
      expect(container.kill).not.toHaveBeenCalled();
      expect(container.remove).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes a container', async() => {
      await creator.remove('C1');

      expect(dockerode.getContainer).toHaveBeenCalledWith('C1');
      expect(container.remove).toHaveBeenCalledWith({ force: true });
    });

    it('does nothing for a non-existing container', async() => {
      jest.spyOn(dockerode, 'getContainer').mockImplementation();

      await creator.remove('C1');

      expect(dockerode.getContainer).toHaveBeenCalledWith('C1');
      expect(container.remove).not.toHaveBeenCalled();
    });

    it('does nothing for a erroring container removal', async() => {
      jest.spyOn(container, 'remove').mockRejectedValue(new Error('remove container error'));

      await creator.remove('C1');

      expect(dockerode.getContainer).toHaveBeenCalledWith('C1');
      expect(container.remove).toHaveBeenCalledWith({ force: true });
    });
  });
});

import { DockerContainerHandler } from '../../../lib/docker/DockerContainerHandler';

describe('DockerContainerHandler', () => {
  let container: any;
  let handler: DockerContainerHandler;
  beforeEach(() => {
    container = {
      kill: jest.fn(),
      remove: jest.fn(),
    };
    handler = new DockerContainerHandler(container);
  });

  describe('close', () => {
    it('kills and removes a container', async() => {
      await handler.close();
      expect(container.kill).toHaveBeenCalled();
      expect(container.remove).toHaveBeenCalled();
    });
  });
});

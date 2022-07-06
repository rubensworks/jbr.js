import { DockerNetworkHandler } from '../../lib/docker/DockerNetworkHandler';
const streamifyString = require('streamify-string');

let write: any;
let streamEnd: any;
jest.mock('fs', () => ({
  createWriteStream: () => ({
    write,
    end: streamEnd,
  }),
}));

describe('DockerNetworkHandler', () => {
  let network: any;
  let handler: DockerNetworkHandler;
  beforeEach(() => {
    network = {
      remove: jest.fn(),
    };
    handler = new DockerNetworkHandler(network);
  });

  describe('close', () => {
    it('kills and removes a container', async() => {
      await handler.close();
      expect(network.remove).toHaveBeenCalled();
    });
  });

  describe('join', () => {
    it('does nothing', async() => {
      await handler.join();
    });
  });

  describe('startCollectingStats', () => {
    it('does nothing', async() => {
      const cb = await handler.startCollectingStats();
      cb();
    });
  });

  describe('addTerminationHandler', () => {
    it('does nothing', () => {
      handler.addTerminationHandler(jest.fn());
    });
  });

  describe('removeTerminationHandler', () => {
    it('does nothing', () => {
      handler.removeTerminationHandler(jest.fn());
    });
  });
});

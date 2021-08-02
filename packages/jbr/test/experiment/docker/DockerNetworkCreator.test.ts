import type * as Dockerode from 'dockerode';
import { DockerNetworkCreator } from '../../../lib/docker/DockerNetworkCreator';

describe('DockerNetworkCreator', () => {
  let network: any;
  let dockerode: Dockerode;
  let creator: DockerNetworkCreator;
  beforeEach(() => {
    network = <any> {
      remove: jest.fn(),
    };
    dockerode = <any> {
      createNetwork: jest.fn(() => 'NETWORK'),
      getNetwork: jest.fn(() => network),
      pruneNetworks: jest.fn(),
    };
    creator = new DockerNetworkCreator(dockerode);
  });

  describe('create', () => {
    it('builds an image via the proper steps', async() => {
      await creator.create({
        Name: 'my-network',
      });

      expect(dockerode.createNetwork).toHaveBeenCalledWith({
        Name: 'my-network',
      });
    });
  });

  describe('remove', () => {
    it('removes a container', async() => {
      await creator.remove('N1');

      expect(dockerode.pruneNetworks).toHaveBeenCalledWith();
      expect(dockerode.getNetwork).toHaveBeenCalledWith('N1');
      expect(network.remove).toHaveBeenCalledWith({ force: true });
    });

    it('does nothing for a non-existing container', async() => {
      dockerode.getNetwork = jest.fn();

      await creator.remove('N1');

      expect(dockerode.pruneNetworks).toHaveBeenCalledWith();
      expect(dockerode.getNetwork).toHaveBeenCalledWith('N1');
      expect(network.remove).not.toHaveBeenCalled();
    });

    it('does nothing for a erroring container removal', async() => {
      network.remove = jest.fn(() => Promise.reject(new Error('remove network error')));

      await creator.remove('N1');

      expect(dockerode.pruneNetworks).toHaveBeenCalledWith();
      expect(dockerode.getNetwork).toHaveBeenCalledWith('N1');
      expect(network.remove).toHaveBeenCalledWith({ force: true });
    });
  });
});

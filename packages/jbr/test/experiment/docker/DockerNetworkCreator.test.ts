import type * as Dockerode from 'dockerode';
import { DockerNetworkCreator } from '../../../lib/docker/DockerNetworkCreator';

describe('DockerNetworkCreator', () => {
  let dockerode: Dockerode;
  let creator: DockerNetworkCreator;
  beforeEach(() => {
    dockerode = <any> {
      createNetwork: jest.fn(() => 'NETWORK'),
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
});

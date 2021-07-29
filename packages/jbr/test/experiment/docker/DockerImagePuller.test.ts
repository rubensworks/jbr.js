import type * as Dockerode from 'dockerode';
import { DockerImagePuller } from '../../../lib/docker/DockerImagePuller';

describe('DockerImagePuller', () => {
  let dockerode: Dockerode;
  let builder: DockerImagePuller;
  beforeEach(() => {
    dockerode = <any> {
      pull: jest.fn(() => 'IMAGE'),
      modem: {
        followProgress: jest.fn((stream, cb) => cb(undefined, true)),
      },
    };
    builder = new DockerImagePuller(dockerode);
  });

  describe('build', () => {
    it('builds an image via the proper steps', async() => {
      await builder.pull({
        repoTag: 'IMAGE',
      });

      expect(dockerode.pull).toHaveBeenCalledWith('IMAGE');

      expect(dockerode.modem.followProgress).toHaveBeenCalledWith('IMAGE', expect.any(Function));
    });

    it('should propagate modem errors', async() => {
      dockerode.modem.followProgress = jest.fn((stream, cb) => {
        cb(new Error('Container modem error'), []);
      });

      await expect(builder.pull({
        repoTag: 'IMAGE',
      })).rejects.toThrowError('Container modem error');
    });
  });
});

import type * as Dockerode from 'dockerode';
import { DockerImageBuilder } from '../../../lib/experiment/docker/DockerImageBuilder';

describe('DockerImageBuilder', () => {
  let dockerode: Dockerode;
  let builder: DockerImageBuilder;
  beforeEach(() => {
    dockerode = <any> {
      buildImage: jest.fn(() => 'IMAGE'),
      modem: {
        followProgress: jest.fn((stream, cb) => cb(undefined, true)),
      },
    };
    builder = new DockerImageBuilder(dockerode);
  });

  describe('build', () => {
    it('builds an image via the proper steps', async() => {
      await builder.build({
        cwd: 'PATH',
        dockerFile: 'DOCKERFILE',
        auxiliaryFiles: [ 'file1', 'file2' ],
        imageName: 'IMAGE',
        buildArgs: {
          arg1: 'a',
          arg2: 'b',
        },
      });

      expect(dockerode.buildImage).toHaveBeenCalledWith({
        context: 'PATH',
        src: [ 'DOCKERFILE', 'file1', 'file2' ],
      }, {
        t: 'IMAGE',
        buildargs: {
          arg1: 'a',
          arg2: 'b',
        },
        dockerfile: 'DOCKERFILE',
      });

      expect(dockerode.modem.followProgress).toHaveBeenCalledWith('IMAGE', expect.any(Function));
    });

    it('should propagate modem errors', async() => {
      dockerode.modem.followProgress = jest.fn((stream, cb) => {
        cb(new Error('Container modem error'));
      });

      await expect(builder.build({
        cwd: 'PATH',
        dockerFile: 'DOCKERFILE',
        auxiliaryFiles: [ 'file1', 'file2' ],
        imageName: 'IMAGE',
        buildArgs: {
          arg1: 'a',
          arg2: 'b',
        },
      })).rejects.toThrowError('Container modem error');
    });
  });
});

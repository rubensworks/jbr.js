import type * as Dockerode from 'dockerode';
import type { Logger } from 'winston';
import { DockerImageBuilder } from '../../lib/docker/DockerImageBuilder';

describe('DockerImageBuilder', () => {
  let dockerode: Dockerode;
  let builder: DockerImageBuilder;
  let logger: Logger;
  beforeEach(() => {
    dockerode = <any> {
      buildImage: jest.fn(() => 'IMAGE'),
      modem: {
        followProgress: jest.fn((stream, cb) => cb(undefined, true)),
      },
    };
    builder = new DockerImageBuilder(dockerode);
    logger = <any> {
      verbose: jest.fn(),
    };
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
        logger,
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

      expect(dockerode.modem.followProgress).toHaveBeenCalledWith('IMAGE', expect.any(Function), expect.any(Function));
    });

    it('builds an image via the proper steps without optional options', async() => {
      await builder.build({
        cwd: 'PATH',
        dockerFile: 'DOCKERFILE',
        imageName: 'IMAGE',
        logger,
      });

      expect(dockerode.buildImage).toHaveBeenCalledWith({
        context: 'PATH',
        src: [ 'DOCKERFILE' ],
      }, {
        t: 'IMAGE',
        dockerfile: 'DOCKERFILE',
      });

      expect(dockerode.modem.followProgress).toHaveBeenCalledWith('IMAGE', expect.any(Function), expect.any(Function));
    });

    it('should propagate modem errors', async() => {
      dockerode.modem.followProgress = jest.fn((stream, cb) => {
        cb(new Error('Container modem error'), []);
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
        logger,
      })).rejects.toThrowError('Container modem error');
    });

    it('should propagate modem output errors', async() => {
      dockerode.modem.followProgress = jest.fn((stream, cb) => {
        cb(null, [{ error: 'Some container modem error' }]);
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
        logger,
      })).rejects.toThrowError('Some container modem error');
    });

    it('should invoke the logger on progress', async() => {
      dockerode.modem.followProgress = jest.fn((stream, cb, progressCb) => {
        cb(null, []);
        progressCb!({});
        progressCb!({ stream: '' });
        progressCb!({ stream: 'ABC' });
        progressCb!({ stream: ' DEF ' });
      });

      await builder.build({
        cwd: 'PATH',
        dockerFile: 'DOCKERFILE',
        auxiliaryFiles: [ 'file1', 'file2' ],
        imageName: 'IMAGE',
        buildArgs: {
          arg1: 'a',
          arg2: 'b',
        },
        logger,
      });

      expect(logger.verbose).toHaveBeenCalledTimes(2);
      expect(logger.verbose).toHaveBeenCalledWith('ABC');
      expect(logger.verbose).toHaveBeenCalledWith('DEF');
    });
  });
});

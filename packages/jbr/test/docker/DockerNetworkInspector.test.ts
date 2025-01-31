import type * as Dockerode from 'dockerode';
import { DockerNetworkInspector } from '../../lib/docker/DockerNetworkInspector';

jest.mock('fs-extra', () => ({
  createWriteStream: jest.fn(),
}));

describe('DockerNetworkInspector', () => {
  let network: any;
  let dockerode: Dockerode;
  let inspector: DockerNetworkInspector;
  beforeEach(() => {
    network = {
      inspect: jest.fn(() => ({ data: true })),
    };
    dockerode = <any> {
      getNetwork: jest.fn(() => network),
    };
    inspector = new DockerNetworkInspector(dockerode);
  });

  describe('inspect', () => {
    it('inspects network information', async() => {
      expect(await inspector.inspect('bridge')).toEqual({ data: true });
    });
  });
});

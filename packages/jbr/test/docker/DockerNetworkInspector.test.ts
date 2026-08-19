import type * as Dockerode from 'dockerode';
import { DockerNetworkInspector } from '../../lib/docker/DockerNetworkInspector';

jest.mock<any>('fs-extra', () => ({
  createWriteStream: jest.fn(),
}));

describe('DockerNetworkInspector', () => {
  let network: any;
  let dockerode: Dockerode;
  let inspector: DockerNetworkInspector;
  beforeEach(() => {
    network = {
      inspect: jest.fn(async() => ({ data: true })),
    };
    dockerode = <any> {
      getNetwork: jest.fn(() => network),
    };
    inspector = new DockerNetworkInspector(dockerode);
  });

  describe('inspect', () => {
    it('inspects network information', async() => {
      await expect(inspector.inspect('bridge')).resolves.toEqual({ data: true });
    });
  });
});

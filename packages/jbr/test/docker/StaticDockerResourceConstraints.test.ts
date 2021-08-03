import { StaticDockerResourceConstraints } from '../../lib/docker/StaticDockerResourceConstraints';

describe('StaticDockerResourceConstraints', () => {
  let constraints: StaticDockerResourceConstraints;
  beforeEach(() => {
    constraints = new StaticDockerResourceConstraints(
      {
        percentage: 50,
      },
      {
        limit: '10m',
      },
    );
  });

  describe('quantityStringToBytes', () => {
    it('throws on invalid strings', () => {
      expect(() => StaticDockerResourceConstraints.quantityStringToBytes(''))
        .toThrowError(`Invalid quantity string`);
      expect(() => StaticDockerResourceConstraints.quantityStringToBytes('abc'))
        .toThrowError(`Invalid quantity string`);
      expect(() => StaticDockerResourceConstraints.quantityStringToBytes('10mm'))
        .toThrowError(`Invalid quantity string`);
      expect(() => StaticDockerResourceConstraints.quantityStringToBytes('a10m'))
        .toThrowError(`Invalid quantity string`);
    });

    it('throws on invalid units', () => {
      expect(() => StaticDockerResourceConstraints.quantityStringToBytes('10x'))
        .toThrowError(`Invalid quantity string unit '10x', must be one of ', k, m, g'`);
    });

    it('handles quantities without unit', () => {
      expect(StaticDockerResourceConstraints.quantityStringToBytes('10')).toEqual(10);
      expect(StaticDockerResourceConstraints.quantityStringToBytes('0')).toEqual(0);
      expect(StaticDockerResourceConstraints.quantityStringToBytes('9999')).toEqual(9_999);
    });

    it('handles quantities with unit', () => {
      expect(StaticDockerResourceConstraints.quantityStringToBytes('10k')).toEqual(10_240);
      expect(StaticDockerResourceConstraints.quantityStringToBytes('0k')).toEqual(0);
      expect(StaticDockerResourceConstraints.quantityStringToBytes('9999k')).toEqual(10_238_976);

      expect(StaticDockerResourceConstraints.quantityStringToBytes('10m')).toEqual(10_485_760);
      expect(StaticDockerResourceConstraints.quantityStringToBytes('0m')).toEqual(0);
      expect(StaticDockerResourceConstraints.quantityStringToBytes('9999m')).toEqual(10_484_711_424);

      expect(StaticDockerResourceConstraints.quantityStringToBytes('10g')).toEqual(10_737_418_240);
      expect(StaticDockerResourceConstraints.quantityStringToBytes('0g')).toEqual(0);
      expect(StaticDockerResourceConstraints.quantityStringToBytes('9999g')).toEqual(10_736_344_498_176);
    });
  });

  describe('toHostConfig', () => {
    it('for all optional fields', () => {
      expect(constraints.toHostConfig()).toEqual({
        CpuPeriod: 100_000,
        CpuQuota: 50_000,
        Memory: 10_485_760,
      });
    });

    it('for no fields', () => {
      constraints = new StaticDockerResourceConstraints(
        {},
        {},
      );
      expect(constraints.toHostConfig()).toEqual({});
    });
  });
});

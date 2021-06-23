import { FractionalCombinationProvider } from '../../lib/factor/FractionalCombinationProvider';

describe('FractionalCombinationProvider', () => {
  describe('getFactorCombinations', () => {
    it('returns the provided combinations', () => {
      const combinations = [
        { a: true, b: false },
        { a: false, b: true },
      ];
      const provider = new FractionalCombinationProvider(combinations, true);
      expect(provider.getFactorCombinations()).toEqual(combinations);
    });
  });

  describe('commonPrepare', () => {
    it('defaults to false', () => {
      const provider = new FractionalCombinationProvider([]);
      expect(provider.commonPrepare).toEqual(false);
    });

    it('can be overridden to false', () => {
      const provider = new FractionalCombinationProvider([], false);
      expect(provider.commonPrepare).toEqual(false);
    });

    it('can be overridden to true', () => {
      const provider = new FractionalCombinationProvider([], true);
      expect(provider.commonPrepare).toEqual(true);
    });
  });
});

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

  describe('commonGenerated', () => {
    it('defaults to false', () => {
      const provider = new FractionalCombinationProvider([]);
      expect(provider.commonGenerated).toEqual(false);
    });

    it('can be overridden to false', () => {
      const provider = new FractionalCombinationProvider([], false);
      expect(provider.commonGenerated).toEqual(false);
    });

    it('can be overridden to true', () => {
      const provider = new FractionalCombinationProvider([], true);
      expect(provider.commonGenerated).toEqual(true);
    });
  });
});

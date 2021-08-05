import { FullFactorialCombinationProvider } from '../../lib/factor/FullFactorialCombinationProvider';

describe('FullFactorialCombinationProvider', () => {
  describe('getFactorCombinations', () => {
    it('handles empty factors', () => {
      const factors: Record<string, any[]> = {};
      const provider = new FullFactorialCombinationProvider(factors, true);
      expect(provider.getFactorCombinations()).toEqual([
        {},
      ]);
    });

    it('handles a single factor and single value', () => {
      const factors: Record<string, any[]> = {
        a: [ 0 ],
      };
      const provider = new FullFactorialCombinationProvider(factors, true);
      expect(provider.getFactorCombinations()).toEqual([
        { a: 0 },
      ]);
    });

    it('handles a single factor and multiple values', () => {
      const factors: Record<string, any[]> = {
        a: [ 0, 1, 2 ],
      };
      const provider = new FullFactorialCombinationProvider(factors, true);
      expect(provider.getFactorCombinations()).toEqual([
        { a: 0 },
        { a: 1 },
        { a: 2 },
      ]);
    });

    it('handles two factors with single value', () => {
      const factors: Record<string, any[]> = {
        a: [ 0 ],
        b: [ 0 ],
      };
      const provider = new FullFactorialCombinationProvider(factors, true);
      expect(provider.getFactorCombinations()).toEqual([
        { a: 0, b: 0 },
      ]);
    });

    it('handles two factors and multiple values', () => {
      const factors: Record<string, any[]> = {
        a: [ 0, 1, 2 ],
        b: [ 0, 1, 2 ],
      };
      const provider = new FullFactorialCombinationProvider(factors, true);
      expect(provider.getFactorCombinations()).toEqual([
        { a: 0, b: 0 },
        { a: 1, b: 0 },
        { a: 2, b: 0 },
        { a: 0, b: 1 },
        { a: 1, b: 1 },
        { a: 2, b: 1 },
        { a: 0, b: 2 },
        { a: 1, b: 2 },
        { a: 2, b: 2 },
      ]);
    });

    it('handles three factors and multiple values', () => {
      const factors: Record<string, any[]> = {
        a: [ 0, 1, 2 ],
        b: [ 0, 1, 2 ],
        c: [ 0, 1 ],
      };
      const provider = new FullFactorialCombinationProvider(factors, true);
      expect(provider.getFactorCombinations()).toEqual([
        { a: 0, b: 0, c: 0 },
        { a: 1, b: 0, c: 0 },
        { a: 2, b: 0, c: 0 },
        { a: 0, b: 1, c: 0 },
        { a: 1, b: 1, c: 0 },
        { a: 2, b: 1, c: 0 },
        { a: 0, b: 2, c: 0 },
        { a: 1, b: 2, c: 0 },
        { a: 2, b: 2, c: 0 },
        { a: 0, b: 0, c: 1 },
        { a: 1, b: 0, c: 1 },
        { a: 2, b: 0, c: 1 },
        { a: 0, b: 1, c: 1 },
        { a: 1, b: 1, c: 1 },
        { a: 2, b: 1, c: 1 },
        { a: 0, b: 2, c: 1 },
        { a: 1, b: 2, c: 1 },
        { a: 2, b: 2, c: 1 },
      ]);
    });
  });

  describe('commonGenerated', () => {
    it('defaults to false', () => {
      const provider = new FullFactorialCombinationProvider({});
      expect(provider.commonGenerated).toEqual(false);
    });

    it('can be overridden to false', () => {
      const provider = new FullFactorialCombinationProvider({}, false);
      expect(provider.commonGenerated).toEqual(false);
    });

    it('can be overridden to true', () => {
      const provider = new FullFactorialCombinationProvider({}, true);
      expect(provider.commonGenerated).toEqual(true);
    });
  });
});

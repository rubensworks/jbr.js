/**
 * Provides factor combinations.
 */
export interface CombinationProvider {
  /**
   * If the prepare phase is identical across combinations.
   */
  commonPrepare: boolean;
  getFactorCombinations: () => FactorCombination[];
}

export type FactorCombination = Record<string, any>;

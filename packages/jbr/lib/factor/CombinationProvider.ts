/**
 * Provides factor combinations.
 */
export interface CombinationProvider {
  /**
   * If the generated/ directory is reused across combinations.
   */
  commonGenerated: boolean;
  getFactorCombinations: () => FactorCombination[];
}

export type FactorCombination = Record<string, any>;

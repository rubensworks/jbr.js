import type { CombinationProvider, FactorCombination } from './CombinationProvider';

/**
 * A direct provision of an array of factor combination.
 */
export class FractionalCombinationProvider implements CombinationProvider {
  private readonly combinations: FactorCombination[];
  public readonly commonGenerated: boolean;

  /**
   * @param combinations An array of hashes containing factors mapped to values. @range {json}
   * @param commonGenerated If the prepare phase is identical across combinations.
   */
  public constructor(combinations: FactorCombination[], commonGenerated = false) {
    this.combinations = combinations;
    this.commonGenerated = commonGenerated;
  }

  public getFactorCombinations(): FactorCombination[] {
    return this.combinations;
  }
}

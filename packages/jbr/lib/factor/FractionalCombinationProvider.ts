import type { CombinationProvider, FactorCombination } from './CombinationProvider';

/**
 * A direct provision of an array of factor combination.
 */
export class FractionalCombinationProvider implements CombinationProvider {
  private readonly combinations: FactorCombination[];
  public readonly commonPrepare: boolean;

  /**
   * @param combinations An array of hashes containing factors mapped to values. @range {json}
   * @param commonPrepare If the prepare phase is identical across combinations.
   */
  public constructor(combinations: FactorCombination[], commonPrepare = false) {
    this.combinations = combinations;
    this.commonPrepare = commonPrepare;
  }

  public getFactorCombinations(): FactorCombination[] {
    return this.combinations;
  }
}

import type { CombinationProvider, FactorCombination } from './CombinationProvider';

/**
 * For all the given factor values, provide all possible combinations.
 */
export class FullFactorialCombinationProvider implements CombinationProvider {
  private readonly factors: Record<string, any[]>;
  public readonly commonGenerated: boolean;

  /**
   * @param factors A hash of factor keys to an array of factor values. @range {json}
   * @param commonGenerated If the prepare phase is identical across combinations.
   */
  public constructor(factors: Record<string, any[]>, commonGenerated = false) {
    this.factors = factors;
    this.commonGenerated = commonGenerated;
  }

  public getFactorCombinations(): FactorCombination[] {
    // Calculate all matrix combinations
    let combinations: FactorCombination[] = [{}];
    for (const [ factor, values ] of Object.entries(this.factors)) {
      const combinationsCopies: FactorCombination[][] = [];
      for (const value of values) {
        // Make a deep copy of the combinations array
        const combinationsCopy = combinations.map(factorCombination => ({ ...factorCombination }));
        combinationsCopies.push(combinationsCopy);

        // Set the value in all copies
        for (const combinationCopy of combinationsCopy) {
          combinationCopy[factor] = value;
        }
      }

      // Update the current combinations
      combinations = combinationsCopies.flat();
    }

    return combinations;
  }
}

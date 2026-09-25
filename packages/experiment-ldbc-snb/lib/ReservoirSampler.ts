/**
 * Seeded reservoir sampler (Algorithm R) for selecting a fixed-size uniform sample from a stream.
 */
export class ReservoirSampler<T> {
  public readonly size: number;
  private readonly sample: T[] = [];
  private seen = 0;
  private state: number;

  /**
   * @param size Maximum number of sampled items.
   * @param seed Random seed.
   */
  public constructor(size: number, seed: number) {
    this.size = size;
    this.state = seed >>> 0;
  }

  /**
   * Offer an item to the sampler.
   * @param item An item.
   */
  public add(item: T): void {
    this.seen++;
    if (this.sample.length < this.size) {
      this.sample.push(item);
    } else {
      const index = Math.floor(this.nextRandom() * this.seen);
      if (index < this.size) {
        this.sample[index] = item;
      }
    }
  }

  /**
   * @return The current sample.
   */
  public getSample(): T[] {
    return [ ...this.sample ];
  }

  /**
   * Mulberry32 PRNG, returns a number in [0, 1).
   */
  protected nextRandom(): number {
    this.state = (this.state + 0x6D2B79F5) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  }
}

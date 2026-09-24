import { ReservoirSampler } from '../lib/ReservoirSampler';

function sample(size: number, seed: number, count: number): number[] {
  const sampler = new ReservoirSampler<number>(size, seed);
  for (let i = 0; i < count; i++) {
    sampler.add(i);
  }
  return sampler.getSample();
}

describe('ReservoirSampler', () => {
  it('exposes its size', () => {
    expect(new ReservoirSampler(3, 1).size).toBe(3);
  });

  it('is empty without items', () => {
    expect(sample(3, 1, 0)).toEqual([]);
  });

  it('keeps all items if fewer than the size were added', () => {
    expect(sample(5, 1, 3)).toEqual([ 0, 1, 2 ]);
  });

  it('keeps exactly size items if more were added', () => {
    const result = sample(10, 1, 1_000);
    expect(result).toHaveLength(10);
    expect(new Set(result).size).toBe(10);
    for (const item of result) {
      expect(item).toBeGreaterThanOrEqual(0);
      expect(item).toBeLessThan(1_000);
    }
  });

  it('is deterministic for the same seed', () => {
    expect(sample(10, 12345, 1_000)).toEqual(sample(10, 12345, 1_000));
  });

  it('differs for different seeds', () => {
    expect(sample(10, 12345, 1_000)).not.toEqual(sample(10, 54321, 1_000));
  });

  it('does not only keep the first items', () => {
    expect(sample(10, 12345, 1_000)).not.toEqual([ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 ]);
  });

  it('returns a copy of the sample', () => {
    const sampler = new ReservoirSampler<number>(2, 1);
    sampler.add(1);
    sampler.getSample().push(2);
    expect(sampler.getSample()).toEqual([ 1 ]);
  });

  it('samples approximately uniformly', () => {
    // Each item should be kept with probability size/count
    const counts: number[] = Array.from({ length: 10 }, () => 0);
    for (let seed = 0; seed < 2_000; seed++) {
      for (const item of sample(2, seed, 10)) {
        counts[item]++;
      }
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(300);
      expect(count).toBeLessThan(500);
    }
  });
});

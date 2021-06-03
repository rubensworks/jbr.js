/* eslint-disable no-bitwise,id-length */
import type Dockerode from 'dockerode';
import { DockerResourceConstraints } from './DockerResourceConstraints';

/**
 * Allows constraints to be placed on Docker container resources.
 */
export class StaticDockerResourceConstraints extends DockerResourceConstraints {
  public static readonly QUANTITY_UNITS: Record<string, number> = {
    '': 1,
    k: 1 << 10,
    m: 1 << 20,
    g: 1 << 30,
  };

  public readonly cpu: IDockerCpuConstraints;
  public readonly memory: IDockerMemoryConstraints;

  public constructor(cpu: IDockerCpuConstraints, memory: IDockerMemoryConstraints) {
    super();
    this.cpu = cpu;
    this.memory = memory;
  }

  /**
   * Convert a given quantity string (with optional unit) to an absolute number.
   * For example, '10' will be converted to 10, '10k' to '10240', '1m' to 1048576, and so on.
   * @param amount A quantity string.
   */
  public static quantityStringToBytes(amount: string): number {
    const match = /^([0-9]+)([a-z]?)$/u.exec(amount);
    if (!match) {
      throw new Error(`Invalid quantity string '${amount}'`);
    }
    const quantity = Number.parseInt(match[1], 10);
    const unit = match[2];
    const multiplier = StaticDockerResourceConstraints.QUANTITY_UNITS[unit];
    if (!multiplier) {
      throw new Error(`Invalid quantity string unit '${amount}', must be one of '${Object.keys(StaticDockerResourceConstraints.QUANTITY_UNITS).join(', ')}'`);
    }
    return quantity * multiplier;
  }

  /**
   * Obtain a Docker HostConfig object from the current constraints.
   */
  public toHostConfig(): Dockerode.HostConfig {
    return {
      ...this.cpu.percentage ? { CpuPeriod: 100_000, CpuQuota: this.cpu.percentage * 1_000 } : {},
      ...this.memory.limit ? { Memory: StaticDockerResourceConstraints.quantityStringToBytes(this.memory.limit) } : {},
    };
  }
}

export interface IDockerCpuConstraints {
  /**
   * Percentage (0-100) of the total CPU power that can be used.
   * E.g. when fully consuming 4 cores, this value must be set to 100.
   */
  percentage?: number;
}

export interface IDockerMemoryConstraints {
  /**
   * Memory usage limit, e.g. '10m', '1g'.
   */
  limit?: string;
}

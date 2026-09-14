const MASK32 = 0xffff_ffffn;
const MASK64 = 0xffff_ffff_ffff_ffffn;

/** Architectural user-mode state: X0..X30, SP (slot 31), PC, NZCV and the EL0 TLS registers. */
export class CpuState {
  readonly x = new BigUint64Array(32);
  pc = 0n;
  n = false;
  z = false;
  c = false;
  v = false;
  tpidr_el0 = 0n;
  tpidrro_el0 = 0n;
  instCount = 0;

  /** Register read where slot 31 is the zero register. */
  getX(n: number, sf = true): bigint {
    if (n === 31) return 0n;
    const value = this.x[n] ?? 0n;
    return sf ? value : value & MASK32;
  }
  /** Register write where slot 31 is the zero register (write ignored). */
  setX(n: number, value: bigint, sf = true): void {
    if (n === 31) return;
    this.x[n] = value & (sf ? MASK64 : MASK32);
  }
  /** Register read where slot 31 is SP (add/sub immediate, loads/stores, ...). */
  getXorSp(n: number, sf = true): bigint {
    return n === 31 ? this.getSp(sf) : this.getX(n, sf);
  }
  setXorSp(n: number, value: bigint, sf = true): void {
    if (n === 31) this.setSp(value, sf);
    else this.setX(n, value, sf);
  }
  getSp(sf = true): bigint {
    const value = this.x[31] ?? 0n;
    return sf ? value : value & MASK32;
  }
  setSp(value: bigint, sf = true): void {
    this.x[31] = value & (sf ? MASK64 : MASK32);
  }
  nzcv(): number {
    return (this.n ? 8 : 0) | (this.z ? 4 : 0) | (this.c ? 2 : 0) | (this.v ? 1 : 0);
  }
}

export type Trap = { kind: 'svc' | 'brk' | 'hlt'; imm: number };

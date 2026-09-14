const MASK32 = 0xffff_ffffn;
const MASK64 = 0xffff_ffff_ffff_ffffn;

export class CpuState {
  readonly x = new BigUint64Array(32);
  pc = 0n;
  n = false;
  z = false;
  c = false;
  v = false;
  tpidrro_el0 = 0n;
  instCount = 0;

  getX(n: number, sf = true): bigint {
    if (n === 31) return 0n;
    const value = this.x[n] ?? 0n;
    return sf ? value : value & MASK32;
  }
  setX(n: number, value: bigint, sf = true): void {
    if (n === 31) return;
    this.x[n] = (sf ? value : value & MASK32) & (sf ? MASK64 : MASK32);
  }
  getSp(sf = true): bigint { return this.x[31] ?? 0n & (sf ? MASK64 : MASK32); }
  setSp(value: bigint, sf = true): void { this.x[31] = (value & (sf ? MASK64 : MASK32)); }
  nzcv(): number { return (this.n ? 8 : 0) | (this.z ? 4 : 0) | (this.c ? 2 : 0) | (this.v ? 1 : 0); }
}

export type Trap = { kind: 'svc' | 'brk' | 'hlt'; imm: number };

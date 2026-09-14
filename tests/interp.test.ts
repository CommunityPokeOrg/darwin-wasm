import { describe, expect, it } from 'vitest';
import { add_imm, adrp, cmp, ldr_imm, movk, svc, sub } from '../tools/asm';
import { Cpu } from '../src/core/cpu/interp';
import { CpuState } from '../src/core/cpu/state';
import { Memory } from '../src/core/mem/memory';

function cpu(word: number): Cpu {
  const mem = new Memory(); mem.map(0n, 0x10000n, 'rwx'); mem.write32(0n, word);
  return new Cpu(new CpuState(), mem);
}
describe('single-instruction interpreter execution', () => {
  it('computes 32-bit add flags and subtract borrow', () => {
    const add = cpu(add_imm(0, 1, 1, false, true)); add.state.setX(1, 0x7fffffffn); add.step();
    expect(add.state.getX(0, false)).toBe(0x80000000n); expect(add.state.n).toBe(true); expect(add.state.v).toBe(true);
    const subtr = cpu(sub(0, 1, 1, false, true)); subtr.state.setX(1, 0n); subtr.step();
    expect(subtr.state.c).toBe(false); expect(subtr.state.getX(0, false)).toBe(0xffffffffn);
  });
  it('merges movk and calculates adrp pages', () => {
    const m = cpu(movk(0, 0xabcd, 16)); m.state.setX(0, 0x1234n); m.step(); expect(m.state.getX(0)).toBe(0xabcd1234n);
    const a = cpu(adrp(0, 0x2000)); a.state.pc = 0x1000n; a.mem.write32(0x1000n, adrp(0, 0x2000)); a.step(); expect(a.state.getX(0)).toBe(0x3000n);
  });
  it('executes compare and memory load', () => {
    const c = cpu(cmp(0, 1)); c.state.setX(0, 2n); c.state.setX(1, 2n); c.step(); expect(c.state.z).toBe(true);
    const l = cpu(ldr_imm(0, 1, 0)); l.state.setX(1, 0x200n); l.mem.map(0x200n, 0x10000n, 'rw'); l.mem.write64(0x200n, 42n); l.step(); expect(l.state.getX(0)).toBe(42n);
  });
  it('returns an svc trap', () => expect(cpu(svc(7)).step()).toEqual({ kind: 'svc', imm: 7 }));
});

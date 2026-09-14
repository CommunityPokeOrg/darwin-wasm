import { describe, expect, it } from 'vitest';
import { add_imm, adrp, cmp, ldp_post, ldr_imm, movk, stp_pre, svc, sub } from '../tools/asm';
import { Cpu } from '../src/core/cpu/interp';
import { CpuState } from '../src/core/cpu/state';
import { Memory } from '../src/core/mem/memory';

function cpu(word: number): Cpu {
  const mem = new Memory(); mem.map(0n, 0x10000n, 'rwx'); mem.write32(0n, word);
  return new Cpu(new CpuState(), mem);
}
function execute(word: number, setup: (state: CpuState, mem: Memory) => void = () => undefined): Cpu {
  const machine = cpu(word); setup(machine.state, machine.mem); machine.step(); return machine;
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
  it('selects conditionally with csel and csinc', () => {
    const taken = execute(0x9a820020, (s) => { s.setX(1, 11n); s.setX(2, 22n); s.z = true; });
    expect(taken.state.getX(0)).toBe(11n);
    const notTaken = execute(0x9a820420, (s) => { s.setX(1, 11n); s.setX(2, 22n); s.z = false; });
    expect(notTaken.state.getX(0)).toBe(23n);
  });
  it('implements UBFM/SBFM aliases', () => {
    // lsr x0, x1, #4
    expect(execute(0xd344fc20, (s) => s.setX(1, 0xf0n)).state.getX(0)).toBe(0xfn);
    // uxtb w0, w1
    expect(execute(0x53001c20, (s) => s.setX(1, 0x1234n)).state.getX(0, false)).toBe(0x34n);
    // asr x0, x1, #4
    expect(execute(0x9344fc20, (s) => s.setX(1, 0xffff_ffff_ffff_ff80n)).state.getX(0)).toBe(0xffff_ffff_ffff_fff8n);
    // sxtw x0, w1
    expect(execute(0x93407c20, (s) => s.setX(1, 0x8000_0001n)).state.getX(0)).toBe(0xffff_ffff_8000_0001n);
  });
  it('executes extr and multiply/divide operations', () => {
    // extr x0, x1, x2, #8
    expect(execute(0x93c22020, (s) => { s.setX(1, 0x1122n); s.setX(2, 0x3344n); }).state.getX(0)).toBe(0x2200_0000_0000_0033n);
    const madd = execute(0x9b020c20, (s) => { s.setX(1, 2n); s.setX(2, 3n); s.setX(3, 4n); });
    expect(madd.state.getX(0)).toBe(10n);
    const msub = execute(0x9b028c20, (s) => { s.setX(1, 2n); s.setX(2, 3n); s.setX(3, 10n); });
    expect(msub.state.getX(0)).toBe(4n);
    expect(execute(0x9ac20820, (s) => { s.setX(1, 7n); s.setX(2, 2n); }).state.getX(0)).toBe(3n);
    expect(execute(0x9ac20820, (s) => { s.setX(1, 7n); }).state.getX(0)).toBe(0n);
    expect(execute(0x9ac20c20, (s) => { s.setX(1, 7n); s.setX(2, 2n); }).state.getX(0)).toBe(3n);
    expect(execute(0x9ac20c20, (s) => { s.setX(1, 0x8000_0000_0000_0000n); s.setX(2, 0xffff_ffff_ffff_ffffn); }).state.getX(0)).toBe(0x8000_0000_0000_0000n);
  });
  it('handles indexed memory forms and sign extension', () => {
    const pre = execute(0xf8408c20, (s, m) => { s.setX(1, 0x200n); m.map(0x200n, 0x10000n, 'rw'); m.write64(0x208n, 7n); });
    expect(pre.state.getX(0)).toBe(7n); expect(pre.state.getX(1)).toBe(0x208n);
    const post = execute(0xf8408420, (s, m) => { s.setX(1, 0x200n); m.map(0x200n, 0x10000n, 'rw'); m.write64(0x200n, 8n); });
    expect(post.state.getX(0)).toBe(8n); expect(post.state.getX(1)).toBe(0x208n);
    // ldr x0, [x1, x2, lsl #3]
    const reg = execute(0xf8627820, (s, m) => { s.setX(1, 0x200n); s.setX(2, 2n); m.map(0x200n, 0x10000n, 'rw'); m.write64(0x210n, 9n); });
    expect(reg.state.getX(0)).toBe(9n);
    const pair = execute(stp_pre(0, 1, 31, -16), (s, m) => { s.setSp(0x300n); m.map(0x200n, 0x10000n, 'rw'); s.setX(0, 1n); s.setX(1, 2n); });
    expect(pair.state.getSp()).toBe(0x2f0n);
    const loadPair = execute(ldp_post(0, 1, 31, 16), (s, m) => { s.setSp(0x2f0n); m.map(0x200n, 0x10000n, 'rw'); m.write64(0x2f0n, 1n); m.write64(0x2f8n, 2n); });
    expect(loadPair.state.getX(0)).toBe(1n); expect(loadPair.state.getX(1)).toBe(2n); expect(loadPair.state.getSp()).toBe(0x300n);
    // ldrsw x0, [x1]
    const ldrsw = execute(0xb9800020, (s, m) => { s.setX(1, 0x200n); m.map(0x200n, 0x10000n, 'rw'); m.write32(0x200n, 0xffff_fffe); });
    expect(ldrsw.state.getX(0)).toBe(0xffff_ffff_ffff_fffen);
  });
  it('applies ccmp flags and reads tpidrro_el0', () => {
    // ccmp x1, x2, #5, eq
    const holds = execute(0xfa420825, (s) => { s.setX(1, 4n); s.setX(2, 1n); s.z = true; });
    expect(holds.state.nzcv()).toBe(2);
    const skips = execute(0xfa420825, (s) => { s.setX(1, 4n); s.setX(2, 1n); s.z = false; });
    expect(skips.state.nzcv()).toBe(5);
    const mrs = execute(0xd53bd060, (s) => { s.tpidrro_el0 = 0x1234n; });
    expect(mrs.state.getX(0)).toBe(0x1234n);
  });
});

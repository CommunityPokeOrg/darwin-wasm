import { describe, expect, it } from 'vitest';
import { decode, decodeBitMasks } from '../src/core/cpu/decoder';
import { disasm } from '../src/core/cpu/disasm';

describe('AArch64 decoder', () => {
  it.each([
    [0xd2800000, 'moveWide'], // movz x0, #0
    [0xd65f03c0, 'br'], // ret
    [0xd4000001, 'svc'], // svc #0
    [0x910003fd, 'arithImm'], // mov x29, sp
    [0xa9bf7bfd, 'ldstPair'], // stp x29, x30, [sp, #-16]!
    [0xa8c17bfd, 'ldstPair'], // ldp x29, x30, [sp], #16
    [0xf9400000, 'ldst'], // ldr x0, [x0]
    [0xb9400000, 'ldst'], // ldr w0, [x0]
    [0x39400000, 'ldst'], // ldrb w0, [x0]
    [0xf8616800, 'ldst'], // ldr x0, [x0, x1]
    [0x58000000, 'ldrLit'], // ldr x0, .
    [0x54000001, 'bcond'], // b.ne
    [0xb4000000, 'cbz'],
    [0x36000000, 'tbz'],
    [0x9b007c00, 'mul'], // mul x0, x0, x0
    [0x9ac00800, 'div'], // udiv x0, x0, x0
    [0x9ac02000, 'shiftVar'], // lsl x0, x0, x0
    [0x8b000000, 'arithShifted'], // add x0, x0, x0
    [0x8b20c000, 'arithExtended'], // add x0, x0, w0, sxtw
    [0xaa0003e0, 'logicShifted'], // mov x0, x0
    [0x92400000, 'logicImm'], // and x0, x0, #1
    [0x9a800000, 'condSel'], // csel x0, x0, x0, eq
    [0xfa400800, 'condCmp'], // ccmp x0, #0, #0, eq
    [0x9a000000, 'carry'], // adc x0, x0, x0
    [0xd3400000, 'bitfield'], // ubfx x0, x0, #0, #1
    [0x93c00000, 'extr'], // extr x0, x0, x0, #0
    [0xdac01000, 'unary'], // clz x0, x0
    [0xc85f7c00, 'exclusive'], // ldxr x0, [x0]
    [0xc8dffc00, 'exclusive'], // ldar x0, [x0]
    [0xd53bd060, 'mrs'], // mrs x0, tpidrro_el0
    [0xd51bd040, 'msr'], // msr tpidr_el0, x0
    [0xd503201f, 'nop'],
    [0xd5033fdf, 'nop'], // isb
    [0x90000000, 'adr'], // adrp x0, .
    [0x1e604000, 'unknown'], // fmov d0, d0 (FP unsupported)
  ] as const)('decodes 0x%s as %s', (word, kind) => expect(decode(word).kind).toBe(kind));

  it('decodes logical immediates', () => {
    expect(decodeBitMasks(1, 0, 0, true)).toBe(1n);
    expect(decodeBitMasks(1, 0x3f, 0, true)).toBeNull(); // reserved
    expect(decodeBitMasks(0, 0x1f, 0, false)).toBeNull(); // all-ones is reserved
    expect(decodeBitMasks(0, 0x1e, 0, false)).toBe(0x7fff_ffffn);
    expect(decodeBitMasks(1, 0x07, 0x3c, true)).toBe(0xff0n); // ROR(0xff, 60)
    expect(decodeBitMasks(1, 0x07, 0x04, true)).toBe(0xf000_0000_0000_000fn);
  });

  it('decodes MRS system register encodings', () => {
    const insn = decode(0xd53bd060);
    expect(insn.kind === 'mrs' && insn.reg).toBe('tpidrro_el0');
    const nzcv = decode(0xd53b4200);
    expect(nzcv.kind === 'mrs' && nzcv.reg).toBe('nzcv');
  });

  it('produces readable disassembly', () => {
    expect(disasm(decode(0xa9bf7bfd))).toBe('stp x29, x30, [sp, #-16]!');
    expect(disasm(decode(0xd65f03c0))).toBe('ret');
    expect(disasm(decode(0x910003fd))).toBe('add x29, sp, #0x0');
    expect(disasm(decode(0x54000041), 0x1000n)).toBe('b.ne 0x1008');
  });
});

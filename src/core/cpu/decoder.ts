export type Shift = 'lsl' | 'lsr' | 'asr' | 'ror';
export type Cond = number;
export type Insn =
  | { kind: 'unknown'; word: number }
  | { kind: 'nop' | 'hint'; op: string }
  | { kind: 'imm'; op: string; rd: number; rn: number; imm: number; shift: number; sf: boolean }
  | { kind: 'logicalImm'; op: string; rd: number; rn: number; mask: bigint; sf: boolean }
  | { kind: 'wide'; op: 'movz' | 'movn' | 'movk'; rd: number; imm: number; shift: number; sf: boolean }
  | { kind: 'adr'; rd: number; imm: number; page: boolean }
  | { kind: 'bitfield'; op: 'ubfm' | 'sbfm' | 'bfm'; rd: number; rn: number; immr: number; imms: number; sf: boolean }
  | { kind: 'extr'; rd: number; rn: number; rm: number; lsb: number; sf: boolean }
  | { kind: 'reg'; op: string; rd: number; rn: number; rm: number; ra?: number; shift?: Shift; amount?: number; sf: boolean; extend?: number }
  | { kind: 'condsel'; op: string; rd: number; rn: number; rm: number; cond: Cond; sf: boolean }
  | { kind: 'ccmp'; op: 'ccmp' | 'ccmn'; rn: number; rmOrImm: number; nzcv: number; cond: Cond; sf: boolean; immediate: boolean }
  | { kind: 'branch'; op: 'b' | 'bl'; imm: number }
  | { kind: 'bcond'; cond: Cond; imm: number }
  | { kind: 'cbz'; nonzero: boolean; rt: number; imm: number; sf: boolean }
  | { kind: 'tbz'; nonzero: boolean; rt: number; bit: number; imm: number }
  | { kind: 'branchReg'; op: 'br' | 'blr' | 'ret'; rn: number }
  | { kind: 'loadstore'; op: string; rt: number; rn: number; rm?: number; offset: number; sf: boolean; pre?: boolean; post?: boolean; reg?: boolean; size: number }
  | { kind: 'pair'; op: 'ldp' | 'stp'; rt: number; rt2: number; rn: number; offset: number; sf: boolean; pre?: boolean; post?: boolean }
  | { kind: 'exclusive'; op: string; rt: number; rn: number; rs?: number; sf: boolean }
  | { kind: 'system'; op: string; rt?: number; rn?: number; imm?: number }
  | { kind: 'svc' | 'brk' | 'hlt'; imm: number };

const u32 = (n: number) => n >>> 0;
const sign = (n: number, bits: number) => (n & (1 << (bits - 1))) ? n - (1 << bits) : n;

function decodeBitMasks(n: number, immr: number, imms: number, immediate = true): bigint {
  const val = (n << 6) | ((~imms) & 0x3f);
  const len = 31 - Math.clz32(val);
  if (len < 1) throw new Error('invalid bitmask');
  const levels = (1 << len) - 1;
  const s = imms & levels;
  const r = immr & levels;
  const size = 1 << len;
  if (immediate && s === levels) throw new Error('reserved bitmask');
  const ones = (1n << BigInt(s + 1)) - 1n;
  const elemMask = (1n << BigInt(size)) - 1n;
  const rotated = ((ones >> BigInt(r)) | (ones << BigInt(size - r))) & elemMask;
  let result = 0n;
  for (let pos = 0; pos < 64; pos += size) result |= rotated << BigInt(pos);
  return result;
}
export { decodeBitMasks };

export function decode(word: number): Insn {
  word = u32(word);
  const matches = (mask: number, value: number) => u32(word & mask) === u32(value);
  if (word === 0xd503201f) return { kind: 'nop', op: 'nop' };
  if (matches(0xfffffc1f, 0xd503201f)) {
    const op = (word >>> 5) & 0x7;
    return { kind: 'hint', op: ['nop', 'yield', 'wfe', 'wfi', 'sev', 'nop', 'nop', 'nop'][op] ?? 'nop' };
  }
  if (matches(0xffe0001f, 0xd4000001)) return { kind: 'svc', imm: (word >>> 5) & 0xffff };
  if (matches(0xffe0001f, 0xd4200000)) return { kind: 'brk', imm: (word >>> 5) & 0xffff };
  if (matches(0xffe0001f, 0xd4400000)) return { kind: 'hlt', imm: (word >>> 5) & 0xffff };
  if ((word & 0x7c000000) === 0x14000000) return { kind: 'branch', op: (word & 0x80000000) ? 'bl' : 'b', imm: sign(word & 0x03ffffff, 26) << 2 };
  if ((word & 0xff000010) === 0x54000000) return { kind: 'bcond', cond: word & 15, imm: sign((word >>> 5) & 0x7ffff, 19) << 2 };
  if ((word & 0x7e000000) === 0x34000000) return { kind: 'cbz', nonzero: Boolean(word & 0x01000000), rt: word & 31, imm: sign((word >>> 5) & 0x7ffff, 19) << 2, sf: Boolean(word & 0x80000000) };
  if ((word & 0x7e000000) === 0x36000000) return { kind: 'tbz', nonzero: Boolean(word & 0x01000000), rt: word & 31, bit: ((word >>> 31) << 5) | ((word >>> 19) & 31), imm: sign((word >>> 5) & 0x3fff, 14) << 2 };
  if (matches(0xfffffc1f, 0xd65f0000)) return { kind: 'branchReg', op: 'ret', rn: (word >>> 5) & 31 };
  if (matches(0xfffffc1f, 0xd61f0000)) return { kind: 'branchReg', op: 'br', rn: (word >>> 5) & 31 };
  if (matches(0xfffffc1f, 0xd63f0000)) return { kind: 'branchReg', op: 'blr', rn: (word >>> 5) & 31 };
  const sf = Boolean(word & 0x80000000);
  if ((word & 0x1f800000) === 0x12800000) {
    const op = (word >>> 29) & 3;
    return { kind: 'wide', op: op === 0 ? 'movn' : op === 2 ? 'movz' : 'movk', rd: word & 31, imm: (word >>> 5) & 0xffff, shift: ((word >>> 21) & 3) * 16, sf };
  }
  if ((word & 0x1f000000) === 0x11000000) {
    const op = (word >>> 29) & 3;
    return { kind: 'imm', op: ['add', 'adds', 'sub', 'subs'][op] ?? 'add', rd: word & 31, rn: (word >>> 5) & 31, imm: ((word >>> 10) & 0xfff) << (((word >>> 22) & 1) * 12), shift: ((word >>> 22) & 1) * 12, sf };
  }
  if ((word & 0x1f000000) === 0x0a000000) {
    try {
      const mask = decodeBitMasks((word >>> 22) & 1, (word >>> 16) & 0x3f, (word >>> 10) & 0x3f);
      return { kind: 'logicalImm', op: ['and', 'orr', 'eor', 'ands'][(word >>> 29) & 3] ?? 'and', rd: word & 31, rn: (word >>> 5) & 31, mask, sf };
    } catch { return { kind: 'unknown', word }; }
  }
  if ((word & 0x1f000000) === 0x10000000) return { kind: 'adr', rd: word & 31, imm: sign(((word >>> 29) & 3) | (((word >>> 5) & 0x7ffff) << 2), 21), page: Boolean(word & 0x80000000) };
  if (matches(0x1f800000, 0x53000000)) return { kind: 'bitfield', op: ['ubfm', 'sbfm', 'bfm'][(word >>> 29) & 3] as 'ubfm', rd: word & 31, rn: (word >>> 5) & 31, immr: (word >>> 16) & 0x3f, imms: (word >>> 10) & 0x3f, sf };
  if ((word & 0x1f800000) === 0x13800000) return { kind: 'extr', rd: word & 31, rn: (word >>> 5) & 31, rm: (word >>> 16) & 31, lsb: (word >>> 10) & 0x3f, sf };
  if ((word & 0x1f000000) === 0x0b000000) {
    const op = (word >>> 29) & 3;
    const shifted = ((word >>> 22) & 1) === 0;
    const amount = (word >>> 10) & 0x3f;
    return { kind: 'reg', op: ['add', 'adds', 'sub', 'subs'][op] ?? 'add', rd: word & 31, rn: (word >>> 5) & 31, rm: (word >>> 16) & 31, shift: ['lsl', 'lsr', 'asr', 'ror'][(word >>> 22) & 3] as Shift, amount, sf, extend: shifted ? undefined : (word >>> 13) & 7 };
  }
  if (matches(0x1f200000, 0x1b000000)) return { kind: 'reg', op: (word & 0x40000000) ? 'msub' : 'madd', rd: word & 31, rn: (word >>> 5) & 31, rm: (word >>> 16) & 31, ra: (word >>> 10) & 31, sf };
  if ((word & 0x1fe0fc00) === 0x1ac00800) return { kind: 'reg', op: 'udiv', rd: word & 31, rn: (word >>> 5) & 31, rm: (word >>> 16) & 31, sf };
  if ((word & 0x1fe0fc00) === 0x1ac00c00) return { kind: 'reg', op: 'sdiv', rd: word & 31, rn: (word >>> 5) & 31, rm: (word >>> 16) & 31, sf };
  if ((word & 0x1f000000) === 0x0a000000) return { kind: 'reg', op: ['and', 'orr', 'eor', 'ands'][(word >>> 29) & 3] ?? 'and', rd: word & 31, rn: (word >>> 5) & 31, rm: (word >>> 16) & 31, sf };
  if ((word & 0x3b000000) === 0x39000000) {
    const size = 1 << ((word >>> 30) & 3);
    const load = Boolean(word & 0x00400000);
    const offset = ((word >>> 10) & 0xfff) * size;
    return { kind: 'loadstore', op: load ? `ldr${size === 1 ? 'b' : size === 2 ? 'h' : size === 4 ? 'w' : ''}` : `str${size === 1 ? 'b' : size === 2 ? 'h' : size === 4 ? 'w' : ''}`, rt: word & 31, rn: (word >>> 5) & 31, offset, sf: size === 8, size };
  }
  if ((word & 0x3b200c00) === 0x38200c00) {
    const load = Boolean(word & 0x00400000);
    const size = 1 << ((word >>> 30) & 3);
    return { kind: 'loadstore', op: load ? 'ldur' : 'stur', rt: word & 31, rn: (word >>> 5) & 31, offset: sign((word >>> 12) & 0x1ff, 9), sf: size === 8, size };
  }
  if ((word & 0x3e000000) === 0x28000000) {
    const load = Boolean(word & 0x00400000);
    const pre = Boolean(word & 0x00000020);
    const post = Boolean(word & 0x00000020) && !(word & 0x00000080);
    return { kind: 'pair', op: load ? 'ldp' : 'stp', rt: word & 31, rt2: (word >>> 10) & 31, rn: (word >>> 5) & 31, offset: sign((word >>> 15) & 0x7f, 7) * (sf ? 8 : 4), sf, pre, post };
  }
  if ((word & 0xffffffe0) === 0xd5033f9f) return { kind: 'hint', op: 'dmb' };
  if ((word & 0xffffffe0) === 0xd503309f) return { kind: 'hint', op: 'dsb' };
  if ((word & 0xffffffe0) === 0xd50330bf) return { kind: 'hint', op: 'isb' };
  if ((word & 0xffe00000) === 0xd5300000) return { kind: 'system', op: 'mrs', rt: word & 31, imm: word & 0xffffe0 };
  if ((word & 0xffe00000) === 0xd5100000) return { kind: 'system', op: 'msr', rn: word & 31, imm: word & 0xffffe0 };
  return { kind: 'unknown', word };
}

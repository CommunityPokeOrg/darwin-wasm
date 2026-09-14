/**
 * AArch64 (A64) instruction decoder.
 *
 * Decodes a 32-bit instruction word into a typed `Insn`. Encodings outside the
 * supported subset (see docs/SUPPORTED_INSTRUCTIONS.md) decode to
 * `{ kind: 'unknown' }`; the interpreter turns that into an
 * `UnsupportedInstruction` fault rather than guessing.
 *
 * Field layouts follow the Arm Architecture Reference Manual (A-profile),
 * chapter C4 "A64 instruction set encoding".
 */

export type ShiftType = 'lsl' | 'lsr' | 'asr' | 'ror';
export type ExtendType = 'uxtb' | 'uxth' | 'uxtw' | 'uxtx' | 'sxtb' | 'sxth' | 'sxtw' | 'sxtx';
export type Cond = number; // 0..15, see condHolds()

export type ArithOp = 'add' | 'adds' | 'sub' | 'subs';
export type LogicOp = 'and' | 'bic' | 'orr' | 'orn' | 'eor' | 'eon' | 'ands' | 'bics';
export type ShiftVarOp = 'lslv' | 'lsrv' | 'asrv' | 'rorv';
export type DivOp = 'udiv' | 'sdiv';
export type MulOp = 'madd' | 'msub' | 'smaddl' | 'smsubl' | 'umaddl' | 'umsubl' | 'smulh' | 'umulh';
export type Unary1Op = 'clz' | 'cls' | 'rbit' | 'rev' | 'rev16' | 'rev32';
export type CondSelOp = 'csel' | 'csinc' | 'csinv' | 'csneg';
export type CarryOp = 'adc' | 'adcs' | 'sbc' | 'sbcs';
export type BitfieldOp = 'sbfm' | 'bfm' | 'ubfm';
export type MoveWideOp = 'movn' | 'movz' | 'movk';
export type LoadStoreOp =
  | 'ldr' | 'str' | 'ldrb' | 'strb' | 'ldrh' | 'strh' | 'ldrsb' | 'ldrsh' | 'ldrsw';
export type AddrMode = 'uoff' | 'pre' | 'post' | 'unscaled' | 'reg';
export type ExclusiveOp = 'ldxr' | 'stxr' | 'ldaxr' | 'stlxr' | 'ldar' | 'stlr';
export type SysReg =
  | 'nzcv' | 'tpidr_el0' | 'tpidrro_el0' | 'cntvct_el0' | 'cntfrq_el0' | 'midr_el1' | 'ctr_el0'
  | 'dczid_el0' | 'fpcr' | 'fpsr';

export type Insn =
  | { kind: 'unknown'; word: number }
  | { kind: 'nop' }
  | { kind: 'svc'; imm: number }
  | { kind: 'brk'; imm: number }
  | { kind: 'hlt'; imm: number }
  // PC-relative addressing
  | { kind: 'adr'; rd: number; imm: bigint; page: boolean }
  // Data processing, immediate
  | { kind: 'arithImm'; op: ArithOp; sf: boolean; rd: number; rn: number; imm: bigint }
  | { kind: 'logicImm'; op: 'and' | 'orr' | 'eor' | 'ands'; sf: boolean; rd: number; rn: number; imm: bigint }
  | { kind: 'moveWide'; op: MoveWideOp; sf: boolean; rd: number; imm16: number; shift: number }
  | { kind: 'bitfield'; op: BitfieldOp; sf: boolean; rd: number; rn: number; immr: number; imms: number }
  | { kind: 'extr'; sf: boolean; rd: number; rn: number; rm: number; lsb: number }
  // Data processing, register
  | { kind: 'arithShifted'; op: ArithOp; sf: boolean; rd: number; rn: number; rm: number; shift: ShiftType; amount: number }
  | { kind: 'arithExtended'; op: ArithOp; sf: boolean; rd: number; rn: number; rm: number; extend: ExtendType; amount: number }
  | { kind: 'logicShifted'; op: LogicOp; sf: boolean; rd: number; rn: number; rm: number; shift: ShiftType; amount: number }
  | { kind: 'shiftVar'; op: ShiftVarOp; sf: boolean; rd: number; rn: number; rm: number }
  | { kind: 'div'; op: DivOp; sf: boolean; rd: number; rn: number; rm: number }
  | { kind: 'mul'; op: MulOp; sf: boolean; rd: number; rn: number; rm: number; ra: number }
  | { kind: 'unary'; op: Unary1Op; sf: boolean; rd: number; rn: number }
  | { kind: 'condSel'; op: CondSelOp; sf: boolean; rd: number; rn: number; rm: number; cond: Cond }
  | { kind: 'condCmp'; negate: boolean; sf: boolean; rn: number; rm: number; imm: number | null; nzcv: number; cond: Cond }
  | { kind: 'carry'; op: CarryOp; sf: boolean; rd: number; rn: number; rm: number }
  // Branches
  | { kind: 'b'; link: boolean; offset: bigint }
  | { kind: 'bcond'; cond: Cond; offset: bigint }
  | { kind: 'cbz'; nonzero: boolean; sf: boolean; rt: number; offset: bigint }
  | { kind: 'tbz'; nonzero: boolean; rt: number; bit: number; offset: bigint }
  | { kind: 'br'; op: 'br' | 'blr' | 'ret'; rn: number }
  // Loads and stores
  | {
      kind: 'ldst';
      op: LoadStoreOp;
      size: 1 | 2 | 4 | 8;      // bytes transferred
      sf: boolean;              // 64-bit destination register (ldrsb/ldrsh to X, ldrsw, ldr x)
      rt: number;
      rn: number;
      mode: AddrMode;
      imm: bigint;              // for uoff/pre/post/unscaled (already scaled)
      rm: number;               // for reg
      extend: ExtendType;       // for reg
      shift: number;            // for reg: 0 or log2(size)
    }
  | { kind: 'ldrLit'; op: 'ldr' | 'ldrsw'; sf: boolean; rt: number; offset: bigint }
  | { kind: 'ldstPair'; load: boolean; sf: boolean; signed: boolean; rt: number; rt2: number; rn: number; mode: 'off' | 'pre' | 'post'; imm: bigint }
  | { kind: 'exclusive'; op: ExclusiveOp; size: 1 | 2 | 4 | 8; rt: number; rn: number; rs: number }
  // System
  | { kind: 'mrs'; rt: number; reg: SysReg | null; encoding: number }
  | { kind: 'msr'; rt: number; reg: SysReg | null; encoding: number }
  | { kind: 'msrImm'; op: string };

const SHIFTS: readonly ShiftType[] = ['lsl', 'lsr', 'asr', 'ror'];
const EXTENDS: readonly ExtendType[] = ['uxtb', 'uxth', 'uxtw', 'uxtx', 'sxtb', 'sxth', 'sxtw', 'sxtx'];
const ARITH: readonly ArithOp[] = ['add', 'adds', 'sub', 'subs'];

function bits(word: number, hi: number, lo: number): number {
  return (word >>> lo) & ((2 ** (hi - lo + 1)) - 1);
}
function bit(word: number, n: number): number {
  return (word >>> n) & 1;
}
function signExtend(value: number, width: number): bigint {
  const v = BigInt(value);
  return v & (1n << BigInt(width - 1)) ? v - (1n << BigInt(width)) : v;
}

/**
 * Arm ARM `DecodeBitMasks(N, imms, immr, immediate)` returning only wmask.
 * Returns `null` for reserved encodings.
 */
export function decodeBitMasks(n: number, imms: number, immr: number, sf: boolean): bigint | null {
  // len = HighestSetBit(N:NOT(imms))
  const combined = (n << 6) | (~imms & 0x3f);
  let len = -1;
  for (let i = 6; i >= 0; i--) if (combined & (1 << i)) { len = i; break; }
  if (len < 1) return null;
  if (!sf && n === 1) return null;
  const esize = 1 << len;
  const levels = esize - 1;
  const s = imms & levels;
  const r = immr & levels;
  if (s === levels) return null; // immediate form: all-ones reserved
  const welem = (1n << BigInt(s + 1)) - 1n;
  const emask = (1n << BigInt(esize)) - 1n;
  const rotated = ((welem >> BigInt(r)) | (welem << BigInt(esize - r))) & emask;
  let wmask = 0n;
  const width = sf ? 64 : 32;
  for (let pos = 0; pos < width; pos += esize) wmask |= rotated << BigInt(pos);
  return wmask & (sf ? 0xffff_ffff_ffff_ffffn : 0xffff_ffffn);
}

const SYSREGS: Record<number, SysReg> = {
  // encoding = op0:op1:CRn:CRm:op2 packed as in bits[19:5]
  0x5a10: 'nzcv',        // S3_3_C4_C2_0
  0x5e82: 'tpidr_el0',   // S3_3_C13_C0_2
  0x5e83: 'tpidrro_el0', // S3_3_C13_C0_3
  0x5f02: 'cntvct_el0',  // S3_3_C14_C0_2
  0x5f00: 'cntfrq_el0',  // S3_3_C14_C0_0
  0x4000: 'midr_el1',    // S3_0_C0_C0_0
  0x5801: 'ctr_el0',     // S3_3_C0_C0_1
  0x5807: 'dczid_el0',   // S3_3_C0_C0_7
  0x5a20: 'fpcr',        // S3_3_C4_C4_0
  0x5a21: 'fpsr',        // S3_3_C4_C4_1
};

export function decode(word: number): Insn {
  word >>>= 0;
  const op0 = bits(word, 28, 25);

  // --- Data processing, immediate: op0 = 100x
  if ((op0 & 0b1110) === 0b1000) return decodeDpImm(word);
  // --- Branches, exception generating, system: op0 = 101x
  if ((op0 & 0b1110) === 0b1010) return decodeBranchSys(word);
  // --- Loads and stores: op0 = x1x0
  if ((op0 & 0b0101) === 0b0100) return decodeLoadStore(word);
  // --- Data processing, register: op0 = x101
  if ((op0 & 0b0111) === 0b0101) return decodeDpReg(word);
  // --- Data processing, SIMD & FP: op0 = x111 -> unsupported
  return { kind: 'unknown', word };
}

function decodeDpImm(word: number): Insn {
  const sf = bit(word, 31) === 1;
  const op = bits(word, 25, 23);
  const rd = bits(word, 4, 0);
  const rn = bits(word, 9, 5);
  switch (op) {
    case 0b000: case 0b001: { // ADR / ADRP
      const immlo = bits(word, 30, 29);
      const immhi = bits(word, 23, 5);
      const imm = signExtend((immhi << 2) | immlo, 21);
      const page = bit(word, 31) === 1;
      return { kind: 'adr', rd, imm: page ? imm << 12n : imm, page };
    }
    case 0b010: { // add/sub immediate
      const sh = bit(word, 22);
      const imm12 = bits(word, 21, 10);
      const opc = bits(word, 30, 29);
      return { kind: 'arithImm', op: ARITH[opc] as ArithOp, sf, rd, rn, imm: BigInt(imm12) << (sh ? 12n : 0n) };
    }
    case 0b011: return { kind: 'unknown', word }; // add/sub immediate with tags (MTE)
    case 0b100: { // logical immediate
      const n = bit(word, 22);
      const immr = bits(word, 21, 16);
      const imms = bits(word, 15, 10);
      const imm = decodeBitMasks(n, imms, immr, sf);
      if (imm === null) return { kind: 'unknown', word };
      const ops = ['and', 'orr', 'eor', 'ands'] as const;
      return { kind: 'logicImm', op: ops[bits(word, 30, 29)] as 'and', sf, rd, rn, imm };
    }
    case 0b101: { // move wide
      const opc = bits(word, 30, 29);
      const hw = bits(word, 22, 21);
      if (opc === 0b01 || (!sf && hw > 1)) return { kind: 'unknown', word };
      const ops: Record<number, MoveWideOp> = { 0: 'movn', 2: 'movz', 3: 'movk' };
      return { kind: 'moveWide', op: ops[opc] as MoveWideOp, sf, rd, imm16: bits(word, 20, 5), shift: hw * 16 };
    }
    case 0b110: { // bitfield
      const opc = bits(word, 30, 29);
      const n = bit(word, 22);
      if (opc === 3 || n !== (sf ? 1 : 0)) return { kind: 'unknown', word };
      const immr = bits(word, 21, 16);
      const imms = bits(word, 15, 10);
      if (!sf && (immr > 31 || imms > 31)) return { kind: 'unknown', word };
      const ops: readonly BitfieldOp[] = ['sbfm', 'bfm', 'ubfm'];
      return { kind: 'bitfield', op: ops[opc] as BitfieldOp, sf, rd, rn, immr, imms };
    }
    case 0b111: { // extract
      const n = bit(word, 22);
      if (bits(word, 30, 29) !== 0 || bit(word, 21) !== 0 || n !== (sf ? 1 : 0)) return { kind: 'unknown', word };
      const lsb = bits(word, 15, 10);
      if (!sf && lsb > 31) return { kind: 'unknown', word };
      return { kind: 'extr', sf, rd, rn, rm: bits(word, 20, 16), lsb };
    }
    default: return { kind: 'unknown', word };
  }
}

function decodeBranchSys(word: number): Insn {
  const op0 = bits(word, 31, 29);

  if ((word & 0x7c00_0000) === 0x1400_0000) { // B / BL
    return { kind: 'b', link: bit(word, 31) === 1, offset: signExtend(bits(word, 25, 0), 26) << 2n };
  }
  if (((word & 0xff00_0010) >>> 0) === 0x5400_0000) { // B.cond
    return { kind: 'bcond', cond: bits(word, 3, 0), offset: signExtend(bits(word, 23, 5), 19) << 2n };
  }
  if ((word & 0x7e00_0000) === 0x3400_0000) { // CBZ / CBNZ
    return { kind: 'cbz', nonzero: bit(word, 24) === 1, sf: bit(word, 31) === 1, rt: bits(word, 4, 0), offset: signExtend(bits(word, 23, 5), 19) << 2n };
  }
  if ((word & 0x7e00_0000) === 0x3600_0000) { // TBZ / TBNZ
    return { kind: 'tbz', nonzero: bit(word, 24) === 1, rt: bits(word, 4, 0), bit: (bit(word, 31) << 5) | bits(word, 23, 19), offset: signExtend(bits(word, 18, 5), 14) << 2n };
  }
  if (op0 === 0b110) {
    if (bit(word, 25) === 1) { // unconditional branch, register
      const opc = bits(word, 24, 21);
      const op2 = bits(word, 20, 16);
      const op3 = bits(word, 15, 10);
      const op4 = bits(word, 4, 0);
      if (op2 !== 0b11111 || op3 !== 0 || op4 !== 0) return { kind: 'unknown', word };
      const rn = bits(word, 9, 5);
      if (opc === 0) return { kind: 'br', op: 'br', rn };
      if (opc === 1) return { kind: 'br', op: 'blr', rn };
      if (opc === 2) return { kind: 'br', op: 'ret', rn };
      return { kind: 'unknown', word };
    }
    if (bits(word, 24, 21) === 0) { // exception generation
      const opc = bits(word, 23, 21);
      const ll = bits(word, 1, 0);
      const imm = bits(word, 20, 5);
      if (opc === 0 && ll === 1) return { kind: 'svc', imm };
      if (opc === 1 && ll === 0) return { kind: 'brk', imm };
      if (opc === 2 && ll === 0) return { kind: 'hlt', imm };
      return { kind: 'unknown', word };
    }
    if (bits(word, 24, 22) === 0b100 && bit(word, 21) === 0 && bits(word, 20, 19) === 0) {
      // hints, barriers, MSR (immediate)
      const crn = bits(word, 15, 12);
      const rt = bits(word, 4, 0);
      if (crn === 0b0010 && rt === 0b11111) return { kind: 'nop' }; // NOP/YIELD/WFE/WFI/SEV/SEVL/...
      if (crn === 0b0011 && rt === 0b11111) return { kind: 'nop' }; // CLREX/DSB/DMB/ISB/SB
      if (crn === 0b0100) return { kind: 'msrImm', op: 'msr-imm' };
      return { kind: 'unknown', word };
    }
    if (((word & 0xfff0_0000) >>> 0) === 0xd530_0000) { // MRS
      const encoding = bits(word, 19, 5);
      return { kind: 'mrs', rt: bits(word, 4, 0), reg: SYSREGS[encoding] ?? null, encoding };
    }
    if (((word & 0xfff0_0000) >>> 0) === 0xd510_0000) { // MSR (register)
      const encoding = bits(word, 19, 5);
      return { kind: 'msr', rt: bits(word, 4, 0), reg: SYSREGS[encoding] ?? null, encoding };
    }
  }
  return { kind: 'unknown', word };
}

function decodeDpReg(word: number): Insn {
  const sf = bit(word, 31) === 1;
  const rd = bits(word, 4, 0);
  const rn = bits(word, 9, 5);
  const rm = bits(word, 20, 16);
  const op1 = bit(word, 28);
  const op2 = bits(word, 24, 21);

  if (op1 === 0) {
    if (bit(word, 24) === 0) { // logical (shifted register)
      const opc = bits(word, 30, 29);
      const n = bit(word, 21);
      const imm6 = bits(word, 15, 10);
      if (!sf && imm6 > 31) return { kind: 'unknown', word };
      const ops: readonly LogicOp[] = ['and', 'bic', 'orr', 'orn', 'eor', 'eon', 'ands', 'bics'];
      return { kind: 'logicShifted', op: ops[(opc << 1) | n] as LogicOp, sf, rd, rn, rm, shift: SHIFTS[bits(word, 23, 22)] as ShiftType, amount: imm6 };
    }
    const opc = bits(word, 30, 29);
    if (bit(word, 21) === 0) { // add/sub (shifted register)
      const shift = bits(word, 23, 22);
      const imm6 = bits(word, 15, 10);
      if (shift === 3 || (!sf && imm6 > 31)) return { kind: 'unknown', word };
      return { kind: 'arithShifted', op: ARITH[opc] as ArithOp, sf, rd, rn, rm, shift: SHIFTS[shift] as ShiftType, amount: imm6 };
    }
    // add/sub (extended register)
    if (bits(word, 23, 22) !== 0) return { kind: 'unknown', word };
    const option = bits(word, 15, 13);
    const imm3 = bits(word, 12, 10);
    if (imm3 > 4) return { kind: 'unknown', word };
    return { kind: 'arithExtended', op: ARITH[opc] as ArithOp, sf, rd, rn, rm, extend: EXTENDS[option] as ExtendType, amount: imm3 };
  }

  // op1 == 1
  if (op2 === 0b0000) { // add/sub with carry
    if (bits(word, 15, 10) !== 0) return { kind: 'unknown', word };
    const opc = bits(word, 30, 29);
    const ops: readonly CarryOp[] = ['adc', 'adcs', 'sbc', 'sbcs'];
    return { kind: 'carry', op: ops[opc] as CarryOp, sf, rd, rn, rm };
  }
  if (op2 === 0b0010) { // conditional compare
    const opc = bits(word, 30, 29);
    if (opc !== 0b01 && opc !== 0b11) return { kind: 'unknown', word };
    if (bit(word, 10) !== 0 || bit(word, 4) !== 0) return { kind: 'unknown', word };
    const isImm = bit(word, 11) === 1;
    return { kind: 'condCmp', negate: opc === 0b01, sf, rn, rm: isImm ? 0 : rm, imm: isImm ? rm : null, nzcv: bits(word, 3, 0), cond: bits(word, 15, 12) };
  }
  if (op2 === 0b0100) { // conditional select
    const opc = bits(word, 30, 29);
    const o2 = bits(word, 11, 10);
    if (o2 > 1) return { kind: 'unknown', word };
    const table: Record<number, CondSelOp> = { 0b000: 'csel', 0b001: 'csinc', 0b100: 'csinv', 0b101: 'csneg' };
    const op = table[(opc << 1) | o2];
    if (!op) return { kind: 'unknown', word };
    return { kind: 'condSel', op, sf, rd, rn, rm, cond: bits(word, 15, 12) };
  }
  if (op2 === 0b0110) {
    if (bit(word, 30) === 0) { // data-processing (2 source)
      if (bit(word, 29) !== 0) return { kind: 'unknown', word };
      const opcode = bits(word, 15, 10);
      if (opcode === 0b000010) return { kind: 'div', op: 'udiv', sf, rd, rn, rm };
      if (opcode === 0b000011) return { kind: 'div', op: 'sdiv', sf, rd, rn, rm };
      if (opcode >= 0b001000 && opcode <= 0b001011) {
        const ops: readonly ShiftVarOp[] = ['lslv', 'lsrv', 'asrv', 'rorv'];
        return { kind: 'shiftVar', op: ops[opcode - 0b001000] as ShiftVarOp, sf, rd, rn, rm };
      }
      return { kind: 'unknown', word };
    }
    // data-processing (1 source)
    if (bit(word, 29) !== 0 || bits(word, 20, 16) !== 0) return { kind: 'unknown', word };
    const opcode = bits(word, 15, 10);
    switch (opcode) {
      case 0b000000: return { kind: 'unary', op: 'rbit', sf, rd, rn };
      case 0b000001: return { kind: 'unary', op: 'rev16', sf, rd, rn };
      case 0b000010: return { kind: 'unary', op: sf ? 'rev32' : 'rev', sf, rd, rn };
      case 0b000011: return sf ? { kind: 'unary', op: 'rev', sf, rd, rn } : { kind: 'unknown', word };
      case 0b000100: return { kind: 'unary', op: 'clz', sf, rd, rn };
      case 0b000101: return { kind: 'unary', op: 'cls', sf, rd, rn };
      default: return { kind: 'unknown', word };
    }
  }
  if ((op2 & 0b1000) === 0b1000) { // data-processing (3 source)
    const op31 = bits(word, 23, 21);
    const o0 = bit(word, 15);
    const ra = bits(word, 14, 10);
    if (bits(word, 30, 29) !== 0) return { kind: 'unknown', word };
    if (op31 === 0) return { kind: 'mul', op: o0 ? 'msub' : 'madd', sf, rd, rn, rm, ra };
    if (!sf) return { kind: 'unknown', word };
    if (op31 === 0b001) return { kind: 'mul', op: o0 ? 'smsubl' : 'smaddl', sf, rd, rn, rm, ra };
    if (op31 === 0b010 && o0 === 0 && ra === 31) return { kind: 'mul', op: 'smulh', sf, rd, rn, rm, ra };
    if (op31 === 0b101) return { kind: 'mul', op: o0 ? 'umsubl' : 'umaddl', sf, rd, rn, rm, ra };
    if (op31 === 0b110 && o0 === 0 && ra === 31) return { kind: 'mul', op: 'umulh', sf, rd, rn, rm, ra };
    return { kind: 'unknown', word };
  }
  return { kind: 'unknown', word };
}

function decodeLoadStore(word: number): Insn {
  const op0 = bits(word, 31, 28);
  const op1 = bit(word, 26); // V (SIMD&FP)
  const rt = bits(word, 4, 0);
  const rn = bits(word, 9, 5);
  if (op1 === 1) return { kind: 'unknown', word }; // SIMD&FP loads/stores

  // Load/store exclusive & ordered: op0 = xx00, op2 = 0x, bit 21 varies
  if ((op0 & 0b0011) === 0 && bit(word, 24) === 0 && bit(word, 23) === 0 && (bits(word, 29, 28) === 0)) {
    const size = (1 << bits(word, 31, 30)) as 1 | 2 | 4 | 8;
    const o2 = bit(word, 23);
    const l = bit(word, 22);
    const o1 = bit(word, 21);
    const o0 = bit(word, 15);
    const rs = bits(word, 20, 16);
    const rt2 = bits(word, 14, 10);
    if (o2 !== 0 || o1 !== 0 || rt2 !== 0b11111) return { kind: 'unknown', word };
    // o2=0: exclusive; ordered (LDAR/STLR) is encoded with bit23=1 which we handle below
    if (l === 0) return { kind: 'exclusive', op: o0 ? 'stlxr' : 'stxr', size, rt, rn, rs };
    if (rs !== 0b11111) return { kind: 'unknown', word };
    return { kind: 'exclusive', op: o0 ? 'ldaxr' : 'ldxr', size, rt, rn, rs };
  }
  if ((op0 & 0b0011) === 0 && bit(word, 24) === 0 && bit(word, 23) === 1 && bits(word, 29, 28) === 0 && bit(word, 21) === 0) {
    // LDAR / STLR (and LDLAR/STLLR with o0=0, which we don't distinguish)
    const size = (1 << bits(word, 31, 30)) as 1 | 2 | 4 | 8;
    const l = bit(word, 22);
    if (bits(word, 20, 16) !== 0b11111 || bits(word, 14, 10) !== 0b11111) return { kind: 'unknown', word };
    return { kind: 'exclusive', op: l ? 'ldar' : 'stlr', size, rt, rn, rs: 31 };
  }

  // Load register (literal): op0 = xx01, op2 = 0x
  if ((op0 & 0b0011) === 0b0001 && bit(word, 24) === 0) {
    const opc = bits(word, 31, 30);
    const offset = signExtend(bits(word, 23, 5), 19) << 2n;
    if (opc === 0) return { kind: 'ldrLit', op: 'ldr', sf: false, rt, offset };
    if (opc === 1) return { kind: 'ldrLit', op: 'ldr', sf: true, rt, offset };
    if (opc === 2) return { kind: 'ldrLit', op: 'ldrsw', sf: true, rt, offset };
    return { kind: 'unknown', word }; // PRFM literal
  }

  // Load/store register pair: op0 = xx10
  if ((op0 & 0b0011) === 0b0010) {
    const opc = bits(word, 31, 30);
    const l = bit(word, 22) === 1;
    const rt2 = bits(word, 14, 10);
    const imm7 = signExtend(bits(word, 21, 15), 7);
    let sf: boolean; let signed = false;
    if (opc === 0) sf = false;
    else if (opc === 1) { if (!l) return { kind: 'unknown', word }; sf = true; signed = true; } // LDPSW
    else if (opc === 2) sf = true;
    else return { kind: 'unknown', word };
    const scale = signed ? 4n : sf ? 8n : 4n;
    const modeBits = bits(word, 24, 23);
    if (modeBits === 0) return { kind: 'unknown', word }; // LDNP/STNP: treat unsupported
    const mode = modeBits === 1 ? 'post' : modeBits === 2 ? 'off' : 'pre';
    return { kind: 'ldstPair', load: l, sf, signed, rt, rt2, rn, mode, imm: imm7 * scale };
  }

  // Load/store register: op0 = xx11
  if ((op0 & 0b0011) === 0b0011) {
    const sizeBits = bits(word, 31, 30);
    const opc = bits(word, 23, 22);
    const size = (1 << sizeBits) as 1 | 2 | 4 | 8;
    // Determine op and destination width
    let op: LoadStoreOp; let sf: boolean;
    if (opc === 0) { op = (['strb', 'strh', 'str', 'str'] as const)[sizeBits] as LoadStoreOp; sf = size === 8; }
    else if (opc === 1) { op = (['ldrb', 'ldrh', 'ldr', 'ldr'] as const)[sizeBits] as LoadStoreOp; sf = size === 8; }
    else if (opc === 2) {
      if (sizeBits === 3) return { kind: 'unknown', word }; // PRFM
      op = (['ldrsb', 'ldrsh', 'ldrsw'] as const)[sizeBits] as LoadStoreOp; sf = true;
    } else {
      if (sizeBits >= 2) return { kind: 'unknown', word };
      op = (['ldrsb', 'ldrsh'] as const)[sizeBits] as LoadStoreOp; sf = false;
    }
    const base = { kind: 'ldst' as const, op, size, sf, rt, rn, rm: 0, extend: 'uxtx' as ExtendType, shift: 0 };

    if (bit(word, 24) === 1) { // unsigned offset
      return { ...base, mode: 'uoff', imm: BigInt(bits(word, 21, 10)) * BigInt(size) };
    }
    if (bit(word, 21) === 0) {
      const imm9 = signExtend(bits(word, 20, 12), 9);
      const idx = bits(word, 11, 10);
      if (idx === 0) return { ...base, mode: 'unscaled', imm: imm9 }; // LDUR/STUR
      if (idx === 1) return { ...base, mode: 'post', imm: imm9 };
      if (idx === 3) return { ...base, mode: 'pre', imm: imm9 };
      return { kind: 'unknown', word }; // unprivileged (LDTR/STTR)
    }
    if (bits(word, 11, 10) === 0b10) { // register offset
      const option = bits(word, 15, 13);
      if (bit(option, 1) === 0) return { kind: 'unknown', word }; // option[1] must be 1
      const s = bit(word, 12);
      return { ...base, mode: 'reg', imm: 0n, rm: bits(word, 20, 16), extend: EXTENDS[option] as ExtendType, shift: s ? sizeBits : 0 };
    }
    return { kind: 'unknown', word }; // atomics (LDADD etc.), PAC loads
  }
  return { kind: 'unknown', word };
}

/**
 * AArch64 interpreter. Executes decoded `Insn`s against `CpuState` + `Memory`.
 *
 * Arithmetic is done with BigInt masked to 32 or 64 bits. Flag computation
 * follows the Arm ARM `AddWithCarry` pseudocode.
 */
import { Memory } from '../mem/memory';
import { CpuState, Trap } from './state';
import { decode, Insn, ShiftType, ExtendType, Cond } from './decoder';

const M32 = 0xffff_ffffn;
const M64 = 0xffff_ffff_ffff_ffffn;
const SIGN32 = 0x8000_0000n;
const SIGN64 = 0x8000_0000_0000_0000n;

export class UnsupportedInstruction extends Error {
  constructor(readonly pc: bigint, readonly word: number) {
    super(`unsupported instruction 0x${word.toString(16).padStart(8, '0')} at 0x${pc.toString(16)}`);
    this.name = 'UnsupportedInstruction';
  }
}

export class UnsupportedSystemRegister extends Error {
  constructor(readonly pc: bigint, readonly encoding: number, readonly write: boolean) {
    super(`unsupported system register encoding 0x${encoding.toString(16)} (${write ? 'MSR' : 'MRS'}) at 0x${pc.toString(16)}`);
    this.name = 'UnsupportedSystemRegister';
  }
}

export function condHolds(s: CpuState, cond: Cond): boolean {
  let result: boolean;
  switch (cond >> 1) {
    case 0: result = s.z; break;                       // EQ / NE
    case 1: result = s.c; break;                       // CS / CC
    case 2: result = s.n; break;                       // MI / PL
    case 3: result = s.v; break;                       // VS / VC
    case 4: result = s.c && !s.z; break;               // HI / LS
    case 5: result = s.n === s.v; break;               // GE / LT
    case 6: result = s.n === s.v && !s.z; break;       // GT / LE
    default: return true;                              // AL / NV (both always true)
  }
  return (cond & 1) === 1 && cond !== 15 ? !result : result;
}

export function asSigned(v: bigint, sf: boolean): bigint {
  return sf ? BigInt.asIntN(64, v) : BigInt.asIntN(32, v);
}
function asUnsigned(v: bigint, sf: boolean): bigint {
  return sf ? BigInt.asUintN(64, v) : BigInt.asUintN(32, v);
}

/** Arm ARM AddWithCarry: returns [result, n, z, c, v]. */
export function addWithCarry(a: bigint, b: bigint, carryIn: boolean, sf: boolean): [bigint, boolean, boolean, boolean, boolean] {
  const mask = sf ? M64 : M32;
  const bits = sf ? 64 : 32;
  const ua = a & mask;
  const ub = b & mask;
  const unsigned = ua + ub + (carryIn ? 1n : 0n);
  const result = unsigned & mask;
  const signed = asSigned(ua, sf) + asSigned(ub, sf) + (carryIn ? 1n : 0n);
  const n = (result >> BigInt(bits - 1)) === 1n;
  const z = result === 0n;
  const c = unsigned !== result;
  const v = asSigned(result, sf) !== signed;
  return [result, n, z, c, v];
}

export function shiftReg(value: bigint, type: ShiftType, amount: number, sf: boolean): bigint {
  const bits = sf ? 64 : 32;
  const mask = sf ? M64 : M32;
  amount %= bits;
  const v = value & mask;
  if (amount === 0) return v;
  const a = BigInt(amount);
  switch (type) {
    case 'lsl': return (v << a) & mask;
    case 'lsr': return v >> a;
    case 'asr': return asUnsigned(asSigned(v, sf) >> a, sf);
    case 'ror': return ((v >> a) | (v << BigInt(bits - amount))) & mask;
  }
}

export function extendReg(value: bigint, type: ExtendType, shift: number, sf: boolean): bigint {
  let v: bigint;
  switch (type) {
    case 'uxtb': v = value & 0xffn; break;
    case 'uxth': v = value & 0xffffn; break;
    case 'uxtw': v = value & M32; break;
    case 'uxtx': v = value & M64; break;
    case 'sxtb': v = BigInt.asIntN(8, value); break;
    case 'sxth': v = BigInt.asIntN(16, value); break;
    case 'sxtw': v = BigInt.asIntN(32, value); break;
    case 'sxtx': v = BigInt.asIntN(64, value); break;
  }
  return asUnsigned(v << BigInt(shift), sf);
}

function highestSetBit(v: bigint): number {
  return v === 0n ? -1 : v.toString(2).length - 1;
}

function reverseBytes(v: bigint, containerBytes: number, totalBytes: number): bigint {
  let out = 0n;
  for (let c = 0; c < totalBytes; c += containerBytes) {
    for (let i = 0; i < containerBytes; i++) {
      const byte = (v >> BigInt((c + i) * 8)) & 0xffn;
      out |= byte << BigInt((c + containerBytes - 1 - i) * 8);
    }
  }
  return out;
}

const DECODE_CACHE_LIMIT = 65536;

export class Cpu {
  private readonly cache = new Map<number, Insn>();

  constructor(readonly state: CpuState, readonly mem: Memory) {}

  decodeCached(word: number): Insn {
    let insn = this.cache.get(word);
    if (insn === undefined) {
      insn = decode(word);
      if (this.cache.size >= DECODE_CACHE_LIMIT) this.cache.clear();
      this.cache.set(word, insn);
    }
    return insn;
  }

  /** Executes one instruction. Returns a Trap for SVC/BRK/HLT, otherwise null. */
  step(): Trap | null {
    const s = this.state;
    const pc = s.pc;
    const word = this.mem.read32(pc);
    const insn = this.decodeCached(word);
    let nextPc = pc + 4n;
    let trap: Trap | null = null;

    switch (insn.kind) {
      case 'unknown':
        throw new UnsupportedInstruction(pc, insn.word);
      case 'nop':
      case 'msrImm':
        break;
      case 'svc': trap = { kind: 'svc', imm: insn.imm }; break;
      case 'brk': trap = { kind: 'brk', imm: insn.imm }; break;
      case 'hlt': trap = { kind: 'hlt', imm: insn.imm }; break;

      case 'adr': {
        const base = insn.page ? pc & ~0xfffn : pc;
        s.setX(insn.rd, (base + insn.imm) & M64, true);
        break;
      }

      case 'arithImm': {
        const a = s.getXorSp(insn.rn, insn.sf);
        this.arith(insn.op, insn.sf, insn.rd, a, insn.imm, true);
        break;
      }
      case 'arithShifted': {
        const a = s.getX(insn.rn, insn.sf);
        const b = shiftReg(s.getX(insn.rm, insn.sf), insn.shift, insn.amount, insn.sf);
        this.arith(insn.op, insn.sf, insn.rd, a, b, false);
        break;
      }
      case 'arithExtended': {
        const a = s.getXorSp(insn.rn, insn.sf);
        const b = extendReg(s.getX(insn.rm, true), insn.extend, insn.amount, insn.sf);
        this.arith(insn.op, insn.sf, insn.rd, a, b, true);
        break;
      }
      case 'carry': {
        const a = s.getX(insn.rn, insn.sf);
        let b = s.getX(insn.rm, insn.sf);
        if (insn.op === 'sbc' || insn.op === 'sbcs') b = ~b & (insn.sf ? M64 : M32);
        const [r, n, z, c, v] = addWithCarry(a, b, s.c, insn.sf);
        if (insn.op === 'adcs' || insn.op === 'sbcs') { s.n = n; s.z = z; s.c = c; s.v = v; }
        s.setX(insn.rd, r, insn.sf);
        break;
      }

      case 'logicImm': {
        const a = s.getX(insn.rn, insn.sf);
        let r: bigint;
        switch (insn.op) {
          case 'and': case 'ands': r = a & insn.imm; break;
          case 'orr': r = a | insn.imm; break;
          case 'eor': r = a ^ insn.imm; break;
        }
        if (insn.op === 'ands') { this.setNZ(r, insn.sf); s.c = false; s.v = false; s.setX(insn.rd, r, insn.sf); }
        else s.setXorSp(insn.rd, r, insn.sf);
        break;
      }
      case 'logicShifted': {
        const mask = insn.sf ? M64 : M32;
        const a = s.getX(insn.rn, insn.sf);
        let b = shiftReg(s.getX(insn.rm, insn.sf), insn.shift, insn.amount, insn.sf);
        let r: bigint;
        switch (insn.op) {
          case 'bic': case 'orn': case 'eon': case 'bics': b = ~b & mask; break;
          default: break;
        }
        switch (insn.op) {
          case 'and': case 'bic': case 'ands': case 'bics': r = a & b; break;
          case 'orr': case 'orn': r = a | b; break;
          case 'eor': case 'eon': r = a ^ b; break;
        }
        if (insn.op === 'ands' || insn.op === 'bics') { this.setNZ(r, insn.sf); s.c = false; s.v = false; }
        s.setX(insn.rd, r, insn.sf);
        break;
      }

      case 'moveWide': {
        const imm = BigInt(insn.imm16) << BigInt(insn.shift);
        let r: bigint;
        if (insn.op === 'movz') r = imm;
        else if (insn.op === 'movn') r = ~imm;
        else r = (s.getX(insn.rd, insn.sf) & ~(0xffffn << BigInt(insn.shift))) | imm;
        s.setX(insn.rd, r, insn.sf);
        break;
      }

      case 'bitfield': {
        const bits = insn.sf ? 64 : 32;
        const mask = insn.sf ? M64 : M32;
        const { immr, imms } = insn;
        const src = s.getX(insn.rn, insn.sf);
        const { wmask, tmask } = bfmMask(bits, immr, imms);
        const rotated = shiftReg(src, 'ror', immr, insn.sf);
        const dst = insn.op === 'bfm' ? s.getX(insn.rd, insn.sf) : 0n;
        const bot = (dst & ~wmask) | (rotated & wmask);
        let top: bigint;
        if (insn.op === 'sbfm') top = (src >> BigInt(imms)) & 1n ? mask : 0n;
        else if (insn.op === 'bfm') top = dst;
        else top = 0n;
        const r = (top & ~tmask) | (bot & tmask);
        s.setX(insn.rd, r & mask, insn.sf);
        break;
      }
      case 'extr': {
        const bits = insn.sf ? 64 : 32;
        const hi = s.getX(insn.rn, insn.sf);
        const lo = s.getX(insn.rm, insn.sf);
        const r = insn.lsb === 0 ? lo : ((lo >> BigInt(insn.lsb)) | (hi << BigInt(bits - insn.lsb))) & (insn.sf ? M64 : M32);
        s.setX(insn.rd, r, insn.sf);
        break;
      }

      case 'shiftVar': {
        const bits = insn.sf ? 64 : 32;
        const amount = Number(s.getX(insn.rm, insn.sf) % BigInt(bits));
        const types: Record<string, ShiftType> = { lslv: 'lsl', lsrv: 'lsr', asrv: 'asr', rorv: 'ror' };
        s.setX(insn.rd, shiftReg(s.getX(insn.rn, insn.sf), types[insn.op] as ShiftType, amount, insn.sf), insn.sf);
        break;
      }
      case 'div': {
        const a = s.getX(insn.rn, insn.sf);
        const b = s.getX(insn.rm, insn.sf);
        let r: bigint;
        if (b === 0n) r = 0n;
        else if (insn.op === 'udiv') r = a / b;
        else r = asUnsigned(asSigned(a, insn.sf) / asSigned(b, insn.sf), insn.sf); // trunc toward zero; MIN/-1 wraps
        s.setX(insn.rd, r, insn.sf);
        break;
      }
      case 'mul': {
        const n = s.getX(insn.rn, insn.sf);
        const m = s.getX(insn.rm, insn.sf);
        const a = s.getX(insn.ra, insn.sf);
        let r: bigint;
        switch (insn.op) {
          case 'madd': r = a + n * m; break;
          case 'msub': r = a - n * m; break;
          case 'smaddl': r = a + BigInt.asIntN(32, n) * BigInt.asIntN(32, m); break;
          case 'smsubl': r = a - BigInt.asIntN(32, n) * BigInt.asIntN(32, m); break;
          case 'umaddl': r = a + (n & M32) * (m & M32); break;
          case 'umsubl': r = a - (n & M32) * (m & M32); break;
          case 'smulh': r = (BigInt.asIntN(64, n) * BigInt.asIntN(64, m)) >> 64n; break;
          case 'umulh': r = (n * m) >> 64n; break;
        }
        s.setX(insn.rd, r, insn.sf);
        break;
      }
      case 'unary': {
        const bits = insn.sf ? 64 : 32;
        const v = s.getX(insn.rn, insn.sf);
        let r: bigint;
        switch (insn.op) {
          case 'clz': r = BigInt(bits - 1 - highestSetBit(v)); break;
          case 'cls': {
            const sign = (v >> BigInt(bits - 1)) & 1n;
            const flipped = sign ? (~v & (insn.sf ? M64 : M32)) : v;
            r = BigInt(bits - 1 - highestSetBit(flipped) - 1);
            break;
          }
          case 'rbit': {
            r = 0n;
            for (let i = 0; i < bits; i++) if ((v >> BigInt(i)) & 1n) r |= 1n << BigInt(bits - 1 - i);
            break;
          }
          case 'rev': r = reverseBytes(v, bits / 8, bits / 8); break;
          case 'rev16': r = reverseBytes(v, 2, bits / 8); break;
          case 'rev32': r = reverseBytes(v, 4, 8); break;
        }
        s.setX(insn.rd, r, insn.sf);
        break;
      }

      case 'condSel': {
        const mask = insn.sf ? M64 : M32;
        let r: bigint;
        if (condHolds(s, insn.cond)) r = s.getX(insn.rn, insn.sf);
        else {
          const m = s.getX(insn.rm, insn.sf);
          switch (insn.op) {
            case 'csel': r = m; break;
            case 'csinc': r = (m + 1n) & mask; break;
            case 'csinv': r = ~m & mask; break;
            case 'csneg': r = (-m) & mask; break;
          }
        }
        s.setX(insn.rd, r, insn.sf);
        break;
      }
      case 'condCmp': {
        if (condHolds(s, insn.cond)) {
          const a = s.getX(insn.rn, insn.sf);
          let b = insn.imm !== null ? BigInt(insn.imm) : s.getX(insn.rm, insn.sf);
          if (!insn.negate) b = ~b & (insn.sf ? M64 : M32); // CCMP = a + NOT(b) + 1
          const [, n, z, c, v] = addWithCarry(a, b, !insn.negate, insn.sf);
          s.n = n; s.z = z; s.c = c; s.v = v;
        } else {
          s.n = (insn.nzcv & 8) !== 0; s.z = (insn.nzcv & 4) !== 0; s.c = (insn.nzcv & 2) !== 0; s.v = (insn.nzcv & 1) !== 0;
        }
        break;
      }

      case 'b':
        if (insn.link) s.setX(30, nextPc, true);
        nextPc = (pc + insn.offset) & M64;
        break;
      case 'bcond':
        if (condHolds(s, insn.cond)) nextPc = (pc + insn.offset) & M64;
        break;
      case 'cbz': {
        const zero = s.getX(insn.rt, insn.sf) === 0n;
        if (zero !== insn.nonzero) nextPc = (pc + insn.offset) & M64;
        break;
      }
      case 'tbz': {
        const set = ((s.getX(insn.rt, true) >> BigInt(insn.bit)) & 1n) === 1n;
        if (set === insn.nonzero) nextPc = (pc + insn.offset) & M64;
        break;
      }
      case 'br': {
        const target = s.getX(insn.rn, true);
        if (insn.op === 'blr') s.setX(30, nextPc, true);
        nextPc = target;
        break;
      }

      case 'ldst': {
        const base = s.getXorSp(insn.rn, true);
        let addr: bigint;
        if (insn.mode === 'reg') {
          addr = (base + extendReg(s.getX(insn.rm, true), insn.extend, insn.shift, true)) & M64;
        } else if (insn.mode === 'post') {
          addr = base;
        } else {
          addr = (base + insn.imm) & M64; // uoff, pre, unscaled
        }
        const isLoad = insn.op.startsWith('ldr');
        if (isLoad) {
          let v = this.load(addr, insn.size);
          if (insn.op === 'ldrsb') v = asUnsigned(BigInt.asIntN(8, v), insn.sf);
          else if (insn.op === 'ldrsh') v = asUnsigned(BigInt.asIntN(16, v), insn.sf);
          else if (insn.op === 'ldrsw') v = asUnsigned(BigInt.asIntN(32, v), true);
          s.setX(insn.rt, v, insn.sf);
        } else {
          this.store(addr, insn.size, s.getX(insn.rt, true));
        }
        if (insn.mode === 'pre') s.setXorSp(insn.rn, addr, true);
        else if (insn.mode === 'post') s.setXorSp(insn.rn, (base + insn.imm) & M64, true);
        break;
      }
      case 'ldrLit': {
        const addr = (pc + insn.offset) & M64;
        if (insn.op === 'ldrsw') s.setX(insn.rt, asUnsigned(BigInt.asIntN(32, this.load(addr, 4)), true), true);
        else s.setX(insn.rt, this.load(addr, insn.sf ? 8 : 4), insn.sf);
        break;
      }
      case 'ldstPair': {
        const base = s.getXorSp(insn.rn, true);
        const addr = insn.mode === 'post' ? base : (base + insn.imm) & M64;
        const size = insn.signed ? 4 : insn.sf ? 8 : 4;
        if (insn.load) {
          let v1 = this.load(addr, size);
          let v2 = this.load((addr + BigInt(size)) & M64, size);
          if (insn.signed) { v1 = asUnsigned(BigInt.asIntN(32, v1), true); v2 = asUnsigned(BigInt.asIntN(32, v2), true); }
          s.setX(insn.rt, v1, insn.sf);
          s.setX(insn.rt2, v2, insn.sf);
        } else {
          this.store(addr, size, s.getX(insn.rt, true));
          this.store((addr + BigInt(size)) & M64, size, s.getX(insn.rt2, true));
        }
        if (insn.mode === 'pre') s.setXorSp(insn.rn, addr, true);
        else if (insn.mode === 'post') s.setXorSp(insn.rn, (base + insn.imm) & M64, true);
        break;
      }
      case 'exclusive': {
        // Single-threaded model: exclusives always succeed and acquire/release are no-ops.
        const addr = s.getXorSp(insn.rn, true);
        const sf = insn.size === 8;
        switch (insn.op) {
          case 'ldxr': case 'ldaxr': case 'ldar':
            s.setX(insn.rt, this.load(addr, insn.size), sf);
            break;
          case 'stxr': case 'stlxr':
            this.store(addr, insn.size, s.getX(insn.rt, true));
            s.setX(insn.rs, 0n, false);
            break;
          case 'stlr':
            this.store(addr, insn.size, s.getX(insn.rt, true));
            break;
        }
        break;
      }

      case 'mrs': {
        let v: bigint;
        switch (insn.reg) {
          case 'nzcv': v = BigInt(s.nzcv()) << 28n; break;
          case 'tpidr_el0': v = s.tpidr_el0; break;
          case 'tpidrro_el0': v = s.tpidrro_el0; break;
          case 'cntvct_el0': v = BigInt(s.instCount); break;
          case 'cntfrq_el0': v = 24_000_000n; break;
          case 'midr_el1': v = 0x6100_0fd0n; break; // implementer 0x61 (Apple)
          case 'ctr_el0': v = 0x8444_c004n; break; // 64-byte I/D lines, like Apple silicon
          case 'dczid_el0': v = 0x4n; break;
          case 'fpcr': case 'fpsr': v = 0n; break;
          default: throw new UnsupportedSystemRegister(pc, insn.encoding, false);
        }
        s.setX(insn.rt, v, true);
        break;
      }
      case 'msr': {
        const v = s.getX(insn.rt, true);
        switch (insn.reg) {
          case 'nzcv': s.n = ((v >> 31n) & 1n) === 1n; s.z = ((v >> 30n) & 1n) === 1n; s.c = ((v >> 29n) & 1n) === 1n; s.v = ((v >> 28n) & 1n) === 1n; break;
          case 'tpidr_el0': s.tpidr_el0 = v; break;
          case 'fpcr': case 'fpsr': break;
          default: throw new UnsupportedSystemRegister(pc, insn.encoding, true);
        }
        break;
      }
    }

    s.pc = nextPc;
    s.instCount++;
    return trap;
  }

  private arith(op: 'add' | 'adds' | 'sub' | 'subs', sf: boolean, rd: number, a: bigint, b: bigint, spAllowed: boolean): void {
    const s = this.state;
    const sub = op === 'sub' || op === 'subs';
    const setFlags = op === 'adds' || op === 'subs';
    const mask = sf ? M64 : M32;
    const operand = sub ? ~b & mask : b;
    const [r, n, z, c, v] = addWithCarry(a, operand, sub, sf);
    if (setFlags) { s.n = n; s.z = z; s.c = c; s.v = v; s.setX(rd, r, sf); }
    else if (spAllowed) s.setXorSp(rd, r, sf);
    else s.setX(rd, r, sf);
  }

  private setNZ(r: bigint, sf: boolean): void {
    const v = r & (sf ? M64 : M32);
    this.state.n = (v & (sf ? SIGN64 : SIGN32)) !== 0n;
    this.state.z = v === 0n;
  }

  private load(addr: bigint, size: number): bigint {
    switch (size) {
      case 1: return BigInt(this.mem.read8(addr));
      case 2: return BigInt(this.mem.read16(addr));
      case 4: return BigInt(this.mem.read32(addr));
      default: return this.mem.read64(addr);
    }
  }

  private store(addr: bigint, size: number, v: bigint): void {
    switch (size) {
      case 1: this.mem.write8(addr, Number(v & 0xffn)); break;
      case 2: this.mem.write16(addr, Number(v & 0xffffn)); break;
      case 4: this.mem.write32(addr, Number(v & M32)); break;
      default: this.mem.write64(addr, v & M64);
    }
  }
}

/**
 * Bitfield masks per the Arm ARM `DecodeBitMasks` as used by SBFM/BFM/UBFM
 * (the immediate=false form, where imms may be all ones).
 */
export function bfmMask(bits: number, immr: number, imms: number): { wmask: bigint; tmask: bigint } {
  const mask = bits === 64 ? M64 : M32;
  const len = bits === 64 ? 6 : 5;
  const levels = (1 << len) - 1;
  const s = imms & levels;
  const r = immr & levels;
  const diff = (s - r) & levels;
  const welem = (1n << BigInt(s + 1)) - 1n;
  const telem = (1n << BigInt(diff + 1)) - 1n;
  const wmask = ((welem >> BigInt(r)) | (welem << BigInt(bits - r))) & mask;
  return { wmask, tmask: telem & mask };
}

import { Memory } from '../mem/memory';
import { CpuState, Trap } from './state';
import { decode, Insn } from './decoder';

const M32 = 0xffff_ffffn;
const M64 = 0xffff_ffff_ffff_ffffn;

export class UnsupportedInstruction extends Error {
  constructor(readonly pc: bigint, readonly word: number) {
    super(`unsupported instruction 0x${word.toString(16).padStart(8, '0')} at 0x${pc.toString(16)}`);
    this.name = 'UnsupportedInstruction';
  }
}

function mask(sf: boolean): bigint { return sf ? M64 : M32; }
function signed(v: bigint, sf: boolean): bigint {
  const bits = sf ? 64n : 32n;
  const m = mask(sf);
  v &= m;
  return (v & (1n << (bits - 1n))) ? v - (1n << bits) : v;
}
function addWithCarry(a: bigint, b: bigint, carry: boolean, sf: boolean): [bigint, boolean, boolean] {
  const m = mask(sf);
  const bits = sf ? 64n : 32n;
  const full = (a & m) + (b & m) + (carry ? 1n : 0n);
  const result = full & m;
  const c = full > m;
  const v = ((~(a ^ b) & (a ^ result)) & (1n << (bits - 1n))) !== 0n;
  return [result, c, v];
}
function condHolds(state: CpuState, cond: number): boolean {
  switch (cond & 0xf) {
    case 0: return state.z;
    case 1: return !state.z;
    case 2: return state.c;
    case 3: return !state.c;
    case 4: return state.n;
    case 5: return !state.n;
    case 6: return state.v;
    case 7: return !state.v;
    case 8: return state.c && !state.z;
    case 9: return !state.c || state.z;
    case 10: return state.n === state.v;
    case 11: return state.n !== state.v;
    case 12: return !state.z && state.n === state.v;
    case 13: return state.z || state.n !== state.v;
    case 14: return true;
    default: return false;
  }
}
function rotate(v: bigint, shift: number, bits: number): bigint {
  const m = (1n << BigInt(bits)) - 1n;
  const amount = BigInt(shift % bits);
  return ((v >> amount) | (v << BigInt(bits) - amount)) & m;
}

export class Cpu {
  private readonly cache = new Map<number, Insn>();
  constructor(readonly state: CpuState, readonly mem: Memory) {}

  step(): Trap | null {
    const pc = this.state.pc;
    const word = this.mem.read32(pc);
    const insn = this.cache.get(word) ?? decode(word);
    this.cache.set(word, insn);
    const next = pc + 4n;
    let trap: Trap | null = null;
    const read = (n: number, sf = true) => n === 31 ? this.state.getSp(sf) : this.state.getX(n, sf);
    const write = (n: number, value: bigint, sf = true) => n === 31 ? this.state.setSp(value, sf) : this.state.setX(n, value, sf);
    const setFlags = (value: bigint, sf: boolean) => {
      const v = value & mask(sf);
      this.state.n = (v & (sf ? 1n << 63n : 1n << 31n)) !== 0n;
      this.state.z = v === 0n;
    };
    switch (insn.kind) {
      case 'nop': case 'hint': break;
      case 'svc': case 'brk': case 'hlt': trap = { kind: insn.kind, imm: insn.imm }; break;
      case 'unknown': throw new UnsupportedInstruction(pc, insn.word);
      case 'imm': {
        const a = read(insn.rn, insn.sf);
        const b = BigInt(insn.imm);
        const sub = insn.op.startsWith('sub');
        const [result, c, v] = addWithCarry(a, sub ? ~b : b, sub, insn.sf);
        write(insn.rd, result, insn.sf);
        if (insn.op.endsWith('s')) { setFlags(result, insn.sf); this.state.c = c; this.state.v = v; }
        break;
      }
      case 'logicalImm': {
        const a = read(insn.rn, insn.sf);
        let result = insn.op === 'and' || insn.op === 'ands' ? a & insn.mask : insn.op === 'orr' ? a | insn.mask : a ^ insn.mask;
        result &= mask(insn.sf); write(insn.rd, result, insn.sf);
        if (insn.op === 'ands') { setFlags(result, insn.sf); this.state.c = false; this.state.v = false; }
        break;
      }
      case 'wide': {
        const shift = BigInt(insn.shift);
        const value = BigInt(insn.imm) << shift;
        let result = insn.op === 'movz' ? value : insn.op === 'movn' ? ~value : (read(insn.rd, insn.sf) & ~(0xffffn << shift)) | value;
        if (insn.op === 'movn') result = ~value;
        write(insn.rd, result, insn.sf);
        break;
      }
      case 'adr': {
        const base = insn.page ? pc & ~0xfffn : pc;
        write(insn.rd, base + BigInt(insn.imm) * (insn.page ? 4096n : 1n), true);
        break;
      }
      case 'bitfield': {
        const bits = insn.sf ? 64 : 32;
        const m = mask(insn.sf);
        const source = read(insn.rn, insn.sf);
        const width = ((insn.imms - insn.immr) & (bits - 1)) + 1;
        const field = rotate(source, insn.immr, bits) & ((1n << BigInt(width)) - 1n);
        let result: bigint;
        if (insn.op === 'ubfm') result = field;
        else if (insn.op === 'sbfm') result = signed(field, insn.sf);
        else {
          const fmask = (((1n << BigInt(width)) - 1n) << BigInt(insn.immr)) & m;
          result = (read(insn.rd, insn.sf) & ~fmask) | ((source << BigInt(insn.immr)) & fmask);
        }
        write(insn.rd, result, insn.sf); break;
      }
      case 'extr': {
        const bits = insn.sf ? 64n : 32n;
        const combined = (read(insn.rm, insn.sf) << bits) | read(insn.rn, insn.sf);
        write(insn.rd, combined >> BigInt(insn.lsb), insn.sf); break;
      }
      case 'reg': {
        let b = read(insn.rm, insn.sf);
        if (insn.extend !== undefined) {
          const option = insn.extend;
          const extBits = option === 0 || option === 4 ? 8 : option === 1 || option === 5 ? 16 : option === 2 || option === 6 ? 32 : 64;
          b &= (1n << BigInt(extBits)) - 1n;
          if (option >= 4) b = signed(b, extBits === 64);
          b = (b << BigInt(insn.amount ?? 0)) & mask(insn.sf);
        } else if (insn.shift) b = insn.shift === 'lsl' ? (b << BigInt(insn.amount ?? 0)) : insn.shift === 'lsr' ? b >> BigInt(insn.amount ?? 0) : insn.shift === 'asr' ? signed(b, insn.sf) >> BigInt(insn.amount ?? 0) : rotate(b, insn.amount ?? 0, insn.sf ? 64 : 32);
        const a = read(insn.rn, insn.sf);
        if (insn.op === 'add' || insn.op === 'adds' || insn.op === 'sub' || insn.op === 'subs') {
          const sub = insn.op.startsWith('sub');
          const [result, c, v] = addWithCarry(a, sub ? ~b : b, sub, insn.sf);
          write(insn.rd, result, insn.sf);
          if (insn.op.endsWith('s')) { setFlags(result, insn.sf); this.state.c = c; this.state.v = v; }
        } else if (insn.op === 'and' || insn.op === 'ands') {
          const result = a & b; write(insn.rd, result, insn.sf); if (insn.op === 'ands') { setFlags(result, insn.sf); this.state.c = false; this.state.v = false; }
        } else if (insn.op === 'orr') write(insn.rd, a | b, insn.sf);
        else if (insn.op === 'eor') write(insn.rd, a ^ b, insn.sf);
        else if (insn.op === 'madd' || insn.op === 'msub') write(insn.rd, ((a * b) + (insn.op === 'madd' ? read(insn.ra ?? 31, insn.sf) : -read(insn.ra ?? 31, insn.sf))) & mask(insn.sf), insn.sf);
        else if (insn.op === 'udiv') write(insn.rd, b === 0n ? 0n : a / b, insn.sf);
        else if (insn.op === 'sdiv') { const sb = signed(b, insn.sf); const sa = signed(a, insn.sf); write(insn.rd, sb === 0n ? 0n : sa === -(1n << BigInt(insn.sf ? 63 : 31)) && sb === -1n ? sa : sa / sb, insn.sf); }
        break;
      }
      case 'branch': if (insn.op === 'bl') this.state.setX(30, next); this.state.pc = pc + BigInt(insn.imm); this.state.instCount++; return trap;
      case 'bcond': if (condHolds(this.state, insn.cond)) this.state.pc = pc + BigInt(insn.imm); else this.state.pc = next; this.state.instCount++; return trap;
      case 'cbz': if ((read(insn.rt, insn.sf) === 0n) !== insn.nonzero) this.state.pc = pc + BigInt(insn.imm); else this.state.pc = next; this.state.instCount++; return trap;
      case 'tbz': if ((((read(insn.rt, false) >> BigInt(insn.bit)) & 1n) === 0n) !== insn.nonzero) this.state.pc = pc + BigInt(insn.imm); else this.state.pc = next; this.state.instCount++; return trap;
      case 'branchReg': this.state.pc = read(insn.rn); if (insn.op === 'blr') this.state.setX(30, next); this.state.instCount++; return trap;
      case 'loadstore': {
        const addr = read(insn.rn) + BigInt(insn.offset);
        const value = insn.size === 1 ? this.mem.read8(addr) : insn.size === 2 ? this.mem.read16(addr) : insn.size === 4 ? this.mem.read32(addr) : this.mem.read64(addr);
        if (insn.op.startsWith('ldr')) write(insn.rt, BigInt(value), insn.sf);
        else {
          const v = read(insn.rt);
          if (insn.size === 1) this.mem.write8(addr, Number(v)); else if (insn.size === 2) this.mem.write16(addr, Number(v)); else if (insn.size === 4) this.mem.write32(addr, Number(v)); else this.mem.write64(addr, v);
        }
        break;
      }
      case 'pair': {
        let addr = read(insn.rn);
        if (insn.pre) addr += BigInt(insn.offset);
        const size = insn.sf ? 8 : 4;
        if (insn.op === 'ldp') { write(insn.rt, size === 8 ? this.mem.read64(addr) : BigInt(this.mem.read32(addr)), insn.sf); write(insn.rt2, size === 8 ? this.mem.read64(addr + BigInt(size)) : BigInt(this.mem.read32(addr + BigInt(size))), insn.sf); }
        else { const a = read(insn.rt, insn.sf); const b = read(insn.rt2, insn.sf); if (size === 8) { this.mem.write64(addr, a); this.mem.write64(addr + 8n, b); } else { this.mem.write32(addr, Number(a)); this.mem.write32(addr + 4n, Number(b)); } }
        if (insn.pre || insn.post) this.state.setSp(addr + (insn.post ? BigInt(insn.offset) : 0n));
        break;
      }
      case 'system':
        if (insn.op === 'mrs') {
          const value = insn.imm === 0x0000 ? this.state.tpidrro_el0 : insn.imm === 0x0001 ? this.state.tpidrro_el0 : insn.imm === 0x0040 ? BigInt(this.state.nzcv() << 28) : BigInt(this.state.instCount);
          this.state.setX(insn.rt ?? 0, value);
        } else this.state.tpidrro_el0 = this.state.getX(insn.rn ?? 0);
        break;
    }
    this.state.pc = next;
    this.state.instCount++;
    return trap;
  }
}

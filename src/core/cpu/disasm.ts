import { Insn } from './decoder';

const COND = ['eq', 'ne', 'cs', 'cc', 'mi', 'pl', 'vs', 'vc', 'hi', 'ls', 'ge', 'lt', 'gt', 'le', 'al', 'nv'];

function r(n: number, sf: boolean): string {
  if (n === 31) return sf ? 'xzr' : 'wzr';
  return `${sf ? 'x' : 'w'}${n}`;
}
function rsp(n: number, sf: boolean): string {
  return n === 31 ? (sf ? 'sp' : 'wsp') : r(n, sf);
}
const hex = (v: bigint | number): string => {
  const b = BigInt(v);
  return b < 0n ? `-0x${(-b).toString(16)}` : `0x${b.toString(16)}`;
};
const target = (pc: bigint, off: bigint): string => hex((pc + off) & 0xffff_ffff_ffff_ffffn);

/** Best-effort textual form of a decoded instruction (for the UI, not a full disassembler). */
export function disasm(insn: Insn, pc = 0n): string {
  switch (insn.kind) {
    case 'unknown': return `.word ${hex(insn.word)}`;
    case 'nop': return 'nop';
    case 'msrImm': return 'msr (imm)';
    case 'svc': case 'brk': case 'hlt': return `${insn.kind} #${hex(insn.imm)}`;
    case 'adr': return `${insn.page ? 'adrp' : 'adr'} ${r(insn.rd, true)}, ${target(insn.page ? pc & ~0xfffn : pc, insn.imm)}`;
    case 'arithImm': return `${insn.op} ${rsp(insn.rd, insn.sf)}, ${rsp(insn.rn, insn.sf)}, #${hex(insn.imm)}`;
    case 'logicImm': return `${insn.op} ${insn.op === 'ands' ? r(insn.rd, insn.sf) : rsp(insn.rd, insn.sf)}, ${r(insn.rn, insn.sf)}, #${hex(insn.imm)}`;
    case 'moveWide': return `${insn.op} ${r(insn.rd, insn.sf)}, #${hex(insn.imm16)}${insn.shift ? `, lsl #${insn.shift}` : ''}`;
    case 'bitfield': return `${insn.op} ${r(insn.rd, insn.sf)}, ${r(insn.rn, insn.sf)}, #${insn.immr}, #${insn.imms}`;
    case 'extr': return `extr ${r(insn.rd, insn.sf)}, ${r(insn.rn, insn.sf)}, ${r(insn.rm, insn.sf)}, #${insn.lsb}`;
    case 'arithShifted':
    case 'logicShifted': {
      const sh = insn.amount ? `, ${insn.shift} #${insn.amount}` : '';
      return `${insn.op} ${r(insn.rd, insn.sf)}, ${r(insn.rn, insn.sf)}, ${r(insn.rm, insn.sf)}${sh}`;
    }
    case 'arithExtended': {
      const ext = insn.amount ? `, ${insn.extend} #${insn.amount}` : `, ${insn.extend}`;
      return `${insn.op} ${rsp(insn.rd, insn.sf)}, ${rsp(insn.rn, insn.sf)}, ${r(insn.rm, insn.extend.endsWith('x'))}${ext}`;
    }
    case 'carry':
    case 'shiftVar':
    case 'div': return `${insn.op} ${r(insn.rd, insn.sf)}, ${r(insn.rn, insn.sf)}, ${r(insn.rm, insn.sf)}`;
    case 'mul': return `${insn.op} ${r(insn.rd, insn.sf)}, ${r(insn.rn, insn.sf)}, ${r(insn.rm, insn.sf)}, ${r(insn.ra, insn.sf)}`;
    case 'unary': return `${insn.op} ${r(insn.rd, insn.sf)}, ${r(insn.rn, insn.sf)}`;
    case 'condSel': return `${insn.op} ${r(insn.rd, insn.sf)}, ${r(insn.rn, insn.sf)}, ${r(insn.rm, insn.sf)}, ${COND[insn.cond]}`;
    case 'condCmp': return `${insn.negate ? 'ccmn' : 'ccmp'} ${r(insn.rn, insn.sf)}, ${insn.imm !== null ? `#${insn.imm}` : r(insn.rm, insn.sf)}, #${insn.nzcv}, ${COND[insn.cond]}`;
    case 'b': return `${insn.link ? 'bl' : 'b'} ${target(pc, insn.offset)}`;
    case 'bcond': return `b.${COND[insn.cond]} ${target(pc, insn.offset)}`;
    case 'cbz': return `${insn.nonzero ? 'cbnz' : 'cbz'} ${r(insn.rt, insn.sf)}, ${target(pc, insn.offset)}`;
    case 'tbz': return `${insn.nonzero ? 'tbnz' : 'tbz'} ${r(insn.rt, insn.bit >= 32)}, #${insn.bit}, ${target(pc, insn.offset)}`;
    case 'br': return insn.op === 'ret' && insn.rn === 30 ? 'ret' : `${insn.op} ${r(insn.rn, true)}`;
    case 'ldst': {
      const rt = r(insn.rt, insn.sf);
      const rn = rsp(insn.rn, true);
      switch (insn.mode) {
        case 'reg': return `${insn.op} ${rt}, [${rn}, ${r(insn.rm, insn.extend.endsWith('x'))}${insn.shift ? `, ${insn.extend} #${insn.shift}` : ''}]`;
        case 'pre': return `${insn.op} ${rt}, [${rn}, #${insn.imm}]!`;
        case 'post': return `${insn.op} ${rt}, [${rn}], #${insn.imm}`;
        default: return `${insn.op} ${rt}, [${rn}${insn.imm ? `, #${insn.imm}` : ''}]`;
      }
    }
    case 'ldrLit': return `${insn.op} ${r(insn.rt, insn.sf)}, ${target(pc, insn.offset)}`;
    case 'ldstPair': {
      const op = insn.signed ? 'ldpsw' : insn.load ? 'ldp' : 'stp';
      const regs = `${r(insn.rt, insn.sf)}, ${r(insn.rt2, insn.sf)}`;
      const rn = rsp(insn.rn, true);
      switch (insn.mode) {
        case 'pre': return `${op} ${regs}, [${rn}, #${insn.imm}]!`;
        case 'post': return `${op} ${regs}, [${rn}], #${insn.imm}`;
        default: return `${op} ${regs}, [${rn}${insn.imm ? `, #${insn.imm}` : ''}]`;
      }
    }
    case 'exclusive': {
      const sf = insn.size === 8;
      const rt = r(insn.rt, sf);
      const rn = rsp(insn.rn, true);
      return insn.op.startsWith('st') && insn.op !== 'stlr' ? `${insn.op} ${r(insn.rs, false)}, ${rt}, [${rn}]` : `${insn.op} ${rt}, [${rn}]`;
    }
    case 'mrs': return `mrs ${r(insn.rt, true)}, ${insn.reg ?? `S${hex(insn.encoding)}`}`;
    case 'msr': return `msr ${insn.reg ?? `S${hex(insn.encoding)}`}, ${r(insn.rt, true)}`;
  }
}

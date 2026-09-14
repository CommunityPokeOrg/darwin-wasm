import { Insn } from './decoder';
export function disasm(insn: Insn, pc = 0n): string {
  switch (insn.kind) {
    case 'unknown': return `.word 0x${insn.word.toString(16).padStart(8, '0')}`;
    case 'nop': case 'hint': return insn.op;
    case 'svc': case 'brk': case 'hlt': return `${insn.kind} #${insn.imm}`;
    case 'branch': return `${insn.op} 0x${(pc + BigInt(insn.imm)).toString(16)}`;
    case 'bcond': return `b.${insn.cond.toString(16)} 0x${(pc + BigInt(insn.imm)).toString(16)}`;
    case 'branchReg': return `${insn.op} x${insn.rn}`;
    case 'imm': return `${insn.op} ${insn.sf ? 'x' : 'w'}${insn.rd}, ${insn.sf ? 'x' : 'w'}${insn.rn}, #${insn.imm}`;
    case 'wide': return `${insn.op} ${insn.sf ? 'x' : 'w'}${insn.rd}, #${insn.imm}`;
    case 'logicalImm': return `${insn.op} ${insn.sf ? 'x' : 'w'}${insn.rd}, ${insn.sf ? 'x' : 'w'}${insn.rn}, #0x${insn.mask.toString(16)}`;
    case 'reg': return `${insn.op} ${insn.sf ? 'x' : 'w'}${insn.rd}, ${insn.sf ? 'x' : 'w'}${insn.rn}, ${insn.sf ? 'x' : 'w'}${insn.rm}`;
    case 'loadstore': return `${insn.op} ${insn.sf ? 'x' : 'w'}${insn.rt}, [x${insn.rn}, #${insn.offset}]`;
    case 'pair': return `${insn.op} ${insn.sf ? 'x' : 'w'}${insn.rt}, ${insn.sf ? 'x' : 'w'}${insn.rt2}, [x${insn.rn}, #${insn.offset}]`;
    default: return insn.kind;
  }
}

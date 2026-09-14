import { decode } from '../../core/cpu/decoder';
import { disasm } from '../../core/cpu/disasm';
import type { Machine } from '../../core/machine';
import { Panel } from './Panel';
import { hex } from './format';
export function DisassemblyPanel({ machine }: { machine: Machine }) {
  const pc = machine.state.pc; const rows = Array.from({ length: 8 }, (_, i) => { const addr = pc - 16n + BigInt(i * 4); try { return { addr, text: disasm(decode(machine.mem.read32(addr)), addr) }; } catch { return { addr, text: '<unmapped>' }; } });
  return <Panel title="Disassembly at PC"><pre className="disassembly">{rows.map((row) => <div className={row.addr === pc ? 'current' : ''} key={row.addr.toString()}>{hex(row.addr, 16)}  {row.text}</div>)}</pre></Panel>;
}

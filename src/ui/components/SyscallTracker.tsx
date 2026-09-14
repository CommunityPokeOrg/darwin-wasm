import type { SyscallEvent } from '../../core/darwin';
import { Panel } from './Panel';
import { hex } from './format';
export function SyscallTracker({ events }: { events: SyscallEvent[] }) {
  return <Panel title="Syscall tracker"><div className="table-scroll"><table><thead><tr><th>#</th><th>class</th><th>name</th><th>args</th><th>ret</th></tr></thead><tbody>{events.slice().reverse().map((event, i) => <tr className={event.unsupported ? 'unsupported-row' : ''} key={`${event.instCount}-${i}`}><td>{event.n}</td><td><span className={`class-chip ${event.cls}`}>{event.cls}</span></td><td>{event.name}</td><td>{event.args.slice(0, 4).map((arg) => hex(arg, 4)).join(' ')}</td><td>{event.errno ? `errno ${event.errno}` : hex(event.ret)}</td></tr>)}</tbody></table></div></Panel>;
}

import { Panel } from './Panel';
import type { Machine } from '../../core/machine';
export function CountersPanel({ machine }: { machine: Machine }) {
  const unsupported = machine.syscallLog.filter((event) => event.unsupported).length;
  return <Panel title="Counters"><dl className="facts"><dt>instructions</dt><dd>{machine.state.instCount.toLocaleString()}</dd><dt>syscalls</dt><dd>{machine.syscallLog.length}</dd><dt>unsupported</dt><dd className={unsupported ? 'warning' : ''}>{unsupported}</dd></dl></Panel>;
}

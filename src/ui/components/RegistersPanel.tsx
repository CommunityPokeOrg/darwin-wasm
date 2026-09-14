import { useEffect, useRef } from 'react';
import { Panel } from './Panel';
import { hex } from './format';
import type { CpuState } from '../../core/cpu/state';
export function RegistersPanel({ state }: { state: CpuState }) {
  const previous = useRef<bigint[]>([]);
  const values = Array.from({ length: 31 }, (_, i) => state.getX(i));
  const changed = (index: number) => previous.current[index] !== undefined && previous.current[index] !== values[index];
  useEffect(() => { previous.current = [...values, state.getSp(), state.pc, state.tpidrro_el0]; }, [values, state]);
  return <Panel title="Registers"><div className="register-grid">{values.map((value, i) => <div className={changed(i) ? 'changed' : ''} key={i}><span>x{i}</span><b>{hex(value, 16)}</b></div>)}<div className={changed(31) ? 'changed' : ''}><span>sp</span><b>{hex(state.getSp(), 16)}</b></div><div className={changed(32) ? 'changed' : ''}><span>pc</span><b>{hex(state.pc, 16)}</b></div><div className={changed(33) ? 'changed' : ''}><span>tpidrro</span><b>{hex(state.tpidrro_el0, 16)}</b></div></div><div className="flags">{[['N', state.n], ['Z', state.z], ['C', state.c], ['V', state.v]].map(([name, on]) => <span className={on ? 'lit' : ''} key={String(name)}>{name}</span>)}</div></Panel>;
}

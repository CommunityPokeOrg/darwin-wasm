import type { DyldReport } from '../../core/dyld/dyld';
import type { MachOImage } from '../../core/macho/loader';
import { Panel } from './Panel';
import { hex } from './format';
export function BinaryInfo({ image, report }: { image?: MachOImage; report?: DyldReport }) {
  if (!image) return <Panel title="Binary info"><p className="muted">No Mach-O loaded.</p></Panel>;
  return <Panel title="Binary info"><dl className="facts"><dt>entry</dt><dd>{hex(image.entry, 16)}</dd><dt>min OS</dt><dd>{image.minOs ?? 'unknown'}</dd><dt>PIE</dt><dd>{image.isPie ? 'yes' : 'no'}</dd></dl><table><thead><tr><th>segment</th><th>vmaddr</th><th>size</th><th>prot</th></tr></thead><tbody>{image.segments.map((s) => <tr key={s.name}><td>{s.name}</td><td>{hex(s.vmaddr)}</td><td>{hex(s.vmsize)}</td><td>{s.initprot & 4 ? 'x' : '-'}{s.initprot & 2 ? 'w' : '-'}{s.initprot & 1 ? 'r' : '-'}</td></tr>)}</tbody></table><div className="subsection"><b>dylibs</b>{report?.dylibs.map((d) => <div key={d.path} className={d.status === 'ignored' ? 'muted' : 'ok'}>{d.status} · {d.path}</div>)}</div><div className="subsection"><b>bindings</b>{report?.bound.map((b) => <div key={`${b.symbol}-${b.addr}`}>{b.symbol} → {hex(b.target)} <span className={b.via === 'null' ? 'warning' : 'ok'}>{b.via}</span></div>)}{report?.unresolved.map((s) => <div className="warning" key={s}>unresolved · {s}</div>)}</div></Panel>;
}

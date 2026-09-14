import { useEffect, useRef } from 'react';
import { Panel } from './Panel';
import type { TerminalLine } from '../useMachine';
export function TerminalPanel({ lines, onClear }: { lines: TerminalLine[]; onClear: () => void }) {
  const end = useRef<HTMLDivElement>(null); useEffect(() => end.current?.scrollIntoView({ block: 'nearest' }), [lines]);
  return <Panel title="Terminal"><div className="terminal">{lines.map((line, i) => <div className={`term-${line.kind}`} key={`${i}-${line.text}`}>{line.text}</div>)}<div ref={end} /></div><button onClick={onClear}>Clear</button></Panel>;
}

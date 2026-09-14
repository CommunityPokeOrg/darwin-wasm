import { useRef, useState } from 'react';
import { Panel } from './Panel';
export function Dropzone({ onLoad }: { onLoad: (bytes: Uint8Array) => void }) {
  const [dragging, setDragging] = useState(false); const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const read = (file: File | undefined) => { if (!file) return; file.arrayBuffer().then((data) => { setError(undefined); onLoad(new Uint8Array(data)); }).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e))); };
  return <Panel title="Mach-O input"><div className={`dropzone ${dragging ? 'dragging' : ''}`} onClick={() => input.current?.click()} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); read(event.dataTransfer.files[0]); }}>Drop an arm64 Mach-O here or choose a file<input ref={input} type="file" hidden onChange={(event) => read(event.target.files?.[0])} /></div>{error && <p className="error">{error}</p>}</Panel>;
}

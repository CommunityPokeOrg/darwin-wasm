import { useEffect, useState } from 'react';
import { Panel } from './Panel';
export interface Sample { name: string; description: string; file: string; }
export function SamplePicker({ onLoad }: { onLoad: (sample: Sample) => void }) {
  const [samples, setSamples] = useState<Sample[]>([]);
  useEffect(() => { fetch(`${import.meta.env.BASE_URL}samples/index.json`).then((r) => r.json() as Promise<Sample[]>).then(setSamples).catch(() => setSamples([])); }, []);
  return <Panel title="Samples"><div className="sample-list">{samples.map((sample) => <button className="sample" key={sample.file} onClick={() => onLoad(sample)}><strong>{sample.name}</strong><small>{sample.description}</small></button>)}</div></Panel>;
}

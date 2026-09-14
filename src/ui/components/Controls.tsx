import { Panel } from './Panel';
export function Controls({ status, speed, onSpeed, onRun, onPause, onStep, onReset }: { status: string; speed: number; onSpeed: (n: number) => void; onRun: () => void; onPause: () => void; onStep: () => void; onReset: () => void }) {
  return <Panel title="Controls"><div className="controls"><button onClick={onRun} disabled={status === 'running'}>Run</button><button onClick={onPause} disabled={status !== 'running'}>Pause</button><button onClick={onStep}>Step</button><button onClick={onReset}>Reset</button><label>speed <select value={speed} onChange={(e) => onSpeed(Number(e.target.value))}><option value={10000}>10k / frame</option><option value={100000}>100k / frame</option><option value={1000000}>1M / frame</option></select></label></div></Panel>;
}

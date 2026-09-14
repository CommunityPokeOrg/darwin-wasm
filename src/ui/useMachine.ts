import { useCallback, useEffect, useRef, useState } from 'react';
import { Machine, type RunResult } from '../core/machine';
import type { SyscallEvent } from '../core/darwin';

export type UiStatus = 'idle' | 'loaded' | 'running' | 'yield' | 'exited' | 'faulted';
export interface TerminalLine { kind: 'stdout' | 'stderr' | 'log' | 'fault'; text: string; }
export interface MachineView {
  status: UiStatus;
  exitCode?: number;
  error?: string;
  terminal: TerminalLine[];
  syscalls: SyscallEvent[];
  presented?: Uint8ClampedArray;
  presentWidth: number;
  presentHeight: number;
  refresh: number;
}
export interface MachineController extends MachineView {
  machine: Machine;
  speed: number;
  setSpeed: (speed: number) => void;
  load: (bytes: Uint8Array) => void;
  loadUrl: (url: string) => Promise<void>;
  run: () => void;
  pause: () => void;
  step: () => void;
  reset: () => void;
  clearTerminal: () => void;
  pushInput: (event: { type: number; x: number; y: number; button: number }) => void;
}

const maxLines = 2000;
const statusFor = (result: RunResult): UiStatus => result.status === 'exited' ? 'exited' : result.status === 'faulted' ? 'faulted' : result.status;

export function useMachine(): MachineController {
  const machineRef = useRef<Machine>();
  if (!machineRef.current) machineRef.current = new Machine();
  const machine = machineRef.current;
  const [view, setView] = useState<MachineView>({ status: 'idle', terminal: [], syscalls: [], presentWidth: 320, presentHeight: 240, refresh: 0 });
  const [speed, setSpeed] = useState(100_000);
  const frameRef = useRef<number>();
  const runningRef = useRef(false);
  const terminalRef = useRef<TerminalLine[]>([]);
  const syscallRef = useRef<SyscallEvent[]>([]);
  const flush = useCallback(() => {
    frameRef.current = undefined;
    setView((previous) => ({ ...previous, terminal: terminalRef.current.slice(-maxLines), syscalls: syscallRef.current.slice(-500), refresh: previous.refresh + 1 }));
  }, []);
  const scheduleFlush = useCallback(() => {
    if (frameRef.current === undefined) frameRef.current = requestAnimationFrame(flush);
  }, [flush]);
  const setResult = useCallback((result: RunResult) => {
    setView((previous) => ({ ...previous, status: statusFor(result), exitCode: result.exitCode, error: result.error?.message }));
  }, []);
  const tick = useCallback(() => {
    if (!runningRef.current) return;
    const result = machine.run(speed);
    setResult(result);
    scheduleFlush();
    if (result.status === 'running' || result.status === 'yield') requestAnimationFrame(tick);
    else runningRef.current = false;
  }, [machine, scheduleFlush, setResult, speed]);

  useEffect(() => {
    const offStdout = machine.on('stdout', (text) => { terminalRef.current.push({ kind: 'stdout', text }); scheduleFlush(); });
    const offStderr = machine.on('stderr', (text) => { terminalRef.current.push({ kind: 'stderr', text }); scheduleFlush(); });
    const offLog = machine.on('log', (text) => { terminalRef.current.push({ kind: 'log', text }); scheduleFlush(); });
    const offFault = machine.on('fault', (error) => { terminalRef.current.push({ kind: 'fault', text: error.message }); setResult({ status: 'faulted', error }); scheduleFlush(); });
    const offExit = machine.on('exit', (code) => setView((previous) => ({ ...previous, status: 'exited', exitCode: code })));
    const offPresent = machine.on('present', ({ imageData, w, h }) => setView((previous) => ({ ...previous, presented: imageData, presentWidth: w, presentHeight: h })));
    const offSyscall = machine.on('syscall', (event) => { syscallRef.current.push(event); if (syscallRef.current.length > 500) syscallRef.current.shift(); scheduleFlush(); });
    return () => { offStdout(); offStderr(); offLog(); offFault(); offExit(); offPresent(); offSyscall(); };
  }, [machine, scheduleFlush, setResult]);

  const load = useCallback((bytes: Uint8Array) => {
    runningRef.current = false;
    try {
      machine.load(bytes);
      terminalRef.current = []; syscallRef.current = [];
      setView({ status: 'loaded', terminal: [], syscalls: [], presentWidth: 320, presentHeight: 240, refresh: 0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      terminalRef.current = [{ kind: 'fault', text: message }];
      setView({ status: 'faulted', error: message, terminal: terminalRef.current, syscalls: [], presentWidth: 320, presentHeight: 240, refresh: 0 });
    }
  }, [machine]);
  const loadUrl = useCallback(async (url: string) => {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`failed to fetch ${url}: ${response.status}`);
      load(new Uint8Array(await response.arrayBuffer()));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      terminalRef.current = [{ kind: 'fault', text: message }];
      setView((previous) => ({ ...previous, status: 'faulted', error: message, terminal: terminalRef.current }));
    }
  }, [load]);
  const run = useCallback(() => {
    if (machine.state.pc === 0n && !machine.image) return;
    runningRef.current = true; setView((previous) => ({ ...previous, status: 'running', error: undefined })); requestAnimationFrame(tick);
  }, [machine, tick]);
  const pause = useCallback(() => { runningRef.current = false; setView((previous) => ({ ...previous, status: 'loaded' })); }, []);
  const step = useCallback(() => { runningRef.current = false; setResult(machine.step()); scheduleFlush(); }, [machine, scheduleFlush, setResult]);
  const reset = useCallback(() => { runningRef.current = false; machine.reset(); setView((previous) => ({ ...previous, status: machine.image ? 'loaded' : 'idle', exitCode: undefined, error: undefined })); }, [machine]);
  const clearTerminal = useCallback(() => { terminalRef.current = []; setView((previous) => ({ ...previous, terminal: [] })); }, []);
  return { ...view, machine, speed, setSpeed, load, loadUrl, run, pause, step, reset, clearTerminal, pushInput: machine.pushInput.bind(machine) };
}

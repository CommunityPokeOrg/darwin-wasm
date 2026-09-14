import { TypedEmitter } from './events';
import { Memory, MemoryFault } from './mem/memory';
import { Cpu, UnsupportedInstruction } from './cpu/interp';
import { CpuState } from './cpu/state';
import { parseMachO, loadMachO } from './macho/loader';
import { Darwin, SyscallEvent } from './darwin';
import { Framebuffer } from './devices/framebuffer';
import { InputQueue, InputEvent } from './devices/input';
import { MiniDyld, type DyldReport } from './dyld/dyld';
import type { MachOImage } from './macho/loader';

export interface Events {
  stdout: string;
  stderr: string;
  log: string;
  syscall: SyscallEvent;
  exit: number;
  fault: Error;
  present: { imageData: Uint8ClampedArray; w: number; h: number };
  dyld: DyldReport;
}
export type RunResult = { status: 'running' | 'exited' | 'faulted' | 'yield'; exitCode?: number; error?: Error };
export class Machine extends TypedEmitter<Events> {
  readonly mem = new Memory();
  readonly state = new CpuState();
  readonly cpu = new Cpu(this.state, this.mem);
  readonly input = new InputQueue();
  readonly framebuffer = new Framebuffer();
  readonly darwin = new Darwin(this);
  yieldRequested = false;
  private exited?: number;
  private loadedBytes?: Uint8Array;
  private readonly syscalls: SyscallEvent[] = [];
  private readonly out: string[] = [];
  dyld?: MiniDyld;
  dyldReport?: DyldReport;
  private imageValue?: MachOImage;
  get image(): MachOImage | undefined { return this.imageValue; }

  load(bytes: Uint8Array, opts: { argv?: string[]; envp?: string[] } = {}): void {
    this.reset();
    this.loadedBytes = bytes;
    const image = parseMachO(bytes);
    this.imageValue = image;
    loadMachO(this.mem, image);
    this.dyld = new MiniDyld(this);
    this.dyldReport = this.dyld.link(image);
    this.emit('dyld', this.dyldReport);
    this.framebuffer.map(this.mem);
    this.framebuffer.clear(this.mem);
    const tls = this.mem.allocAnon(0x1000n);
    this.state.tpidrro_el0 = tls;
    const stackTop = 0x16fe00000n;
    const stackBase = stackTop - 0x100000n;
    this.mem.map(stackBase, 0x100000n, 'rw');
    let sp = stackTop;
    const argv = opts.argv ?? ['sample'];
    const envp = opts.envp ?? [];
    const strings: bigint[] = [];
    const putString = (s: string) => { const bytes = new TextEncoder().encode(`${s}\0`); sp -= BigInt(bytes.length); this.mem.writeBytes(sp, bytes); strings.push(sp); return sp; };
    const argvPtrs = argv.map(putString);
    const envPtrs = envp.map(putString);
    sp &= ~15n;
    sp -= BigInt((argvPtrs.length + envPtrs.length + 4) * 8);
    const vector = sp;
    this.mem.write64(vector, BigInt(argvPtrs.length));
    argvPtrs.forEach((p, i) => this.mem.write64(vector + BigInt(8 + i * 8), p));
    this.mem.write64(vector + BigInt(8 + argvPtrs.length * 8), 0n);
    envPtrs.forEach((p, i) => this.mem.write64(vector + BigInt(16 + argvPtrs.length * 8 + i * 8), p));
    this.mem.write64(vector + BigInt(16 + (argvPtrs.length + envPtrs.length) * 8), 0n);
    this.state.setSp(vector);
    this.state.setX(0, BigInt(argvPtrs.length));
    this.state.setX(1, vector + 8n);
    this.state.setX(2, vector + BigInt(16 + argvPtrs.length * 8));
    this.state.setX(3, 0n);
    this.state.pc = image.entry;
  }

  reset(): void {
    for (const r of this.mem.regions()) this.mem.unmap(r.addr, r.size);
    this.state.x.fill(0n); this.state.pc = 0n; this.state.n = false; this.state.z = false; this.state.c = false; this.state.v = false; this.state.instCount = 0;
    this.exited = undefined; this.yieldRequested = false; this.syscalls.length = 0; this.out.length = 0;
  }

  step(): RunResult {
    if (this.exited !== undefined) return { status: 'exited', exitCode: this.exited };
    try {
      const trap = this.cpu.step();
      if (!trap) return { status: 'running' };
      if (trap.kind === 'svc') { this.darwin.handleSvc(); if (this.exited !== undefined) return { status: 'exited', exitCode: this.exited }; if (this.yieldRequested) { this.yieldRequested = false; return { status: 'yield' }; } return { status: 'running' }; }
      if (trap.kind === 'hlt') return { status: 'exited', exitCode: trap.imm };
      throw new Error(`breakpoint trap #${trap.imm}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('fault', err);
      return { status: 'faulted', error: err };
    }
  }

  run(budget: number): RunResult {
    for (let i = 0; i < budget; i++) { const result = this.step(); if (result.status !== 'running') return result; }
    return { status: 'running' };
  }
  requestExit(code: number): void { this.exited = code; this.emit('exit', code); }
  present(): void { this.emit('present', { imageData: this.framebuffer.toImageData(this.mem), w: 320, h: 240 }); }
  emitOutput(kind: 'stdout' | 'stderr' | 'log', value: string): void { if (kind === 'stdout') this.out.push(value); this.emit(kind, value); }
  recordSyscall(event: SyscallEvent): void { if (this.syscalls.length >= 5000) this.syscalls.shift(); this.syscalls.push(event); this.emit('syscall', event); }
  get syscallLog(): SyscallEvent[] { return this.syscalls.slice(); }
  get stdoutBuffer(): string { return this.out.join(''); }
  pushInput(event: InputEvent): void { this.input.push(event); }
}
export { MemoryFault, UnsupportedInstruction };

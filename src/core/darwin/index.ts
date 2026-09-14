import type { Machine } from '../machine';
import { handleBsd } from './syscalls';
import { handleMach } from './machtraps';
import { handleExtension } from './extensions';
import { Errno } from './errno';

export interface SyscallEvent { n: number; name: string; args: bigint[]; ret: bigint; errno?: number; unsupported: boolean; instCount: number; }
export interface SvcResult { ret: bigint; errno?: number; unsupported: boolean; }
export class Darwin {
  constructor(readonly machine: Machine) {}
  handleSvc(): SvcResult {
    const raw = Number(BigInt.asIntN(64, this.machine.cpu.state.x[16] ?? 0n));
    const args = Array.from(this.machine.cpu.state.x.slice(0, 6));
    let n = raw; let result: SvcResult;
    if ((raw & 0xff00_0000) === 0x4000_0000) { n = raw - 0x4000_0000; result = handleExtension(this, n); }
    else if (raw < 0) result = handleMach(this, -raw);
    else if ((raw & 0xff00_0000) === 0x0200_0000) { n = raw & 0xffff; result = handleBsd(this, n); }
    else if ((raw & 0xff00_0000) === 0x0100_0000) { n = raw & 0xffff; result = handleMach(this, n); }
    else result = handleBsd(this, raw);
    this.machine.cpu.state.setX(0, result.errno === undefined ? result.ret : BigInt(result.errno));
    this.machine.cpu.state.c = result.errno !== undefined;
    const event: SyscallEvent = { n, name: result.unsupported ? 'unsupported' : `syscall_${n}`, args, ret: result.ret, errno: result.errno, unsupported: result.unsupported, instCount: this.machine.cpu.state.instCount };
    this.machine.recordSyscall(event);
    return result;
  }
}
export { Errno };

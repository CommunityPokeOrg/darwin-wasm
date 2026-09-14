import type { Machine } from '../machine';
import { handleBsd } from './syscalls';
import { handleMach } from './machtraps';
import { handleExtension } from './extensions';
import { Errno } from './errno';
import { bsdSyscallName, extensionName, hostCallName, machTrapName } from './names';
import { handleHostCall } from '../dyld/hostcalls';

export interface SyscallEvent { n: number; name: string; cls: 'bsd' | 'mach' | 'ext' | 'host'; args: bigint[]; ret: bigint; errno?: number; unsupported: boolean; instCount: number; }
export interface SvcResult { ret: bigint; errno?: number; unsupported: boolean; }
export class Darwin {
  constructor(readonly machine: Machine) {}
  handleSvc(): SvcResult {
    const raw = Number(BigInt.asIntN(64, this.machine.cpu.state.x[16] ?? 0n));
    const args = Array.from(this.machine.cpu.state.x.slice(0, 6));
    let n = raw; let result: SvcResult;
    let cls: SyscallEvent['cls'];
    if ((raw & 0xff00_0000) === 0x4100_0000) { n = raw & 0xffff; result = handleHostCall(this, n); cls = 'host'; }
    else if ((raw & 0xff00_0000) === 0x4000_0000) { n = raw - 0x4000_0000; result = handleExtension(this, n); cls = 'ext'; }
    else if (raw < 0) { n = -raw; result = handleMach(this, n); cls = 'mach'; }
    else if ((raw & 0xff00_0000) === 0x0200_0000) { n = raw & 0xffff; result = handleBsd(this, n); cls = 'bsd'; }
    else if ((raw & 0xff00_0000) === 0x0100_0000) { n = raw & 0xffff; result = handleMach(this, n); cls = 'mach'; }
    else { result = handleBsd(this, raw); cls = 'bsd'; }
    this.machine.cpu.state.setX(0, result.errno === undefined ? result.ret : BigInt(result.errno));
    this.machine.cpu.state.c = result.errno !== undefined;
    const name = cls === 'bsd' ? bsdSyscallName(n) : cls === 'mach' ? machTrapName(n) : cls === 'ext' ? extensionName(n) : hostCallName(n);
    const event: SyscallEvent = { n, name, cls, args, ret: result.ret, errno: result.errno, unsupported: result.unsupported, instCount: this.machine.cpu.state.instCount };
    this.machine.recordSyscall(event);
    return result;
  }
}
export { Errno };

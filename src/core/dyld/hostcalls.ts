import type { Darwin, SvcResult } from '../darwin';
import { Errno } from '../darwin/errno';
import { HOST_STUBS } from './hoststubs';

const arg = (d: Darwin, i: number) => d.machine.cpu.state.x[i] ?? 0n;
const string = (d: Darwin, p: bigint) => p === 0n ? '' : d.machine.mem.readCString(p);
function format(d: Darwin, p: bigint): string {
  const fmt = string(d, p); let ai = 1; let out = '';
  for (let i = 0; i < fmt.length; i++) {
    if (fmt[i] !== '%') { out += fmt[i] ?? ''; continue; }
    if (fmt[i + 1] === '%') { out += '%'; i++; continue; }
    let zero = false; let width = '';
    if (fmt[i + 1] === '0') { zero = true; i++; }
    while (/\d/.test(fmt[i + 1] ?? '')) { i++; width += fmt[i] ?? ''; }
    if (fmt[i + 1] === 'l') { i++; if (fmt[i + 1] === 'l') i++; }
    const spec = fmt[++i] ?? ''; const value = arg(d, ai++);
    let text: string;
    if (spec === 's') text = string(d, value);
    else if (spec === 'c') text = String.fromCharCode(Number(value));
    else if (spec === 'd' || spec === 'i') text = BigInt.asIntN(64, value).toString();
    else if (spec === 'u') text = value.toString();
    else if (spec === 'x') text = value.toString(16);
    else if (spec === 'p') text = `0x${value.toString(16)}`;
    else text = '';
    const n = Number(width || 0); out += n > text.length ? (zero ? text.padStart(n, '0') : text.padStart(n, ' ')) : text;
  }
  return out;
}
export function handleHostCall(darwin: Darwin, id: number): SvcResult {
  const m = darwin.machine;
  switch (HOST_STUBS[id]) {
    case '_write': {
      const fd = arg(darwin, 0); const bytes = m.mem.readBytes(arg(darwin, 1), Number(arg(darwin, 2)));
      if (fd !== 1n && fd !== 2n) return { ret: 0n, errno: Errno.EBADF, unsupported: false };
      m.emitOutput(fd === 1n ? 'stdout' : 'stderr', new TextDecoder().decode(bytes)); return { ret: BigInt(bytes.length), unsupported: false };
    }
    case '_read': return { ret: 0n, unsupported: false };
    case '_exit': case '__exit': case '_abort': m.requestExit(Number(arg(darwin, 0))); return { ret: 0n, unsupported: false };
    case '_getpid': return { ret: 1000n, unsupported: false };
    case '_puts': { const text = `${string(darwin, arg(darwin, 0))}\n`; m.emitOutput('stdout', text); return { ret: BigInt(text.length - 1), unsupported: false }; }
    case '_putchar': { m.emitOutput('stdout', String.fromCharCode(Number(arg(darwin, 0)))); return { ret: arg(darwin, 0), unsupported: false }; }
    case '_strlen': return { ret: BigInt(string(darwin, arg(darwin, 0)).length), unsupported: false };
    case '_memcpy': { const dst = arg(darwin, 0); m.mem.writeBytes(dst, m.mem.readBytes(arg(darwin, 1), Number(arg(darwin, 2)))); return { ret: dst, unsupported: false }; }
    case '_memset': { const dst = arg(darwin, 0); const bytes = new Uint8Array(Number(arg(darwin, 2))); bytes.fill(Number(arg(darwin, 1)) & 0xff); m.mem.writeBytes(dst, bytes); return { ret: dst, unsupported: false }; }
    case '_malloc': return { ret: m.mem.allocAnon(arg(darwin, 0)), unsupported: false };
    case '_calloc': return { ret: m.mem.allocAnon(arg(darwin, 0) * arg(darwin, 1)), unsupported: false };
    case '_free': return { ret: 0n, unsupported: false };
    case '_printf': { const text = format(darwin, arg(darwin, 0)); m.emitOutput('stdout', text); return { ret: BigInt(text.length), unsupported: false }; }
    case '_mach_task_self': return { ret: 0x303n, unsupported: false };
    case '_mach_msg': return { ret: 0n, unsupported: false };
    case '_mmap': return { ret: m.mem.allocAnon(arg(darwin, 1), arg(darwin, 0) || undefined), unsupported: false };
    case '_munmap': m.mem.unmap(arg(darwin, 0), arg(darwin, 1)); return { ret: 0n, unsupported: false };
    case '_getenv': return { ret: 0n, unsupported: false };
    case '_dyld_stub_binder': return { ret: 0n, errno: Errno.ENOSYS, unsupported: true };
    default: return { ret: 0n, errno: Errno.ENOSYS, unsupported: true };
  }
}

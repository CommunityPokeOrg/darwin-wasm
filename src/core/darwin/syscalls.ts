import { Errno } from './errno';
import type { Darwin, SvcResult } from './index';

export function handleBsd(darwin: Darwin, n: number): SvcResult {
  const m = darwin.machine;
  const a = m.cpu.state.x;
  const arg = (i: number) => a[i] ?? 0n;
  const ok = (ret = 0n): SvcResult => ({ ret, errno: undefined, unsupported: false });
  const error = (errno: number, unsupported = false): SvcResult => ({ ret: 0n, errno, unsupported });
  switch (n) {
    case 1: m.requestExit(Number(arg(0))); return ok();
    case 3: return arg(0) === 0n ? ok(0n) : error(Errno.EBADF);
    case 4: {
      const fd = arg(0); const bytes = m.mem.readBytes(arg(1), Number(arg(2)));
      if (fd !== 1n && fd !== 2n) return error(Errno.EBADF);
      m.emitOutput(fd === 1n ? 'stdout' : 'stderr', new TextDecoder().decode(bytes));
      return ok(BigInt(bytes.length));
    }
    case 6: return ok();
    case 20: return ok(1000n);
    case 24: case 25: case 43: case 47: return ok(501n);
    case 46: case 48: case 53: case 74: case 75: case 92: case 169: case 327: case 361: case 372: return ok(n === 372 ? 1n : 0n);
    case 54: return error(Errno.ENOTTY);
    case 73: m.mem.unmap(arg(0), arg(1)); return ok();
    case 116: {
      const now = BigInt(Date.now()); const ptr = arg(0);
      m.mem.write64(ptr, now / 1000n); m.mem.write64(ptr + 8n, (now % 1000n) * 1000n); return ok();
    }
    case 121: {
      const iov = arg(1); const count = Number(arg(2)); let total = 0n;
      for (let i = 0; i < count; i++) { const base = m.mem.read64(iov + BigInt(i * 16)); const len = m.mem.read64(iov + BigInt(i * 16 + 8)); m.emitOutput(arg(0) === 2n ? 'stderr' : 'stdout', new TextDecoder().decode(m.mem.readBytes(base, Number(len)))); total += len; }
      return ok(total);
    }
    case 194: { const p = arg(1); m.mem.write64(p, 0x7fff_ffff_ffff_ffffn); m.mem.write64(p + 8n, 0x7fff_ffff_ffff_ffffn); return ok(); }
    case 197: {
      const flags = arg(3); if ((flags & 0x1000n) === 0n) return error(Errno.ENODEV);
      return ok(m.mem.allocAnon(arg(1), arg(0) || undefined));
    }
    case 199: return error(Errno.ESPIPE);
    case 202: case 274: case 294: case 336: case 360: return error(n === 360 ? Errno.ENOTSUP : n === 202 || n === 274 || n === 294 || n === 336 ? Errno.ENOTSUP : Errno.ENOSYS, n === 360 || n === 202 || n === 274 || n === 294 || n === 336);
    case 366: return ok();
    case 500: { const p = arg(0); const len = Number(arg(1)); const random = new Uint8Array(len); crypto.getRandomValues(random); m.mem.writeBytes(p, random); return ok(); }
    case 515: case 516: return ok();
    default: return error(Errno.ENOSYS, true);
  }
}

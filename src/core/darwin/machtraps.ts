import { MACH_MSG_SUCCESS, MACH_RCV_MSG, MACH_RCV_TIMED_OUT } from './errno';
import type { Darwin, SvcResult } from './index';

export function handleMach(darwin: Darwin, trap: number): SvcResult {
  const m = darwin.machine; const a = m.cpu.state.x; const arg = (i: number) => a[i] ?? 0n;
  const ok = (ret = 0n): SvcResult => ({ ret, unsupported: false });
  switch (trap) {
    case 26: return ok(0x103n);
    case 27: return ok(0x203n);
    case 28: return ok(0x303n);
    case 29: return ok(0x403n);
    case 31: {
      const bits = m.mem.read32(arg(2)); const send = (bits & MACH_RCV_MSG) === 0;
      const id = m.mem.read32(arg(0) + 8n); const size = m.mem.read32(arg(0));
      m.emitOutput('log', `mach_msg id=${id} size=${size}`);
      return ok(send ? BigInt(MACH_MSG_SUCCESS) : BigInt(MACH_RCV_TIMED_OUT));
    }
    case 10: case 12: case 15: return ok(m.mem.allocAnon(arg(2) || arg(1), arg(1) || undefined));
    case 89: m.mem.write32(arg(0), 1); m.mem.write32(arg(0) + 4n, 1); return ok();
    case 90: case 59: case 60: case 61: return ok();
    default: if (trap >= 16 && trap <= 25) return ok(); return { ret: 0n, unsupported: true };
  }
}

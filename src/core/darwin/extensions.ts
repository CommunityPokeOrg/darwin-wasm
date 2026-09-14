import type { Darwin, SvcResult } from './index';
export function handleExtension(darwin: Darwin, n: number): SvcResult {
  const m = darwin.machine; const a = m.cpu.state.x; const arg = (i: number) => a[i] ?? 0n;
  switch (n) {
    case 0: a[0] = 0x7f00_0000n; a[1] = 320n; a[2] = 240n; a[3] = 1280n; return { ret: 0n, unsupported: false };
    case 1: m.present(); return { ret: 0n, unsupported: false };
    case 2: { const ev = m.input.poll(); if (!ev) return { ret: 0n, unsupported: false }; m.mem.write32(arg(0), ev.type); m.mem.write32(arg(0) + 4n, ev.x); m.mem.write32(arg(0) + 8n, ev.y); m.mem.write32(arg(0) + 12n, ev.button); return { ret: 1n, unsupported: false }; }
    case 3: m.yieldRequested = true; return { ret: 0n, unsupported: false };
    case 5: m.emitOutput('log', new TextDecoder().decode(m.mem.readBytes(arg(0), Number(arg(1))))); return { ret: 0n, unsupported: false };
    default: return { ret: 0n, errno: 78, unsupported: true };
  }
}

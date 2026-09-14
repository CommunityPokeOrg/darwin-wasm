import type { Machine } from '../machine';
import type { MachOImage } from '../macho/loader';
import { HOST_STUBS, hostStubCode } from './hoststubs';

export type LoadedMachO = MachOImage;
export interface DyldReport {
  dylibs: { path: string; status: 'stubbed' | 'ignored' }[];
  bound: { symbol: string; addr: bigint; target: bigint; kind: 'lazy' | 'nonlazy'; via: 'host-stub' | 'null' }[];
  unresolved: string[];
  stubImageBase: bigint;
}
const ULEB = (bytes: Uint8Array, pos: { value: number }): bigint => {
  let result = 0n; let shift = 0n;
  while (pos.value < bytes.length) { const b = bytes[pos.value++] ?? 0; result |= BigInt(b & 0x7f) << shift; if (!(b & 0x80)) break; shift += 7n; }
  return result;
};
const SLEB = (bytes: Uint8Array, pos: { value: number }): bigint => {
  const start = pos.value; const value = ULEB(bytes, pos); const last = bytes[Math.max(start, pos.value - 1)] ?? 0;
  return (last & 0x40) ? value - (1n << BigInt((pos.value - start) * 7)) : value;
};
export class MiniDyld {
  private readonly stubbedPaths = new Set<string>();
  constructor(readonly machine: Machine) {}
  link(image: LoadedMachO): DyldReport {
    const base = 0x0000_7e00_0000n; this.machine.mem.map(base, 0x10000n, 'rx');
    for (let id = 0; id < HOST_STUBS.length; id++) {
      const code = hostStubCode(id); const bytes = new Uint8Array(16); const view = new DataView(bytes.buffer);
      code.forEach((word, i) => view.setUint32(i * 4, word, true));
      this.machine.mem.writeBytes(base + BigInt(id * 16), bytes);
    }
    const report: DyldReport = { dylibs: image.dylibs.map((path) => ({ path, status: 'ignored' })), bound: [], unresolved: [], stubImageBase: base };
    const bind = image.dyldInfo && image.bytes ? image.bytes.slice(image.dyldInfo.bind_off, image.dyldInfo.bind_off + image.dyldInfo.bind_size) : new Uint8Array();
    const lazy = image.dyldInfo && image.bytes ? image.bytes.slice(image.dyldInfo.lazy_bind_off, image.dyldInfo.lazy_bind_off + image.dyldInfo.lazy_bind_size) : new Uint8Array();
    const rebase = image.dyldInfo && image.bytes ? image.bytes.slice(image.dyldInfo.rebase_off, image.dyldInfo.rebase_off + image.dyldInfo.rebase_size) : new Uint8Array();
    MiniDyld.skipRebaseStream(rebase);
    this.bindStream(image, bind, false, report); this.bindStream(image, lazy, true, report);
    for (const segment of image.segments) for (const section of segment.sections) {
      const type = section.flags & 0xff;
      if ((type !== 6 && type !== 7) || !section.size) continue;
      for (let i = 0; i < Number(section.size / 8n); i++) {
        const symIndex = image.indirectSymbols[section.reserved1 + i]; const symbol = symIndex === undefined ? undefined : image.symbols[symIndex];
        if (symbol?.name) this.bindPointer(image, symbol.name, section.addr + BigInt(i * 8), type === 7 ? 'lazy' : 'nonlazy', report, image.dylibs[0]);
      }
    }
    for (const d of report.dylibs) if (this.stubbedPaths.has(d.path)) d.status = 'stubbed';
    return report;
  }
  private bindPointer(image: MachOImage, name: string, addr: bigint, kind: 'lazy' | 'nonlazy', report: DyldReport, dylibPath?: string): void {
    if (report.bound.some((item) => item.addr === addr && item.kind === kind)) return;
    const id = HOST_STUBS.indexOf(name as never); const target = id >= 0 ? report.stubImageBase + BigInt(id * 16) : 0n;
    this.machine.mem.write64(addr, target); report.bound.push({ symbol: name, addr, target, kind, via: id >= 0 ? 'host-stub' : 'null' });
    if (id >= 0 && dylibPath) this.stubbedPaths.add(dylibPath);
    if (id < 0 && !report.unresolved.includes(name)) report.unresolved.push(name);
  }
  /** Validate and consume rebases; slide is always zero, so they are no-ops. */
  private static skipRebaseStream(bytes: Uint8Array): void {
    const p = { value: 0 };
    while (p.value < bytes.length) {
      const op = bytes[p.value++] ?? 0; const opcode = op & 0xf0;
      if (opcode === 0) break;
      if (opcode === 0x10) continue;
      if (opcode === 0x20) { ULEB(bytes, p); continue; }
      if (opcode === 0x30) { ULEB(bytes, p); continue; }
      if (opcode === 0x40) continue;
      if (opcode === 0x50) continue;
      if (opcode === 0x60) { ULEB(bytes, p); continue; }
      if (opcode === 0x70) { ULEB(bytes, p); continue; }
      if (opcode === 0x80) { ULEB(bytes, p); ULEB(bytes, p); continue; }
    }
  }
  private bindStream(image: MachOImage, bytes: Uint8Array, lazy: boolean, report: DyldReport): void {
    if (!bytes.length) return;
    const p = { value: 0 }; let segment = 0; let address = 0n; let symbol = ''; let type = 1; let ordinal = 1;
    while (p.value < bytes.length) {
      const op = bytes[p.value++] ?? 0; const opcode = op & 0xf0; const imm = op & 0x0f;
      if (opcode === 0) break;
      if (opcode === 0x10) { ordinal = imm; continue; }
      if (opcode === 0x20) { ordinal = Number(ULEB(bytes, p)); continue; }
      if (opcode === 0x30) continue;
      if (opcode === 0x40) { const chars: number[] = []; while (p.value < bytes.length && bytes[p.value]) chars.push(bytes[p.value++] ?? 0); p.value++; symbol = new TextDecoder().decode(new Uint8Array(chars)); continue; }
      if (opcode === 0x50) { type = imm; continue; }
      if (opcode === 0x60) { SLEB(bytes, p); continue; }
      if (opcode === 0x70) { segment = imm; address = ULEB(bytes, p); continue; }
      if (opcode === 0x80) { address += ULEB(bytes, p); continue; }
      const path = image.dylibs[ordinal - 1];
      if (opcode === 0x90) { const seg = image.segments[segment]; if (seg) this.bindPointer(image, symbol, seg.vmaddr + address, lazy ? 'lazy' : 'nonlazy', report, path); address += BigInt(type === 1 ? 8 : 1); continue; }
      if (opcode === 0xa0) { const seg = image.segments[segment]; if (seg) this.bindPointer(image, symbol, seg.vmaddr + address, lazy ? 'lazy' : 'nonlazy', report, path); address += BigInt(type === 1 ? 8 : 1) + ULEB(bytes, p); continue; }
      if (opcode === 0xb0) { const seg = image.segments[segment]; if (seg) this.bindPointer(image, symbol, seg.vmaddr + address, lazy ? 'lazy' : 'nonlazy', report, path); address += BigInt(type === 1 ? 8 : 1) * BigInt(imm + 1); continue; }
      if (opcode === 0xc0) { const count = ULEB(bytes, p); const skip = ULEB(bytes, p); for (let i = 0n; i < count; i++) { const seg = image.segments[segment]; if (seg) this.bindPointer(image, symbol, seg.vmaddr + address, lazy ? 'lazy' : 'nonlazy', report, path); address += BigInt(type === 1 ? 8 : 1) + skip; } }
    }
  }
}

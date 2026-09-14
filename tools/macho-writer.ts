const align = (n: number, a: number) => Math.ceil(n / a) * a;
const putName = (v: DataView, off: number, s: string, len: number) => { for (let i = 0; i < Math.min(len, s.length); i++) v.setUint8(off + i, s.charCodeAt(i)); };
export interface MachOWriterOptions { dyld?: { symbols: string[]; dylib?: string }; }
export function writeMachO(program: import('./asm').Program, options: MachOWriterOptions = {}): Uint8Array {
  const built = program.build(); const dyld = options.dyld; const symbols = dyld?.symbols ?? [];
  const textFile = 0x1000; const textVm = 0x1_0000_0000; const dataVm = textVm + 0x10000; const dylib = dyld?.dylib ?? '/usr/lib/libSystem.B.dylib';
  const dylibSize = dyld ? align(24 + dylib.length + 1, 4) : 0; const extra = dyld ? dylibSize + 24 + 80 + 48 : 0;
  const ncmds = dyld ? 9 : 5; const commandBytes = 72 + 232 + (dyld ? 152 : 232) + 24 + 24 + extra; const headerSize = 32 + commandBytes; const textSize = Math.max(0x1000, align(built.text.length + built.data.length, 0x1000));
  const dataFile = align(textFile + built.text.length + built.data.length, 0x1000); const symoff = dataFile + 0x1000; const stroff = symoff + symbols.length * 16;
  const strtab = new TextEncoder().encode(`\0${symbols.join('\0')}\0`); const indirectOff = stroff + strtab.length;
  const bindParts: number[] = dyld ? [0x11, 0x51, 0x72, 0] : [];
  if (dyld) for (const symbol of symbols) bindParts.push(0x40, ...new TextEncoder().encode(`${symbol}\0`), 0x90);
  const bind = dyld ? new Uint8Array([...bindParts, 0]) : new Uint8Array(); const bindOff = indirectOff + symbols.length * 4;
  const out = new Uint8Array(dyld ? bindOff + bind.length : dataFile + 0x1000); const v = new DataView(out.buffer); v.setUint32(0, 0xfeedfacf, true); v.setUint32(4, 0x0100000c, true); v.setUint32(12, 2, true); v.setUint32(16, ncmds, true); v.setUint32(20, headerSize - 32, true);
  let o = 32;
  const seg = (name: string, vm: bigint, fileoff: bigint, filesize: bigint, vmsize: bigint, nsects: number, maxprot: number, initprot: number) => { v.setUint32(o, 0x19, true); v.setUint32(o + 4, 72 + nsects * 80, true); putName(v, o + 8, name, 16); v.setBigUint64(o + 24, vm, true); v.setBigUint64(o + 32, vmsize, true); v.setBigUint64(o + 40, fileoff, true); v.setBigUint64(o + 48, filesize, true); v.setUint32(o + 56, maxprot, true); v.setUint32(o + 60, initprot, true); v.setUint32(o + 64, nsects, true); const at = o; o += 72 + nsects * 80; return at; };
  const section = (at: number, name: string, segment: string, addr: bigint, size: bigint, offset: number, flags = 0) => { putName(v, at, name, 16); putName(v, at + 16, segment, 16); v.setBigUint64(at + 32, addr, true); v.setBigUint64(at + 40, size, true); v.setUint32(at + 48, offset, true); v.setUint32(at + 52, 2, true); v.setUint32(at + 64, flags, true); };
  seg('__PAGEZERO', 0n, 0n, 0n, BigInt(textVm), 0, 0, 0); const textSeg = seg('__TEXT', BigInt(textVm), BigInt(textFile), BigInt(built.text.length + built.data.length), BigInt(textSize), 2, 5, 5);
  section(textSeg + 72, '__text', '__TEXT', BigInt(textVm), BigInt(built.text.length), textFile, 0x80000400); section(textSeg + 152, '__cstring', '__TEXT', BigInt(textVm + built.text.length), BigInt(built.data.length), textFile + built.text.length, 2);
  const dataSeg = seg('__DATA', BigInt(dataVm), BigInt(dataFile), BigInt(dyld ? 16 : 0), 0x1000n, dyld ? 1 : 2, 3, 3); if (dyld) section(dataSeg + 72, '__got', '__DATA', BigInt(dataVm), 16n, dataFile, 6); else { section(dataSeg + 72, '__data', '__DATA', BigInt(dataVm), 0n, 0); section(dataSeg + 152, '__bss', '__DATA', BigInt(dataVm), 0x1000n, 0, 1); }
  v.setUint32(o, 0x80000028, true); v.setUint32(o + 4, 24, true); v.setBigUint64(o + 16, BigInt(textFile), true); o += 24; v.setUint32(o, 0x32, true); v.setUint32(o + 4, 24, true); v.setUint32(o + 8, 2, true); v.setUint32(o + 12, 0x000e0000, true); o += 24;
  if (dyld) { v.setUint32(o, 0xc, true); v.setUint32(o + 4, dylibSize, true); v.setUint32(o + 8, 24, true); putName(v, o + 24, dylib, dylibSize - 24); o += dylibSize; v.setUint32(o, 2, true); v.setUint32(o + 4, 24, true); v.setUint32(o + 8, symoff, true); v.setUint32(o + 12, symbols.length, true); v.setUint32(o + 16, stroff, true); v.setUint32(o + 20, strtab.length, true); o += 24; v.setUint32(o, 0xb, true); v.setUint32(o + 4, 80, true); v.setUint32(o + 56, stroff + strtab.length, true); v.setUint32(o + 60, symbols.length, true); o += 80; v.setUint32(o, 0x80000022, true); v.setUint32(o + 4, 48, true); v.setUint32(o + 16, bindOff, true); v.setUint32(o + 20, bind.length, true); }
  out.set(built.text, textFile); out.set(built.data, textFile + built.text.length);
  if (dyld) { symbols.forEach((s, i) => { const strx = 1 + symbols.slice(0, i).reduce((n, x) => n + x.length + 1, 0); v.setUint32(symoff + i * 16, strx, true); v.setUint32(indirectOff + i * 4, i, true); }); out.set(strtab, stroff); out.set(bind, bindOff); }
  return out;
}

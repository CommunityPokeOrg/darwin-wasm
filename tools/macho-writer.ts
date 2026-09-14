import { Program } from './asm';
const align = (n: number, a: number) => Math.ceil(n / a) * a;
const putName = (v: DataView, off: number, s: string, len: number) => { for (let i = 0; i < Math.min(len, s.length); i++) v.setUint8(off + i, s.charCodeAt(i)); };
export function writeMachO(program: Program): Uint8Array {
  const built = program.build(); const textFile = 0x1000; const textVm = 0x1_0000_0000; const dataVm = textVm + 0x10000; const dataFile = align(textFile + built.text.length + built.data.length, 0x1000); const headerSize = 32 + 72 + 232 + 232 + 24 + 24; const textSize = Math.max(0x1000, align(built.text.length + built.data.length, 0x1000)); const total = dataFile + 0x1000;
  const out = new Uint8Array(total); const v = new DataView(out.buffer); v.setUint32(0, 0xfeedfacf, true); v.setUint32(4, 0x0100000c, true); v.setUint32(8, 0, true); v.setUint32(12, 2, true); v.setUint32(16, 5, true); v.setUint32(20, headerSize - 32, true); v.setUint32(24, 0, true); v.setUint32(28, 0, true);
  let o = 32;
  const seg = (name: string, vm: bigint, fileoff: bigint, filesize: bigint, vmsize: bigint, nsects: number, maxprot: number, initprot: number) => { v.setUint32(o, 0x19, true); v.setUint32(o + 4, 72 + nsects * 80, true); putName(v, o + 8, name, 16); v.setBigUint64(o + 24, vm, true); v.setBigUint64(o + 32, vmsize, true); v.setBigUint64(o + 40, fileoff, true); v.setBigUint64(o + 48, filesize, true); v.setUint32(o + 56, maxprot, true); v.setUint32(o + 60, initprot, true); v.setUint32(o + 64, nsects, true); v.setUint32(o + 68, 0, true); const start = o; o += 72 + nsects * 80; return start; };
  seg('__PAGEZERO', 0n, 0n, 0n, BigInt(textVm), 0, 0, 0);
  const textSeg = seg('__TEXT', BigInt(textVm), BigInt(textFile), BigInt(built.text.length + built.data.length), BigInt(textSize), 2, 5, 5);
  const section = (base: number, name: string, segname: string, addr: bigint, size: bigint, offset: number, flags = 0) => { putName(v, base, name, 16); putName(v, base + 16, segname, 16); v.setBigUint64(base + 32, addr, true); v.setBigUint64(base + 40, size, true); v.setUint32(base + 48, offset, true); v.setUint32(base + 52, 2, true); v.setUint32(base + 64, flags, true); };
  section(textSeg + 72, '__text', '__TEXT', BigInt(textVm), BigInt(built.text.length), textFile, 0x80000400); section(textSeg + 152, '__cstring', '__TEXT', BigInt(textVm + built.text.length), BigInt(built.data.length), textFile + built.text.length, 2);
  const dataSeg = seg('__DATA', BigInt(dataVm), BigInt(dataFile), 0n, 0x1000n, 2, 3, 3);
  section(dataSeg + 72, '__data', '__DATA', BigInt(dataVm), 0n, 0, 0); section(dataSeg + 152, '__bss', '__DATA', BigInt(dataVm), 0x1000n, 0, 1);
  v.setUint32(o, 0x80000028, true); v.setUint32(o + 4, 24, true); v.setBigUint64(o + 8, 0n, true); v.setBigUint64(o + 16, BigInt(textFile), true); o += 24;
  v.setUint32(o, 0x32, true); v.setUint32(o + 4, 24, true); v.setUint32(o + 8, 2, true); v.setUint32(o + 12, 0x000e0000, true); v.setUint32(o + 16, 0, true); v.setUint32(o + 20, 0, true);
  out.set(built.text, textFile); out.set(built.data, textFile + built.text.length); return out;
}

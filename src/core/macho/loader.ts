import { Memory } from '../mem/memory';

const MH_MAGIC_64 = 0xfeedfacf;
const FAT_MAGIC = 0xcafebabe;
const FAT_CIGAM = 0xbebafeca;
const CPU_TYPE_ARM64 = 0x0100000c;
const LC_SEGMENT_64 = 0x19;
const LC_MAIN = 0x80000028;
const LC_UNIXTHREAD = 0x5;
const LC_LOAD_DYLIB = 0xc;
const LC_LOAD_WEAK_DYLIB = 0x80000018;
const LC_REEXPORT_DYLIB = 0x8000001f;
const LC_SYMTAB = 0x2;
const LC_DYSYMTAB = 0xb;
const LC_DYLD_INFO = 0x22;
const LC_DYLD_INFO_ONLY = 0x80000022;
const LC_DYLD_CHAINED_FIXUPS = 0x80000034;
const LC_DYLD_EXPORTS_TRIE = 0x80000033;
const LC_BUILD_VERSION = 0x32;

export interface Segment {
  name: string;
  vmaddr: bigint;
  vmsize: bigint;
  fileoff: bigint;
  filesize: bigint;
  maxprot: number;
  initprot: number;
  sections: Section[];
}
export interface Section { name: string; segment: string; addr: bigint; size: bigint; offset: number; flags: number; reserved1: number; reserved2: number; }
export interface MachOSymbol { index: number; n_strx: number; n_type: number; n_sect: number; n_value: bigint; name: string; }
export interface DyldInfo { bind_off: number; bind_size: number; lazy_bind_off: number; lazy_bind_size: number; rebase_off: number; rebase_size: number; }
export interface MachOImage {
  entry: bigint;
  segments: Segment[];
  isPie: boolean;
  minOs?: string;
  loadCommandsSummary: string[];
  bytes?: Uint8Array;
  dylibs: string[];
  symbols: MachOSymbol[];
  indirectSymbols: number[];
  dyldInfo?: DyldInfo;
  chainedFixups: boolean;
}

const text = (bytes: Uint8Array, off: number, len: number) => new TextDecoder().decode(bytes.slice(off, off + len)).replace(/\0.*$/, '');
const u32 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(o, true);
const u64 = (b: Uint8Array, o: number) => new DataView(b.buffer, b.byteOffset, b.byteLength).getBigUint64(o, true);

export function parseMachO(bytes: Uint8Array): MachOImage {
  const magic = u32(bytes, 0);
  if (magic === FAT_MAGIC || magic === FAT_CIGAM) throw new Error('fat binaries not supported, extract the arm64 slice');
  if (magic !== MH_MAGIC_64) throw new Error('not a 64-bit little-endian Mach-O');
  if (u32(bytes, 4) !== CPU_TYPE_ARM64) throw new Error('non-arm64 Mach-O is not supported');
  const filetype = u32(bytes, 12);
  if (filetype !== 2) throw new Error('Mach-O is not an executable');
  const ncmds = u32(bytes, 16);
  const sizeofcmds = u32(bytes, 20);
  if (32 + sizeofcmds > bytes.length) throw new Error('truncated Mach-O load commands');
  const flags = u32(bytes, 24);
  let entry: bigint | undefined;
  let textBase = 0n;
  let minOs: string | undefined;
  const segments: Segment[] = [];
  const summary: string[] = [];
  const dylibs: string[] = [];
  let symtab: { symoff: number; nsyms: number; stroff: number; strsize: number } | undefined;
  let dysymtab: { indirectsymoff: number; nindirectsyms: number } | undefined;
  let dyldInfo: DyldInfo | undefined;
  let chainedFixups = false;
  let off = 32;
  for (let i = 0; i < ncmds; i++) {
    const cmd = u32(bytes, off);
    const size = u32(bytes, off + 4);
    if (size < 8 || off + size > bytes.length) throw new Error('invalid Mach-O load command');
    summary.push(`0x${cmd.toString(16)}`);
    if (cmd === LC_SEGMENT_64) {
      const name = text(bytes, off + 8, 16);
      const vmaddr = u64(bytes, off + 24);
      const vmsize = u64(bytes, off + 32);
      const fileoff = u64(bytes, off + 40);
      const filesize = u64(bytes, off + 48);
      const sections: Section[] = [];
      const nsects = u32(bytes, off + 64);
      for (let j = 0; j < nsects; j++) {
        const so = off + 72 + j * 80;
        sections.push({ name: text(bytes, so, 16), segment: text(bytes, so + 16, 16), addr: u64(bytes, so + 32), size: u64(bytes, so + 40), offset: u32(bytes, so + 48), flags: u32(bytes, so + 64), reserved1: u32(bytes, so + 68), reserved2: u32(bytes, so + 72) });
      }
      segments.push({ name, vmaddr, vmsize, fileoff, filesize, maxprot: u32(bytes, off + 56), initprot: u32(bytes, off + 60), sections });
      if (name === '__TEXT') textBase = vmaddr;
    } else if (cmd === LC_MAIN) {
      entry = textBase + u64(bytes, off + 8);
    } else if (cmd === LC_UNIXTHREAD) {
      entry = u64(bytes, off + 8 + 17 * 8);
    } else if (cmd === LC_LOAD_DYLIB || cmd === LC_LOAD_WEAK_DYLIB || cmd === LC_REEXPORT_DYLIB) {
      const name = text(bytes, off + u32(bytes, off + 8), size - u32(bytes, off + 8));
      dylibs.push(name);
    } else if (cmd === LC_SYMTAB) {
      symtab = { symoff: u32(bytes, off + 8), nsyms: u32(bytes, off + 12), stroff: u32(bytes, off + 16), strsize: u32(bytes, off + 20) };
    } else if (cmd === LC_DYSYMTAB) {
      dysymtab = { indirectsymoff: u32(bytes, off + 56), nindirectsyms: u32(bytes, off + 60) };
    } else if (cmd === LC_DYLD_INFO || cmd === LC_DYLD_INFO_ONLY) {
      dyldInfo = { rebase_off: u32(bytes, off + 8), rebase_size: u32(bytes, off + 12), bind_off: u32(bytes, off + 16), bind_size: u32(bytes, off + 20), lazy_bind_off: u32(bytes, off + 24), lazy_bind_size: u32(bytes, off + 28) };
    } else if (cmd === LC_BUILD_VERSION) {
      const min = u32(bytes, off + 12);
      minOs = `${min >> 16}.${(min >> 8) & 0xff}.${min & 0xff}`;
    } else if (cmd === LC_DYLD_CHAINED_FIXUPS || cmd === LC_DYLD_EXPORTS_TRIE) {
      chainedFixups = true;
    } else if (cmd === 0x2d || cmd === 0x1d) {
      throw new Error('code signatures/encrypted segments are not supported');
    }
    off += size;
  }
  if (entry === undefined) throw new Error('Mach-O missing entry point');
  if (chainedFixups) throw new UnsupportedMachO('LC_DYLD_CHAINED_FIXUPS (modern iOS 15+ linkers) is not supported yet; see docs/LIMITATIONS.md');
  const symbols: MachOSymbol[] = [];
  if (symtab) for (let i = 0; i < symtab.nsyms; i++) {
    const so = symtab.symoff + i * 16;
    const n_strx = u32(bytes, so); const name = n_strx < symtab.strsize ? text(bytes, symtab.stroff + n_strx, symtab.strsize - n_strx) : '';
    symbols.push({ index: i, n_strx, n_type: bytes[so + 4] ?? 0, n_sect: bytes[so + 5] ?? 0, n_value: u64(bytes, so + 8), name });
  }
  const indirectSymbols: number[] = [];
  if (dysymtab) for (let i = 0; i < dysymtab.nindirectsyms; i++) indirectSymbols.push(u32(bytes, dysymtab.indirectsymoff + i * 4));
  return { entry, segments, isPie: Boolean(flags & 0x200000), minOs, loadCommandsSummary: summary, bytes, dylibs, symbols, indirectSymbols, dyldInfo, chainedFixups };
}

export class UnsupportedMachO extends Error {
  constructor(message: string) { super(message); this.name = 'UnsupportedMachO'; }
}

export function loadMachO(mem: Memory, image: MachOImage, slide = 0n): void {
  const bytes = image.bytes;
  if (!bytes) throw new Error('Mach-O image has no bytes');
  for (const segment of image.segments) {
    if (segment.name === '__PAGEZERO' && segment.filesize === 0n && segment.vmaddr === 0n) continue;
    const addr = segment.vmaddr + slide;
    mem.map(addr, segment.vmsize, segment.initprot & 2 ? 'rw' : segment.initprot & 4 ? 'rx' : 'r');
    const end = Number(segment.filesize);
    if (end > 0) mem.writeBytes(addr, bytes.slice(Number(segment.fileoff), Number(segment.fileoff) + end));
  }
}

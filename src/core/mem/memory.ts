export type Prot = 'r' | 'rw' | 'rx' | 'rwx' | 'none';

export interface Region {
  addr: bigint;
  size: bigint;
  prot: Prot;
}

export class MemoryFault extends Error {
  readonly addr: bigint;
  readonly size: number;
  readonly write: boolean;
  constructor(addr: bigint, size: number, write = false) {
    super(`memory fault at 0x${addr.toString(16)} (${write ? 'write' : 'read'} ${size})`);
    this.name = 'MemoryFault';
    this.addr = addr;
    this.size = size;
    this.write = write;
  }
}

const PAGE_BITS = 16n;
const PAGE_SIZE = 0x10000;
const PAGE_MASK = BigInt(PAGE_SIZE - 1);
const ALIGN = 0x4000n;

export class Memory {
  private readonly pages = new Map<number, Uint8Array>();
  private readonly regionList: Region[] = [];
  private nextAnon = 0x0000_1000_0000_0000n;

  map(addr: bigint, size: bigint, prot: Prot): void {
    if (size <= 0n) return;
    const first = addr >> PAGE_BITS;
    const last = (addr + size - 1n) >> PAGE_BITS;
    for (let page = first; page <= last; page++) {
      const key = Number(page);
      if (!this.pages.has(key)) this.pages.set(key, new Uint8Array(PAGE_SIZE));
    }
    this.regionList.push({ addr, size, prot });
  }

  unmap(addr: bigint, size: bigint): void {
    if (size <= 0n) return;
    const first = addr >> PAGE_BITS;
    const last = (addr + size - 1n) >> PAGE_BITS;
    for (let page = first; page <= last; page++) this.pages.delete(Number(page));
    for (let i = this.regionList.length - 1; i >= 0; i--) {
      const region = this.regionList[i];
      if (region && region.addr === addr && region.size === size) this.regionList.splice(i, 1);
    }
  }

  isMapped(addr: bigint): boolean {
    return this.pages.has(Number(addr >> PAGE_BITS));
  }

  private byte(addr: bigint, write: boolean, value?: number): number {
    const page = this.pages.get(Number(addr >> PAGE_BITS));
    if (!page) throw new MemoryFault(addr, 1, write);
    const offset = Number(addr & PAGE_MASK);
    if (value !== undefined) page[offset] = value & 0xff;
    return page[offset] ?? 0;
  }

  read8(addr: bigint): number { return this.byte(addr, false); }
  write8(addr: bigint, value: number): void { this.byte(addr, true, value); }

  read16(addr: bigint): number {
    return this.read8(addr) | (this.read8(addr + 1n) << 8);
  }
  read32(addr: bigint): number {
    return (this.read8(addr) | (this.read8(addr + 1n) << 8) |
      (this.read8(addr + 2n) << 16) | (this.read8(addr + 3n) << 24)) >>> 0;
  }
  read64(addr: bigint): bigint {
    let result = 0n;
    for (let i = 0; i < 8; i++) result |= BigInt(this.read8(addr + BigInt(i))) << BigInt(i * 8);
    return result;
  }
  write16(addr: bigint, value: number): void {
    for (let i = 0; i < 2; i++) this.write8(addr + BigInt(i), value >>> (i * 8));
  }
  write32(addr: bigint, value: number): void {
    for (let i = 0; i < 4; i++) this.write8(addr + BigInt(i), value >>> (i * 8));
  }
  write64(addr: bigint, value: bigint): void {
    for (let i = 0; i < 8; i++) this.write8(addr + BigInt(i), Number(value >> BigInt(i * 8)));
  }
  readBytes(addr: bigint, len: number): Uint8Array {
    const result = new Uint8Array(len);
    for (let i = 0; i < len; i++) result[i] = this.read8(addr + BigInt(i));
    return result;
  }
  writeBytes(addr: bigint, bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i++) this.write8(addr + BigInt(i), bytes[i] ?? 0);
  }
  readCString(addr: bigint, max = 4096): string {
    const bytes: number[] = [];
    for (let i = 0; i < max; i++) {
      const value = this.read8(addr + BigInt(i));
      if (value === 0) break;
      bytes.push(value);
    }
    return new TextDecoder().decode(new Uint8Array(bytes));
  }
  regions(): Region[] { return this.regionList.map((r) => ({ ...r })); }

  allocAnon(size: bigint, hint?: bigint): bigint {
    const aligned = (size + 0xffffn) & ~0xffffn;
    let addr = hint !== undefined ? (hint + ALIGN - 1n) & ~(ALIGN - 1n) : this.nextAnon;
    if (hint === undefined) this.nextAnon = addr + aligned;
    while ([...this.regionList].some((r) => addr < r.addr + r.size && addr + aligned > r.addr)) addr += aligned;
    this.map(addr, aligned, 'rw');
    if (addr + aligned > this.nextAnon) this.nextAnon = addr + aligned;
    return addr;
  }
}

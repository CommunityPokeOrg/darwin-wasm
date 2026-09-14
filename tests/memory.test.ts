import { describe, expect, it } from 'vitest';
import { Memory, MemoryFault } from '../src/core/mem/memory';

describe('Memory', () => {
  it('maps and reads little endian values across pages', () => {
    const mem = new Memory();
    mem.map(0xfffen, 4n, 'rw');
    mem.write32(0xfffen, 0x12345678);
    expect(mem.read32(0xfffen)).toBe(0x12345678);
    expect(mem.readBytes(0xfffen, 4)).toEqual(new Uint8Array([0x78, 0x56, 0x34, 0x12]));
  });
  it('reports faults and allocates aligned anonymous memory', () => {
    const mem = new Memory();
    expect(() => mem.read8(0xdeadn)).toThrow(MemoryFault);
    const addr = mem.allocAnon(1n);
    expect(addr % 0x4000n).toBe(0n);
    expect(mem.isMapped(addr)).toBe(true);
  });
});

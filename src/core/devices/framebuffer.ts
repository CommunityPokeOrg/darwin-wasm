import { Memory } from '../mem/memory';

export const FB_ADDR = 0x7f00_0000n;
export const FB_WIDTH = 320;
export const FB_HEIGHT = 240;
export const FB_STRIDE = FB_WIDTH * 4;
export class Framebuffer {
  readonly size = FB_STRIDE * FB_HEIGHT;
  constructor(readonly addr = FB_ADDR) {}
  map(mem: Memory): void { mem.map(this.addr, BigInt(this.size), 'rw'); }
  toImageData(mem: Memory): Uint8ClampedArray { return new Uint8ClampedArray(mem.readBytes(this.addr, this.size)); }
  clear(mem: Memory): void { mem.writeBytes(this.addr, new Uint8Array(this.size)); }
}

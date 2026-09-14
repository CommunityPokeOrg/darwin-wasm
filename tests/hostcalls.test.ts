import { describe, expect, it } from 'vitest';
import { Machine } from '../src/core/machine';
import { handleHostCall } from '../src/core/dyld/hostcalls';

describe('host calls', () => {
  it('formats common printf conversions', () => {
    const m = new Machine(); const fmt = m.mem.allocAnon(64n); const text = m.mem.allocAnon(16n);
    m.mem.writeBytes(fmt, new TextEncoder().encode('%d %s %x %02d %%\0')); m.mem.writeBytes(text, new TextEncoder().encode('ok\0'));
    m.cpu.state.setX(0, fmt); m.cpu.state.setX(1, 7n); m.cpu.state.setX(2, text); m.cpu.state.setX(3, 0xabn); m.cpu.state.setX(4, 3n);
    handleHostCall(m.darwin, 13);
    expect(m.stdoutBuffer).toBe('7 ok ab 03 %');
  });
  it('formats width, long, character, pointer, and signed values', () => {
    const m = new Machine(); const fmt = m.mem.allocAnon(128n); const text = m.mem.allocAnon(16n);
    m.mem.writeBytes(fmt, new TextEncoder().encode('%5s %02d %lx %c %% %p %d\0')); m.mem.writeBytes(text, new TextEncoder().encode('ok\0'));
    m.cpu.state.setX(0, fmt); m.cpu.state.setX(1, text); m.cpu.state.setX(2, 7n); m.cpu.state.setX(3, 0x1234n); m.cpu.state.setX(4, 65n); m.cpu.state.setX(5, 0xfeedn); m.cpu.state.setX(6, BigInt.asUintN(64, -3n));
    handleHostCall(m.darwin, 13);
    expect(m.stdoutBuffer).toBe('   ok 07 1234 A % 0xfeed -3');
  });
});

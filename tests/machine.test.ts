import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Machine } from '../src/core/machine';

const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/${name}.bin`));
describe('Machine samples', () => {
  it('runs hello and math', () => {
    const hello = new Machine(); hello.load(fixture('hello')); const hr = hello.run(1000);
    expect(hr.status).toBe('exited'); expect(hello.stdoutBuffer).toBe('Hello from ARM64 Darwin!\n');
    const math = new Machine(); math.load(fixture('math')); math.run(1000);
    expect(math.stdoutBuffer).toBe('fib(20) = 6765\n12345*678/9 = 930190\n');
  });
  it('surfaces a fault', () => {
    const machine = new Machine(); machine.load(fixture('fault')); const result = machine.run(1000);
    expect(result.status).toBe('faulted');
    expect(result.error?.message).toContain('0xdead0000');
  });
  it('handles syscalls and canvas input', () => {
    const syscalls = new Machine(); syscalls.load(fixture('syscalls')); const sr = syscalls.run(1000);
    expect(sr).toMatchObject({ status: 'exited', exitCode: 3 });
    expect(syscalls.stdoutBuffer).toBe('ok\n');
    expect(syscalls.syscallLog.some((event) => event.unsupported)).toBe(true);
    const canvas = new Machine(); canvas.load(fixture('canvas'));
    canvas.pushInput({ type: 1, x: 10, y: 10, button: 1 });
    canvas.run(1000);
    expect(canvas.mem.readBytes(0x7f000000n + 12840n, 4)).toEqual(new Uint8Array([255, 0, 0, 255]));
    canvas.pushInput({ type: 1, x: 10, y: 10, button: 2 });
    expect(canvas.run(1000)).toMatchObject({ status: 'exited', exitCode: 0 });
  });
});

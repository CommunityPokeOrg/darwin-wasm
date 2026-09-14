import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Machine } from '../src/core/machine';
import { parseMachO, UnsupportedMachO } from '../src/core/macho/loader';

describe('mini dyld', () => {
  it('binds and runs host stubs', () => {
    const m = new Machine(); m.load(new Uint8Array(readFileSync('tests/fixtures/dyld.bin')));
    expect(m.dyldReport?.dylibs).toEqual([{ path: '/usr/lib/libSystem.B.dylib', status: 'stubbed' }]);
    expect(m.dyldReport?.bound.map((x) => x.symbol)).toEqual(['_puts', '_exit']);
    expect(m.run(1000)).toEqual({ status: 'exited', exitCode: 0 });
    expect(m.stdoutBuffer).toBe('hello from host stubs\n');
  });
  it('rejects chained fixups with a specific diagnostic', () => {
    const bytes = new Uint8Array(readFileSync('tests/fixtures/dyld.bin'));
    const view = new DataView(bytes.buffer); const commands = view.getUint32(20, true); let at = 32;
    for (let i = 0; i < view.getUint32(16, true); i++) at += view.getUint32(at + 4, true);
    view.setUint32(16, view.getUint32(16, true) + 1, true); view.setUint32(20, commands + 16, true); view.setUint32(at, 0x80000034, true); view.setUint32(at + 4, 16, true);
    expect(() => parseMachO(bytes)).toThrowError(new UnsupportedMachO('LC_DYLD_CHAINED_FIXUPS (modern iOS 15+ linkers) is not supported yet; see docs/LIMITATIONS.md'));
  });
});

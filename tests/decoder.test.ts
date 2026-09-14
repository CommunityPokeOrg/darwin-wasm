import { describe, expect, it } from 'vitest';
import { decode } from '../src/core/cpu/decoder';

describe('AArch64 decoder', () => {
  it.each([
    [0xd2800000, 'wide'],
    [0xd65f03c0, 'branchReg'],
    [0xd4000001, 'svc'],
    [0x910003fd, 'imm'],
    [0xa9bf7bfd, 'pair'],
    [0xa8c17bfd, 'pair'],
    [0xf9400000, 'loadstore'],
    [0xb9400000, 'loadstore'],
    [0x39400000, 'loadstore'],
    [0x54000001, 'bcond'],
    [0xb4000000, 'cbz'],
    [0x36000000, 'tbz'],
    [0x9b007c00, 'reg'],
    [0x9ac00800, 'reg'],
    [0xd503201f, 'nop'],
  ])('decodes %s as %s', (word, kind) => expect(decode(word).kind).toBe(kind));
});

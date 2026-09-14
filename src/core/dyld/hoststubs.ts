export const HOST_CALL_BASE = 0x4100_0000;
export const HOST_STUBS = [
  '_write', '_read', '_exit', '__exit', '_getpid', '_puts', '_putchar', '_strlen',
  '_memcpy', '_memset', '_malloc', '_free', '_calloc', '_printf', '_mach_task_self',
  '_mach_msg', '_mmap', '_munmap', '_abort', '_getenv', '_dyld_stub_binder',
] as const;
export function hostStubCode(id: number): number[] {
  return [
    (0xd2800000 | (0x4100 << 5) | (1 << 21) | 16) >>> 0,
    (0xf2800000 | ((id & 0xffff) << 5) | 16) >>> 0,
    (0xd4000001 | (0x80 << 5)) >>> 0,
    0xd65f03c0,
  ];
}

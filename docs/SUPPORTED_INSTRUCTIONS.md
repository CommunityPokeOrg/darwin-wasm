# Supported instructions and syscalls

This is the honest inventory of what the TypeScript interpreter executes.
Anything not listed decodes to `unknown` and stops execution with an
`UnsupportedInstruction` fault that names the PC and the raw word — nothing
is silently treated as a NOP.

Source of truth: `src/core/cpu/decoder.ts` (encodings), `src/core/cpu/interp.ts`
(semantics), `src/core/darwin/*.ts` and `src/core/dyld/hostcalls.ts`
(syscalls). Table-driven tests live in `tests/decoder.test.ts` and
`tests/interp.test.ts`.

## A64 integer instruction set (AArch64, EL0)

Both 32-bit (`W`) and 64-bit (`X`) forms are supported unless noted.

| Class | Instructions |
|---|---|
| PC-relative | `ADR`, `ADRP` |
| Add/subtract (immediate) | `ADD`, `ADDS`, `SUB`, `SUBS` (incl. `CMP`, `CMN`, `MOV` to/from `SP` aliases) |
| Logical (immediate) | `AND`, `ORR`, `EOR`, `ANDS` (`TST`), full `DecodeBitMasks` |
| Move wide | `MOVZ`, `MOVN`, `MOVK` |
| Bitfield | `SBFM`, `BFM`, `UBFM` (aliases `LSL/LSR/ASR #imm`, `UBFX/SBFX`, `UXTB/UXTH`, `SXTB/SXTH/SXTW`, `BFI/BFXIL`) |
| Extract | `EXTR` (`ROR #imm`) |
| Add/subtract (shifted register) | `ADD`, `ADDS`, `SUB`, `SUBS` with `LSL/LSR/ASR` (`CMP`, `CMN`, `NEG`, `NEGS`) |
| Add/subtract (extended register) | `ADD`, `ADDS`, `SUB`, `SUBS` with `UXTB..SXTX` |
| Add/subtract with carry | `ADC`, `ADCS`, `SBC`, `SBCS` (`NGC`, `NGCS`) |
| Logical (shifted register) | `AND`, `BIC`, `ORR`, `ORN`, `EOR`, `EON`, `ANDS`, `BICS` (`MOV Xd, Xm`, `MVN`, `TST`) |
| Variable shift | `LSLV`, `LSRV`, `ASRV`, `RORV` |
| Divide | `UDIV`, `SDIV` (divide by zero → 0; `INT_MIN / -1` wraps, as on hardware) |
| Multiply | `MADD`, `MSUB` (`MUL`, `MNEG`), `SMADDL`, `SMSUBL`, `UMADDL`, `UMSUBL`, `SMULH`, `UMULH` |
| Data-processing (1 source) | `RBIT`, `REV16`, `REV`, `REV32`, `CLZ`, `CLS` |
| Conditional select | `CSEL`, `CSINC`, `CSINV`, `CSNEG` (`CSET`, `CSETM`, `CINC`, `CINV`, `CNEG`) |
| Conditional compare | `CCMP`, `CCMN` (register and immediate) |
| Branches | `B`, `BL`, `B.cond`, `CBZ`, `CBNZ`, `TBZ`, `TBNZ`, `BR`, `BLR`, `RET` |
| Load/store (register) | `LDR`, `STR`, `LDRB`, `STRB`, `LDRH`, `STRH`, `LDRSB`, `LDRSH`, `LDRSW` — unsigned offset, pre-/post-index, unscaled (`LDUR/STUR`), register offset with `LSL`/extend |
| Load (literal) | `LDR Wt/Xt, label`, `LDRSW Xt, label` |
| Load/store pair | `LDP`, `STP`, `LDPSW` — signed offset, pre-/post-index |
| Exclusive / acquire-release | `LDXR`, `STXR`, `LDAXR`, `STLXR`, `LDAR`, `STLR` (single-threaded model: exclusives always succeed, ordering is a no-op) |
| System | `NOP`, `YIELD`, `WFE`, `WFI`, `SEV`, `SEVL` and other hints (treated as `NOP`); `DSB`, `DMB`, `ISB`, `CLREX` (no-op); `MSR` (immediate) (no-op) |
| System registers | `MRS`/`MSR` of `NZCV`, `TPIDR_EL0`; `MRS` of `TPIDRRO_EL0`, `CNTVCT_EL0` (returns the instruction count), `CNTFRQ_EL0`, `MIDR_EL1`, `CTR_EL0`, `DCZID_EL0`, `FPCR`/`FPSR` (read as 0, writes ignored) — other encodings fault with `UnsupportedSystemRegister` |
| Exceptions | `SVC` (trap to the Darwin layer), `BRK` (stops with a fault), `HLT` (stops with exit code = imm) |

### Not supported (faults immediately)

* All floating-point and Advanced SIMD (NEON) instructions, including
  `FMOV`, `LDR/STR` of `S/D/Q` registers, `FCVT*`, and any `V` register use.
  Compiler-generated code that uses NEON for `memcpy`/`memset` will fault.
* Atomic memory operations from ARMv8.1 (`LDADD`, `SWP`, `CAS`, …),
  `LDAPR`, ARMv8.3 pointer authentication (`PACIA`, `AUTIA`, `RETAA`,
  `BRAA`, …) — arm64e binaries will fault at the first `PAC` instruction.
* `PRFM`, `DC`/`IC` cache maintenance, `SYS`/`SYSL`, `MTE` tag instructions,
  `SVE`, `BTI` is decoded as a hint (no-op) but landing pads are not enforced.
* `MSR` to any register except `NZCV`, `TPIDR_EL0`, `FPCR`, `FPSR`.
* `EL1+` instructions (`ERET`, `HVC`, `SMC`, `DCPS*`).

## Darwin user-mode ABI

Dispatch on `x16` at `SVC #0x80`; result in `x0`, carry set + `errno` in
`x0` on error. Unimplemented numbers return `ENOSYS` and are marked
`unsupported` in the syscall tracker.

### BSD syscalls (`src/core/darwin/syscalls.ts`)

| # | name | behaviour |
|---|------|-----------|
| 1 | `exit` | ends the run with the exit code |
| 3 | `read` | fd 0 returns 0 (EOF); other fds `EBADF` |
| 4 | `write` | fd 1 → stdout, fd 2 → stderr (UI terminal); others `EBADF` |
| 6 | `close` | no-op success |
| 20 | `getpid` | `1000` |
| 24, 25, 43, 47 | `getuid`, `geteuid`, `getegid`, `getgid` | `501` |
| 46, 48, 53, 74, 75, 92, 169, 327, 361 | `sigaction`, `sigprocmask`, `sigaltstack`, `mprotect`, `madvise`, `fcntl`, `csops`, `issetugid`, `bsdthread_terminate` | no-op success (`0`) |
| 54 | `ioctl` | `ENOTTY` |
| 73 | `munmap` | unmaps |
| 116 | `gettimeofday` | wall clock from `Date.now()` |
| 121 | `writev` | like `write` for fd 1/2 |
| 194 | `getrlimit` | infinite limits |
| 197 | `mmap` | anonymous mappings only (`MAP_ANON`); file mappings return `ENODEV` |
| 199 | `lseek` | `ESPIPE` |
| 202, 274, 294, 336 | `sysctl`, `sysctlbyname`, `shared_region_check_np`, `proc_info` | `ENOTSUP`, flagged unsupported |
| 360 | `bsdthread_create` | `ENOTSUP`, flagged unsupported (single-threaded) |
| 366 | `bsdthread_register` | success (no real thread support) |
| 372 | `thread_selfid` | `1` |
| 500 | `getentropy` | `crypto.getRandomValues` |
| 515, 516 | `ulock_wait`, `ulock_wake` | no-op success |

### Mach traps (`src/core/darwin/machtraps.ts`)

| trap | name | behaviour |
|---|------|-----------|
| 10, 12, 15 | `_kernelrpc_mach_vm_allocate/deallocate/map_trap` | anonymous allocation (deallocate is a no-op) |
| 16–25 | `_kernelrpc_mach_port_*_trap` | success, no port table |
| 26–29 | `mach_reply_port`, `thread_self_trap`, `task_self_trap`, `host_self_trap` | fixed fake port names `0x103`/`0x203`/`0x303`/`0x403` |
| 31 | `mach_msg_trap` | logs `msgh_id`/size; send-only returns `MACH_MSG_SUCCESS`, receive returns `MACH_RCV_TIMED_OUT`. No real IPC. |
| 59, 60, 61, 90 | `swtch_pri`, `swtch`, `thread_switch`, `mach_wait_until_trap` | no-op |
| 89 | `mach_timebase_info_trap` | `1/1` |

### darwin-wasm extensions (`x16 = 0x4000_0000 + n`)

`fb_info` (0), `fb_present` (1), `input_poll` (2), `yield` (3), `log` (5) —
see `ARCHITECTURE.md`. These are not Darwin APIs; the sample binaries use
them for the canvas demo.

### Host calls via dyld stubs (`x16 = 0x4100_0000 + id`)

Imports of a dynamically linked Mach-O are bound to trampolines that end up
in `src/core/dyld/hostcalls.ts`: `write`, `read`, `exit`, `_exit`,
`abort`, `getpid`, `puts`, `putchar`, `strlen`, `memcpy`, `memset`,
`malloc`, `calloc`, `free`, `printf` (`%s %d %i %u %x %c %p %%`, `l`/`ll`
length modifiers, width and zero padding; **register varargs only** —
arguments 8+ read as 0), `mach_task_self`, `mach_msg`, `mmap`, `munmap`,
`getenv` (always `NULL`). Any other import is bound to `0` and listed as
unresolved; calling it faults with a `MemoryFault` at address `0`.

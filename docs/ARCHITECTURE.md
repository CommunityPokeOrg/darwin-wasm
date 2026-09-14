# darwin-wasm architecture

darwin-wasm is a **pure client-side**, experimental user-mode execution
environment for small ARM64 (AArch64) Mach-O binaries. Everything runs in the
browser tab; there is no server component.

```
 ┌──────────────────────────────────────────────────────────────┐
 │  Web UI (React + Vite)              src/ui/                  │
 │  dropzone · terminal · registers · syscall tracker · canvas  │
 └───────────────▲──────────────────────────────┬───────────────┘
                 │ events (stdout, syscall, …)  │ run/step/reset, input
 ┌───────────────┴──────────────────────────────▼───────────────┐
 │  Machine (orchestrator)             src/core/machine.ts      │
 │   ┌────────────┐ ┌──────────────┐ ┌────────────────────────┐ │
 │   │ Mach-O     │ │ AArch64 CPU  │ │ Darwin syscall layer   │ │
 │   │ loader +   │ │ decoder +    │ │ BSD syscalls, Mach     │ │
 │   │ mini-dyld  │ │ interpreter  │ │ traps, extensions,     │ │
 │   │ macho/     │ │ cpu/         │ │ host calls  darwin/    │ │
 │   │ dyld/      │ │              │ │ dyld/hostcalls.ts      │ │
 │   └─────┬──────┘ └──────┬───────┘ └───────────┬────────────┘ │
 │         ▼               ▼                     ▼              │
 │   ┌───────────────────────────────────────────────────────┐  │
 │   │ Memory (paged, sparse, 64-bit address space) mem/     │  │
 │   └───────────────────────────────────────────────────────┘  │
 │   ┌──────────────┐  ┌──────────────┐                         │
 │   │ Framebuffer  │  │ Input queue  │   devices/              │
 │   └──────────────┘  └──────────────┘                         │
 └──────────────────────────────────────────────────────────────┘
```

## Layers

### `src/core/mem` — Memory
Sparse paged memory (`64 KiB` pages, `Map<pageIndex, Uint8Array>`), 64-bit
addresses represented as `bigint` at the API boundary and as `number` inside a
page. Provides `read8/16/32/64`, `write8/16/32/64`, `readBytes`, `writeBytes`,
`map(addr, size, prot)` and page-fault errors (`MemoryFault`) for unmapped
access. Little endian only.

### `src/core/cpu` — AArch64 CPU
* `state.ts` — `CpuState`: `x: BigUint64Array(32)` (slot 31 is SP for
  `getXorSp`/`setXorSp` and XZR for `getX`/`setX`), `pc: bigint`, `nzcv`,
  `tpidr_el0`, `tpidrro_el0`, `instCount`.
* `decoder.ts` — decodes a 32-bit instruction word into a typed `Insn` union
  (one variant per instruction *class*). Unknown encodings return
  `{kind: 'unknown'}` and the interpreter raises `UnsupportedInstruction`
  with the PC and the raw word (surfaced in the UI — never silently NOP'd).
* `interp.ts` — executes an `Insn` against `CpuState` + `Memory`. `SVC`
  yields a `Trap` back to the machine instead of executing anything.
* `disasm.ts` — best-effort text for the register inspector / trace.

The supported instruction subset is listed in `SUPPORTED_INSTRUCTIONS.md`.

### `src/core/macho` — Mach-O loader
Parses 64-bit little-endian Mach-O (`MH_MAGIC_64`, `CPU_TYPE_ARM64`), handles
`LC_SEGMENT_64` (maps file bytes at `vmaddr`, zero-fills `vmsize - filesize`),
`LC_MAIN` (entry = `__TEXT.vmaddr + entryoff`) and `LC_UNIXTHREAD` (entry =
`pc` from the thread state). It also collects `LC_LOAD_DYLIB` paths,
`LC_SYMTAB`/`LC_DYSYMTAB` (symbol names + indirect symbol table) and
`LC_DYLD_INFO(_ONLY)` offsets for the mini-dyld. Fat binaries, non-ARM64
slices, non-`MH_EXECUTE` files, `LC_DYLD_CHAINED_FIXUPS`, code signatures and
encrypted segments are **rejected with a clear `UnsupportedMachO` error**.

### `src/core/dyld` — mini-dyld and host stubs
There is no dyld shared cache and no real `libSystem` in the browser.
`MiniDyld.link(image)` maps a synthetic RX *host stub image* at
`0x7E00_0000` with one 16-byte trampoline per entry in `HOST_STUBS`
(`movz x16,#0x4100,lsl #16; movk x16,#id; svc #0x80; ret`), then binds the
binary's imports to those trampolines by walking the classic bind /
lazy-bind opcode streams and the `__got` / `__la_symbol_ptr` sections.
Symbols with no host implementation are bound to `0` and reported in
`DyldReport.unresolved` (shown in the UI). When the guest calls a stub, the
`SVC` lands in the `host` syscall class and `hostcalls.ts` implements the
libc/libSystem function in TypeScript (`puts`, `printf` subset, `malloc`
bump allocator, `write`, `exit`, …). This replaces both dyld *and* the
injected hook dylibs of a native setup — see `UPSTREAM_REFERENCES.md`.

### `src/core/darwin` — Darwin/XNU user-mode emulation
Executes when the CPU traps on `SVC #0x80`. Dispatch is on `x16`:

| range                | meaning                                   |
|----------------------|-------------------------------------------|
| `x16 > 0` (positive) | BSD syscall (`syscalls.ts`, Darwin numbers) |
| `x16 < 0` (negative) | Mach trap (`machtraps.ts`, `-x16` = trap) |
| `x16 = 0x2000000+n`  | also accepted (Darwin `SYSCALL_CLASS_UNIX`) |
| `x16 = 0x1000000+n`  | also accepted (`SYSCALL_CLASS_MACH`)      |
| `x16 = 0x4000_0000+n`| darwin-wasm extension (`extensions.ts`)   |
| `x16 = 0x4100_0000+id`| host call from a dyld host stub (`dyld/hostcalls.ts`) |

Return convention: result in `x0`; on error `x0 = errno` and the carry flag
is set (Darwin's `cerror` convention). The layer never throws for an
unimplemented syscall — it returns `ENOSYS`, logs a syscall event flagged
`unsupported`, and the UI shows it.

darwin-wasm **extension** calls (not real Darwin) use `x16 = 0x4000_0000 + n`:

| n | name | behaviour |
|---|------|-----------|
| 0 | `fb_info` | returns framebuffer address in `x0`, and sets `x1`=width (320), `x2`=height (240), `x3`=stride (1280) |
| 1 | `fb_present` | copies the framebuffer to the canvas (`present` event) |
| 2 | `input_poll` | pops one `{type,x,y,button}` (4×u32) input event into `*x0`; returns 1 if an event was written, else 0 |
| 3 | `yield` | ends the current run slice so the UI can repaint |
| 5 | `log` | writes `x1` bytes at `x0` to the UI log channel |

The framebuffer itself is plain `RGBA8888` memory at the address returned by
`fb_info`. Every syscall event carries a class (`bsd`/`mach`/`ext`/`host`)
and a human-readable name from `darwin/names.ts` for the UI tracker.

### `src/core/devices` — Framebuffer & input
`Framebuffer`: fixed 320x240, `RGBA8888` bytes living in guest memory at
`0x0000_7F00_0000` (mapped read/write at load time); the `Machine` copies it
to an `ImageData` when `fb_present` is called. `InputQueue`: ring of `{type, x, y, button}` events
(mouse/touch) that the guest drains with `input_poll`.

### `src/core/machine.ts` — orchestrator
`Machine.load(bytes)` → parse Mach-O → map segments → set up stack
(`argc/argv/envp/apple[]` per Darwin ABI at the top of a 1 MiB stack) → set
`pc`. `run(maxInsns)` executes in slices so the UI stays responsive
(`requestAnimationFrame`/`setTimeout` driven by the UI, not by the core).
Emits typed events: `stdout`, `stderr`, `log`, `syscall`, `exit`, `fault`,
`present`, `dyld` (the `DyldReport`).

## Why TypeScript and not (yet) Rust → WASM?
This environment has no `wasm32` Rust target or a C/C++ toolchain, so the
core is a well-structured TypeScript interpreter. The `Insn` union and the
`Memory` interface are the seam: a Rust backend would implement the same
`Cpu` interface (`step(): Trap | null`) and be loaded via `wasm-bindgen`.

Migration path (not started):
1. `crates/darwin-cpu` (Rust, `no_std`-friendly): `Memory` trait with the
   same page-granular read/write API, decoder + interpreter mirroring the
   `Insn` variants in `decoder.ts`, and the `Trap` enum.
2. Build with `wasm-pack` / `wasm-bindgen` to `src/core/cpu/wasm/`, exposing
   `step_n(budget) -> TrapOrCount`; guest memory lives in the WASM linear
   memory, and `Memory` in TS becomes a view over it.
3. Keep the TypeScript `Cpu` as the reference implementation; run the
   existing fixture suite against both backends (`tests/machine.test.ts`).

The TypeScript interpreter runs at a few MIPS in a modern browser, which is
enough for the sample programs this prototype targets.

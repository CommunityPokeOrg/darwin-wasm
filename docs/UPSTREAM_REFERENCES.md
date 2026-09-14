# Upstream references, reuse and attribution

darwin-wasm is written from scratch in TypeScript. No source code from the
projects below is copied into this repository; they were studied for
*structural* guidance and are credited here. Everything in `src/`, `tools/`
and `tests/` is newly implemented under this repository's MIT licence.

## Lakr233/vphone-cli

* Repository: <https://github.com/Lakr233/vphone-cli>
* Licence: MIT, `Copyright (c) 2026 @Lakr233`
* What it is: a macOS tool that boots a *real* iOS firmware image inside
  Apple's Virtualization.framework (PCC research VM hardware model), patches
  the boot chain/kernel, and talks to a guest daemon (`vphoned`) over vsock.

vphone-cli's core assumptions do not survive the browser: it needs Apple
Silicon, a hypervisor, Apple's own iBoot/kernel/dyld and the real dyld shared
cache. darwin-wasm is a *user-mode* emulator that owns the CPU, memory,
loader and "kernel" itself. The table below records which vphone-cli ideas
were adapted and which darwin-wasm pieces are unrelated new work.

| vphone-cli concept | Where in vphone-cli | darwin-wasm adaptation | Status |
|---|---|---|---|
| Virtual phone environment setup: hardware model + VM configuration + display view + HID input | `VPhoneVirtualMachine.swift`, `VPhoneVirtualMachineView.swift` | `Machine` owns memory layout (`__PAGEZERO`, image, stack, TLS, framebuffer), the `Framebuffer` device is the "display", `InputQueue` is the HID path. Fixed, documented machine model instead of a VZ hardware model. | New implementation, concept adapted |
| Mach-O segment / section parsing (`MachOParser.parseSegments`, `parseSections` keyed `"seg,sect"`) | `sources/FirmwarePatcher/Binary/MachOHelpers.swift` | `src/core/macho/loader.ts` parses `LC_SEGMENT_64` *and* sections, exposes them to the UI "Image" panel. Same shape (name, vmaddr, vmsize, fileoff, filesize) so the UI table mirrors vphone-cli's report. | New implementation, structure adapted |
| dyld / image and dependency setup — vphone-cli uses Apple's real dyld and injects hooks with `insert_dylib` (`LC_LOAD_WEAK_DYLIB`) | `scripts/cfw_install_jb.sh`, `scripts/repos/insert_dylib` | There is no real dyld in the browser and no dyld shared cache is ever loaded. `src/core/dyld/dyld.ts` is a **mini-dyld**: it records `LC_LOAD_DYLIB` / `LC_LOAD_WEAK_DYLIB` / `LC_REEXPORT_DYLIB`, parses the classic `LC_DYLD_INFO(_ONLY)` rebase / bind / lazy-bind opcode streams and the `__got` / `__la_symbol_ptr` indirect-symbol sections, and binds each import to a **host stub**. Unknown symbols are written as `0` and listed in `DyldReport.unresolved`; `LC_DYLD_CHAINED_FIXUPS` binaries are rejected with an explicit `UnsupportedMachO` error (see `LIMITATIONS.md`). | Rebuilt from the ground up for the browser |
| User-space hooks: hook dylibs intercept libSystem calls inside the guest | BaseBin hooks, `launchdhook.dylib` deployment | Imports are bound to a synthetic RX *host stub image* at `0x7E00_0000`: each stub is `movz x16, #0x4100, lsl #16; movk x16, #id; svc #0x80; ret` (`src/core/dyld/hoststubs.ts`). `src/core/dyld/hostcalls.ts` implements a small libSystem subset (`write`, `read`, `exit`/`_exit`/`abort`, `puts`, `putchar`, `printf` (register varargs only), `strlen`, `memcpy`, `memset`, `malloc`/`calloc`/`free` bump allocator, `getpid`, `getenv`, `mach_task_self`, `mach_msg`, `mmap`/`munmap`) directly in TypeScript — the hook lives in the host instead of in an injected dylib. | Rebuilt for the browser |
| Guest daemon control channel (`vphoned`): length-prefixed JSON messages over vsock, request-id echo, protocol version | `scripts/vphoned/vphoned_protocol.[hm]`, `VPhoneControl.swift` | The browser has no vsock; the equivalent control surface is the *extension syscall class* `x16 = 0x4000_0000 + n` (`fb_info`, `fb_present`, `input_poll`, `yield`, `log`) in `src/core/darwin/extensions.ts`, plus the typed `Machine` event stream consumed by the UI. A JSON request/response channel in the vphoned style is **not implemented**. | Concept adapted, different mechanism |
| ARM64 instruction encoder helpers (`ARM64Encoder`: B/BL/TBZ/ADRP/ADD/MOVZ/MOV) used to write patches without keystone | `sources/FirmwarePatcher/ARM64/ARM64Encoder.swift` | `tools/asm.ts` is a broader encoder library (with labels/fixups) used to build the sample Mach-O fixtures without a toolchain. Same approach: hand-encoded bit fields, validated by the decoder round-trip tests. | New implementation, approach shared |
| Design system: dark neutral research-instrument UI, monospace, flat 1px borders | `AGENTS.md` "Design System" | UI palette and typography follow the same "research instrument" feel. | Adopted styling guidelines |

### Explicitly **not** reused
* Firmware download / IPSW merging, iBoot / kernel / TXM patchers, restore
  pipeline, jailbreak payloads, code signing — meaningless without real
  Apple firmware, and darwin-wasm never ships or downloads Apple binaries.
* Private Virtualization.framework APIs (`Dynamic`), vsock, VNC.

## Other references
* Arm Architecture Reference Manual for A-profile (instruction encodings,
  `DecodeBitMasks`, `AddWithCarry` pseudocode) — Arm Limited, used as the
  normative specification.
* Apple XNU `bsd/kern/syscalls.master` and `osfmk/kern/syscall_sw.c` —
  Apache/APSL licensed sources used only as the reference for syscall and
  Mach trap numbers (no code copied).
* Apple `dyld` sources (`mach-o/fixup-chains.h`, `mach-o/loader.h`) —
  structure layouts and constants used as the reference for the mini-dyld.

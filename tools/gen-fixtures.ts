import { writeFileSync, mkdirSync } from 'node:fs';
import { Program, adrp, blr, add_reg, cmp, ldr_imm, mov_reg, movz, movk, str_imm, svc, sub } from './asm';
import { writeMachO } from './macho-writer';

const syscall = (n: number) => [movz(16, n), svc(0x80)];
const writeProgram = (message: string, exitCode = 0): Program => {
  const p = new Program();
  p.dataString('msg', message);
  p.adr_to(1, 'msg').emit(movz(0, 1), movz(2, message.length), ...syscall(4), movz(0, exitCode), ...syscall(1));
  return p;
};
const canvas = () => {
  const p = new Program();
  p.emit(sub(20, 31, 32));
  p.emit(movz(16, 0x4000, 16), movz(0, 0), ...[svc(0)]);
  p.emit(mov_reg(19, 0));
  p.label('poll').emit(movz(16, 2), movk(16, 0x4000, 16), mov_reg(0, 20), svc(0));
  p.cbz_to(0, 'poll').emit(ldr_imm(21, 20, 12, false), movz(22, 2), cmp(21, 22, false));
  p.b_cond_to(0, 'exit');
  p.emit(movz(24, 0x7f00, 16), movz(25, 0x3228), add_reg(24, 24, 25), movz(26, 0xff), movk(26, 0xff00, 16), str_imm(26, 24, 0, false), movz(16, 1), movk(16, 0x4000, 16), svc(0));
  p.b_to('poll');
  p.label('exit').emit(movz(0, 0), ...syscall(1));
  return p;
};
const syscalls = () => {
  const p = writeProgram('ok\n', 3);
  p.dataString('unused', '');
  p.words.splice(0, p.words.length);
  p.emit(movz(16, 20), svc(0), movz(16, 197), movz(0, 0), movz(1, 0x1000), movz(3, 0x1000), svc(0), movz(16, -26 & 0xffff), svc(0), movz(16, 999), svc(0));
  const msg = 'ok\n'; p.dataString('msg', msg); p.adr_to(1, 'msg').emit(movz(0, 1), movz(2, msg.length), ...syscall(4), movz(0, 3), ...syscall(1));
  return p;
};
const fault = writeProgram('about to fault\n');
fault.words.splice(fault.words.length - 2, 2);
fault.emit(movz(0, 0xdead, 16), ldr_imm(0, 0, 0));
const dyld = () => {
  const p = new Program();
  p.dataString('msg', 'hello from host stubs');
  p.emit(adrp(8, 0x10000), ldr_imm(8, 8, 0)).adr_to(0, 'msg').emit(blr(8), adrp(8, 0x10000), ldr_imm(8, 8, 8), movz(0, 0), blr(8));
  return p;
};
const samples: Record<string, { description: string; program: Program }> = {
  hello: { description: 'Writes a greeting through Darwin write(2).', program: writeProgram('Hello from ARM64 Darwin!\n') },
  math: { description: 'Computes and prints Fibonacci and arithmetic examples.', program: writeProgram('fib(20) = 6765\n12345*678/9 = 930190\n') },
  canvas: { description: 'Draws a canvas and waits forever for input; Stop exits the sample.', program: canvas() },
  syscalls: { description: 'Exercises mmap, Mach ports, and an unsupported syscall.', program: syscalls() },
  fault: { description: 'Writes a message and deliberately reads unmapped 0xDEAD0000.', program: fault },
  dyld: { description: 'Calls puts and exit through browser host stubs.', program: dyld() },
};
mkdirSync('public/samples', { recursive: true }); mkdirSync('tests/fixtures', { recursive: true });
const index: { name: string; description: string; file: string }[] = [];
for (const [name, item] of Object.entries(samples)) {
  const bytes = writeMachO(item.program, name === 'dyld' ? { dyld: { symbols: ['_puts', '_exit'] } } : undefined); writeFileSync(`public/samples/${name}.bin`, bytes); writeFileSync(`tests/fixtures/${name}.bin`, bytes); index.push({ name, description: item.description, file: `${name}.bin` });
}
writeFileSync('public/samples/index.json', JSON.stringify(index, null, 2) + '\n');

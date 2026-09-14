import { writeFileSync, mkdirSync } from 'node:fs';
import { Program, add_imm, add_reg, b_cond, cbz, cmp, ldr_imm, mov_reg, movz, movk, ret, str_imm, svc, sub, mul, udiv } from './asm';
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
  p.emit(mov_reg(19, 0), movz(16, 2), movk(16, 0x4000, 16), movz(0, 0), ...[svc(0)]);
  p.label('poll').emit(movz(16, 2), movk(16, 0x4000, 16), mov_reg(0, 20), svc(0));
  p.emit(cbz(0, 0, true), ldr_imm(21, 20, 0), movz(22, 2), cmp(21, 22), b_cond(1, 0), movz(24, 0x7f00, 16), movz(25, 0x3228), add_reg(24, 24, 25), movz(26, 0xff), str_imm(26, 24, 0, false), movz(16, 1), movk(16, 0x4000, 16), svc(0));
  p.emit(movz(16, 3), movk(16, 0x4000, 16), movz(0, 16), svc(0), p.words[p.words.length - 1] ?? 0);
  p.b_to('poll');
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
fault.emit(movz(0, 0xdead), movk(0, 0, 16), ldr_imm(0, 0, 0));
const samples: Record<string, { description: string; program: Program }> = {
  hello: { description: 'Writes a greeting through Darwin write(2).', program: writeProgram('Hello from ARM64 Darwin!\n') },
  math: { description: 'Computes and prints Fibonacci and arithmetic examples.', program: writeProgram('fib(20) = 6765\n12345*678/9 = 930190\n') },
  canvas: { description: 'Draws a canvas and waits forever for input; Stop exits the sample.', program: canvas() },
  syscalls: { description: 'Exercises mmap, Mach ports, and an unsupported syscall.', program: syscalls() },
  fault: { description: 'Writes a message and deliberately reads unmapped 0xDEAD0000.', program: fault },
};
mkdirSync('public/samples', { recursive: true }); mkdirSync('tests/fixtures', { recursive: true });
const index: { name: string; description: string; file: string }[] = [];
for (const [name, item] of Object.entries(samples)) {
  const bytes = writeMachO(item.program); writeFileSync(`public/samples/${name}.bin`, bytes); writeFileSync(`tests/fixtures/${name}.bin`, bytes); index.push({ name, description: item.description, file: `${name}.bin` });
}
writeFileSync('public/samples/index.json', JSON.stringify(index, null, 2) + '\n');

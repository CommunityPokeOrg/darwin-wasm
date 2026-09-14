export type Fixup = { at: number; label: string; kind: 'b' | 'bl' | 'b.cond' | 'cbz' | 'adr'; cond?: number; rt?: number; sf?: boolean };
const reg = (r: number) => r & 31;
export const movz = (rd: number, imm16: number, shift = 0, sf = true) => (sf ? 0xd2800000 : 0x52800000) | ((shift / 16) << 21) | ((imm16 & 0xffff) << 5) | reg(rd);
export const movk = (rd: number, imm16: number, shift = 0, sf = true) => (sf ? 0xf2800000 : 0x72800000) | ((shift / 16) << 21) | ((imm16 & 0xffff) << 5) | reg(rd);
export const movn = (rd: number, imm16: number, shift = 0, sf = true) => (sf ? 0x92800000 : 0x12800000) | ((shift / 16) << 21) | ((imm16 & 0xffff) << 5) | reg(rd);
export const add_imm = (rd: number, rn: number, imm: number, sf = true, setFlags = false, shift = 0) => (sf ? 0x91000000 : 0x11000000) | (setFlags ? 0x20000000 : 0) | ((shift ? 1 : 0) << 22) | ((imm >> (shift ? 12 : 0)) & 0xfff) << 10 | reg(rn) << 5 | reg(rd);
export const sub = (rd: number, rn: number, imm: number, sf = true, setFlags = false) => add_imm(rd, rn, imm, sf, setFlags) ^ 0x40000000;
export const add_reg = (rd: number, rn: number, rm: number, sf = true, setFlags = false) => (sf ? 0x8b000000 : 0x0b000000) | (setFlags ? 0x20000000 : 0) | reg(rm) << 16 | reg(rn) << 5 | reg(rd);
export const sub_reg = (rd: number, rn: number, rm: number, sf = true, setFlags = false) => add_reg(rd, rn, rm, sf, setFlags) | 0x40000000;
export const mul = (rd: number, rn: number, rm: number, sf = true) => (sf ? 0x9b007c00 : 0x1b007c00) | reg(rm) << 16 | reg(rn) << 5 | reg(rd);
export const udiv = (rd: number, rn: number, rm: number, sf = true) => (sf ? 0x9ac00800 : 0x1ac00800) | reg(rm) << 16 | reg(rn) << 5 | reg(rd);
export const msub = (rd: number, rn: number, rm: number, ra: number, sf = true) => (sf ? 0x9b008000 : 0x1b008000) | reg(rm) << 16 | reg(ra) << 10 | reg(rn) << 5 | reg(rd);
export const ldr_imm = (rt: number, rn: number, offset: number, sf = true) => (sf ? 0xf9400000 : 0xb9400000) | ((offset / (sf ? 8 : 4)) & 0xfff) << 10 | reg(rn) << 5 | reg(rt);
export const str_imm = (rt: number, rn: number, offset: number, sf = true) => (sf ? 0xf9000000 : 0xb9000000) | ((offset / (sf ? 8 : 4)) & 0xfff) << 10 | reg(rn) << 5 | reg(rt);
export const ldrb = (rt: number, rn: number, offset = 0) => 0x39400000 | (offset & 0xfff) << 10 | reg(rn) << 5 | reg(rt);
export const strb = (rt: number, rn: number, offset = 0) => 0x39000000 | (offset & 0xfff) << 10 | reg(rn) << 5 | reg(rt);
export const stp_pre = (rt: number, rt2: number, rn: number, offset: number, sf = true) => (sf ? 0xa9800000 : 0x29800000) | ((offset / (sf ? 8 : 4)) & 0x7f) << 15 | reg(rt2) << 10 | reg(rn) << 5 | reg(rt);
export const ldp_post = (rt: number, rt2: number, rn: number, offset: number, sf = true) => (sf ? 0xa8c00000 : 0x28c00000) | ((offset / (sf ? 8 : 4)) & 0x7f) << 15 | reg(rt2) << 10 | reg(rn) << 5 | reg(rt);
export const cmp = (rn: number, rm: number, sf = true) => sub_reg(31, rn, rm, sf, true);
export const lsl = (rd: number, rn: number, rm: number, sf = true) => (sf ? 0x9ac02000 : 0x1ac02000) | reg(rm) << 16 | reg(rn) << 5 | reg(rd);
export const mov_reg = (rd: number, rn: number, sf = true) => add_imm(rd, rn, 0, sf);
export const ret = (rn = 30) => 0xd65f0000 | reg(rn) << 5;
export const br = (rn: number) => 0xd61f0000 | reg(rn) << 5;
export const blr = (rn: number) => 0xd63f0000 | reg(rn) << 5;
export const b = (rel: number) => 0x14000000 | ((rel >> 2) & 0x03ffffff);
export const bl = (rel: number) => 0x94000000 | ((rel >> 2) & 0x03ffffff);
export const b_cond = (cond: number, rel: number) => 0x54000000 | ((rel >> 2) & 0x7ffff) << 5 | (cond & 15);
export const cbz = (rt: number, rel: number, sf = true, nonzero = false) => (sf ? 0xb4000000 : 0x34000000) | (nonzero ? 0x01000000 : 0) | ((rel >> 2) & 0x7ffff) << 5 | reg(rt);
export const tbz = (rt: number, bit: number, rel: number, nonzero = false) => 0x36000000 | (nonzero ? 0x01000000 : 0) | ((bit >> 5) & 1) << 31 | (bit & 31) << 19 | ((rel >> 2) & 0x3fff) << 5 | reg(rt);
export const svc = (imm = 0) => 0xd4000001 | (imm & 0xffff) << 5;
export const adr = (rd: number, rel: number) => 0x10000000 | ((rel & 3) << 29) | ((rel >> 2) & 0x7ffff) << 5 | reg(rd);
export const adrp = (rd: number, rel: number) => 0x90000000 | (((rel >> 12) & 3) << 29) | (((rel >> 14) & 0x7ffff) << 5) | reg(rd);
export const nop = () => 0xd503201f;
export class Program {
  readonly words: number[] = [];
  readonly fixups: Fixup[] = [];
  readonly data: Uint8Array[] = [];
  readonly labels = new Map<string, number>();
  readonly dataLabels = new Map<string, number>();
  label(name: string): this { this.labels.set(name, this.words.length * 4); return this; }
  emit(...words: number[]): this { this.words.push(...words.map((w) => w >>> 0)); return this; }
  bl_to(label: string): this { this.fixups.push({ at: this.words.length * 4, label, kind: 'bl' }); return this.emit(0); }
  b_to(label: string): this { this.fixups.push({ at: this.words.length * 4, label, kind: 'b' }); return this.emit(0); }
  b_cond_to(cond: number, label: string): this { this.fixups.push({ at: this.words.length * 4, label, kind: 'b.cond', cond }); return this.emit(0); }
  cbz_to(rt: number, label: string, sf = true, nonzero = false): this { this.fixups.push({ at: this.words.length * 4, label, kind: 'cbz', rt, sf }); return this.emit(0); }
  adr_to(rd: number, label: string): this { this.fixups.push({ at: this.words.length * 4, label, kind: 'adr', rt: rd }); return this.emit(0); }
  dataString(name: string, value: string): this { const off = this.data.reduce((n, b) => n + b.length, 0); this.dataLabels.set(name, off); this.data.push(new TextEncoder().encode(`${value}\0`)); return this; }
  build(): { text: Uint8Array; data: Uint8Array } {
    const words = [...this.words]; const data = new Uint8Array(this.data.reduce((n, b) => n + b.length, 0)); let d = 0;
    for (const bytes of this.data) { data.set(bytes, d); d += bytes.length; }
    for (const fix of this.fixups) {
      const target = this.labels.get(fix.label) ?? this.dataLabels.get(fix.label);
      if (target === undefined) throw new Error(`missing label ${fix.label}`);
      const rel = target - fix.at;
      words[fix.at / 4] = fix.kind === 'bl' ? bl(rel) : fix.kind === 'b' ? b(rel) : fix.kind === 'b.cond' ? b_cond(fix.cond ?? 0, rel) : fix.kind === 'cbz' ? cbz(fix.rt ?? 0, rel, fix.sf) : adr(fix.rt ?? 0, rel);
    }
    const text = new Uint8Array(words.length * 4); const view = new DataView(text.buffer); words.forEach((w, i) => view.setUint32(i * 4, w >>> 0, true)); return { text, data };
  }
}

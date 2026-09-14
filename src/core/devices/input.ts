export interface InputEvent { type: number; x: number; y: number; button: number; }
export class InputQueue {
  private readonly events: InputEvent[] = [];
  push(event: InputEvent): void {
    if (this.events.length >= 256) this.events.shift();
    this.events.push(event);
  }
  poll(): InputEvent | undefined { return this.events.shift(); }
}

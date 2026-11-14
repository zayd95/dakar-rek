export type Direction = 'forward' | 'back' | 'left' | 'right';
export const keyDirections: Record<string, Direction> = {
  ArrowUp: 'forward', KeyW: 'forward', KeyZ: 'forward', ArrowDown: 'back', KeyS: 'back',
  ArrowLeft: 'left', KeyA: 'left', KeyQ: 'left', ArrowRight: 'right', KeyD: 'right'
};

// Independent pointer ownership prevents one finger releasing another's input.
export class MotionInput {
  readonly keys = new Set<string>();
  readonly pointers = new Map<number, Direction>();
  pressKey(code: string) { if (keyDirections[code]) this.keys.add(code); }
  releaseKey(code: string) { this.keys.delete(code); }
  pressPointer(id: number, direction: Direction) { this.pointers.set(id, direction); }
  releasePointer(id: number) { this.pointers.delete(id); }
  clearKeys() { this.keys.clear(); }
  clear() { this.keys.clear(); this.pointers.clear(); }
  directions() { return new Set([...this.keys].map(k => keyDirections[k]).concat([...this.pointers.values()])); }
  get count() { return this.keys.size + this.pointers.size; }
}

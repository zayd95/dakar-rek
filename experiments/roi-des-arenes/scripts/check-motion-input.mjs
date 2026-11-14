import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const { MotionInput } = await import(pathToFileURL(process.argv[2]).href);
const input = new MotionInput();
const checks = [];
input.pressPointer(10, 'forward'); input.pressPointer(11, 'right');
assert.deepEqual([...input.directions()].sort(), ['forward', 'right']);
input.releasePointer(10); assert.deepEqual([...input.directions()], ['right']);
input.releasePointer(11); assert.equal(input.count, 0);
checks.push({ name: 'Two pointer owners; releasing one preserves the other and final release stops', passed: true });
input.pressPointer(1, 'forward'); input.pressPointer(2, 'forward'); input.releasePointer(1);
assert.deepEqual([...input.directions()], ['forward']); input.releasePointer(2);
checks.push({ name: 'Two pointers on the same direction remain independently owned', passed: true });
for (const code of ['ArrowUp','ArrowLeft','ArrowRight','ArrowDown','KeyW','KeyA','KeyS','KeyD','KeyZ','KeyQ']) {
  input.pressKey(code); assert.equal(input.count, 1); input.releaseKey(code); assert.equal(input.count, 0);
}
input.pressKey('Space'); assert.equal(input.count, 0);
checks.push({ name: 'AZERTY/QWERTY/arrows press/release mapping; unrelated keys ignored', passed: true });
input.pressPointer(2,'right'); input.pressKey('KeyW'); input.clearKeys();
assert.deepEqual([...input.directions()], ['right']);
input.pressKey('KeyQ'); input.clear(); assert.equal(input.count, 0);
checks.push({ name: 'Keyboard-focus release preserves pointer input; full cancel clears all owners', passed: true });
await writeFile(new URL('../evidence/motion-input.json', import.meta.url), JSON.stringify({ timestamp:new Date().toISOString(),kind:'Actual input-state unit checks; not physical multitouch/device test',checks },null,2)+'\n');
console.log(JSON.stringify({passed:checks.length}));

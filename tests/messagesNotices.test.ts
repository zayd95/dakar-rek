import { afterEach, describe, expect, it, vi } from 'vitest';
import { setOnline } from '../src/online/api';
import { createFakeOnline } from '../src/online/fake';
import { messagesBadge, startMessageNotices } from '../src/ui/phone/apps/messages';

/** The optional notices main.ts may start (src/ui/phone/apps/messages.ts): one toast per new item another player sends, none for the player's own. */
afterEach(() => { setOnline(null); vi.useRealTimers(); });
describe('message notices and the badge', () => {
  it('toasts a new line from another player once, never the player’s own, and the badge counts unread items', async () => {
    vi.useFakeTimers();
    const f = createFakeOnline({ latency: 5 }); setOnline(f);
    const toasts: string[] = [], stop = startMessageNotices(m => toasts.push(m));
    expect(messagesBadge()).toBe(1);
    f.as('Awa').say('Tu es où ?');
    await vi.advanceTimersByTimeAsync(1);
    f.say('a11ce0000000a001', 'Au marché'); await vi.advanceTimersByTimeAsync(20);
    f.as('Moussa').pay(1500, 'Merci');
    await vi.advanceTimersByTimeAsync(1);
    expect(toasts).toEqual(['💬 Awa : Tu es où ?', '💬 Moussa : 1 500 F reçus']);
    expect(messagesBadge()).toBe(3);
    stop(); f.as('Awa').say('Allô ?'); await vi.advanceTimersByTimeAsync(1);
    expect(toasts).toHaveLength(2);
  });
  it('without an account: no badge, no notices', () => {
    expect(messagesBadge()).toBe(0);
    expect(startMessageNotices(() => {})).toBeTypeOf('function');
  });
});

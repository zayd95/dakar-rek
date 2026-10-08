export const AD_SLOTS = ['plateau-street', 'corniche-street', 'almadies-street', 'pikine-street', 'pikine-arena'] as const;
export type AdSlot = typeof AD_SLOTS[number];
export interface Campaign {
  id: string;
  slot: AdSlot;
  approved: boolean;
  status: 'active' | 'paused';
  sponsor: string;
  headline: string;
  message: string;
  startsAt: string;
  endsAt: string;
  background: string;
  foreground: string;
  url?: string;
}

export function sponsorUrl(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

const text = (s: unknown, max: number): s is string => typeof s === 'string' && s.trim().length > 0 && s.length <= max;
const instant = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(s) && Number.isFinite(Date.parse(s));

/** Owner-managed manifest only; invalid entries never become sponsored content. */
export function decodeCampaigns(data: unknown): Campaign[] {
  if (!data || typeof data !== 'object') return [];
  const manifest = data as Record<string, unknown>;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.campaigns) || manifest.campaigns.length > 100) return [];
  const ids = new Set<string>();
  return manifest.campaigns.flatMap(raw => {
    if (!raw || typeof raw !== 'object') return [];
    const c = raw as Record<string, unknown>;
    if (!text(c.id, 64) || ids.has(c.id) || !AD_SLOTS.includes(c.slot as AdSlot) || typeof c.approved !== 'boolean'
      || (c.status !== 'active' && c.status !== 'paused') || !text(c.sponsor, 50) || !text(c.headline, 48) || !text(c.message, 96)
      || !instant(c.startsAt) || !instant(c.endsAt) || Date.parse(c.endsAt) <= Date.parse(c.startsAt)
      || typeof c.background !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.background)
      || typeof c.foreground !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.foreground)
      || (c.url !== undefined && !sponsorUrl(c.url))) return [];
    ids.add(c.id);
    return [{ ...c, url: sponsorUrl(c.url) } as unknown as Campaign];
  });
}

/** End is exclusive; newest start wins deterministically when dates overlap. */
export function activeCampaign(campaigns: Campaign[], slot: AdSlot, now: number): Campaign | undefined {
  return campaigns.filter(c => c.slot === slot && c.approved && c.status === 'active' && Date.parse(c.startsAt) <= now && now < Date.parse(c.endsAt))
    .sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt) || a.id.localeCompare(b.id))[0];
}

let campaigns: Campaign[] = [], lastPoll = -Infinity, inFlight = false;
export const campaignAt = (slot: AdSlot, now = Date.now()) => activeCampaign(campaigns, slot, now);

/** Poll without keeping expired/removed ads alive. No impressions or personal data are collected. */
export async function refreshCampaigns(now = Date.now()): Promise<void> {
  if (inFlight || now - lastPoll < 60_000) return;
  inFlight = true; lastPoll = now;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}ad-campaigns.json`, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error('Campaign manifest unavailable');
    campaigns = decodeCampaigns(await response.json());
  } catch { campaigns = []; }
  finally { clearTimeout(timer); inFlight = false; }
}

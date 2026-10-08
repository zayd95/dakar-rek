import { afterEach, describe, expect, it, vi } from 'vitest';
import { activeCampaign, decodeCampaigns, sponsorUrl } from '../src/ads/campaigns';
import { ACTIONS } from '../src/world/content';

const raw = {
  id: 'local-business', slot: 'plateau-street', approved: true, status: 'active',
  sponsor: 'Commerce test', headline: 'Annonce test', message: 'Campagne de vérification.',
  startsAt: '2026-10-08T10:00:00Z', endsAt: '2026-10-08T11:00:00Z',
  background: '#123f39', foreground: '#fff1ce', url: 'https://example.com/',
};
const decode = (campaign = raw) => decodeCampaigns({ schemaVersion: 1, campaigns: [campaign] });

describe('owner-managed advertising', () => {
  it('serves only approved, active campaigns on the requested slot during their interval', () => {
    const ads = decode(), start = Date.parse(raw.startsAt), end = Date.parse(raw.endsAt);
    expect(activeCampaign(ads, 'plateau-street', start - 1)).toBeUndefined();
    expect(activeCampaign(ads, 'plateau-street', start)?.id).toBe(raw.id);
    expect(activeCampaign(ads, 'plateau-street', end)).toBeUndefined();
    expect(activeCampaign(ads, 'pikine-arena', start)).toBeUndefined();
    expect(activeCampaign(decode({ ...raw, approved: false }), 'plateau-street', start)).toBeUndefined();
    expect(activeCampaign(decode({ ...raw, status: 'paused' }), 'plateau-street', start)).toBeUndefined();
    expect(activeCampaign([], 'plateau-street', start)).toBeUndefined();
  });
  it('rejects malformed manifests, missing time zones, invalid intervals and unsafe links', () => {
    for (const patch of [{ slot: 'unknown' }, { endsAt: raw.startsAt }, { startsAt: '2026-10-08T10:00:00' },
      { url: 'javascript:alert(1)' }, { url: 'https://user:password@example.com' }, { background: 'red' }, { headline: 'x'.repeat(49) }]) {
      expect(decode({ ...raw, ...patch })).toEqual([]);
    }
    expect(decodeCampaigns({ schemaVersion: 2, campaigns: [raw] })).toEqual([]);
    expect(decodeCampaigns(null)).toEqual([]);
    expect(sponsorUrl('http://example.com')).toBeUndefined();
    expect(sponsorUrl('https://example.com/path?q=1')).toBe('https://example.com/path?q=1');
  });
  it('resolves overlapping campaigns independently of manifest order and rejects duplicate IDs', () => {
    const later = { ...raw, id: 'later', startsAt: '2026-10-08T10:30:00Z' };
    const time = Date.parse('2026-10-08T10:45:00Z');
    for (const campaigns of [[raw, later], [later, raw]]) {
      expect(activeCampaign(decodeCampaigns({ schemaVersion: 1, campaigns }), 'plateau-street', time)?.id).toBe('later');
    }
    expect(decodeCampaigns({ schemaVersion: 1, campaigns: [raw, raw] })).toHaveLength(1);
  });
});

describe('optional mosque visit', () => {
  it('requires no money, affiliation or religious progression', () => {
    for (const a of ACTIONS.mosque) {
      expect(a.cost).toBeUndefined(); expect(a.gain).toBeUndefined();
      expect(a.requires).toBeUndefined(); expect(a.counter).toBeUndefined();
    }
    expect(ACTIONS.mosque.find(a => a.id === 'priere')?.needs).toBeUndefined();
    expect(ACTIONS.mosque.find(a => a.id === 'calme')?.needs?.moral).toBeGreaterThan(0);
  });
});

describe('campaign delivery', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
  it('refreshes once per minute and removes an earlier ad when the network fails', async () => {
    vi.resetModules();
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ schemaVersion: 1, campaigns: [raw] }) }).mockRejectedValueOnce(new Error('offline'));
    vi.stubGlobal('fetch', fetch);
    const service = await import('../src/ads/campaigns');
    const now = Date.parse(raw.startsAt);
    await service.refreshCampaigns(now);
    expect(service.campaignAt('plateau-street', now)?.id).toBe(raw.id);
    await service.refreshCampaigns(now + 59_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await service.refreshCampaigns(now + 60_000);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(service.campaignAt('plateau-street', now + 60_000)).toBeUndefined();
  });
  it('removes approved content when the owner publishes an empty or invalid manifest', async () => {
    vi.resetModules();
    const fetch = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ schemaVersion: 1, campaigns: [raw] }) }).mockResolvedValueOnce({ ok: true, json: async () => ({ schemaVersion: 1, campaigns: [] }) });
    vi.stubGlobal('fetch', fetch);
    const service = await import('../src/ads/campaigns'), now = Date.parse(raw.startsAt);
    await service.refreshCampaigns(now);
    expect(service.campaignAt('plateau-street', now)).toBeDefined();
    await service.refreshCampaigns(now + 60_000);
    expect(service.campaignAt('plateau-street', now + 60_000)).toBeUndefined();
  });
});

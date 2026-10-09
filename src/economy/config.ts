/**
 * Economy design table: every price, pay and income of the game lives here. These are the game's own numbers.
 * Habib's rule (9 Oct 2026): the economy is fully virtual and has no cap; work can make a player a billionaire,
 * and doing many different activities pays more (polyvalence). Amounts are game money (FCFA in the fiction),
 * saved on this device only: there is no shared or server economy yet.
 */
export const ECONOMY = {
  /** Tiak Tiak deliveries (walked for now: no driving physics). Pay per route id (see src/economy/jobs.ts). */
  tiak: {
    pay: {
      pk_mame_boutique: 1200, pk_mame_bank: 1400, pk_boutique_salon: 1000, pk_pathe_square: 1300, pk_maiga_garage: 1100,
      pk_reco_salon_bank: 2200,
      pl_fatou_market: 1300, pl_fatou_bank: 1200, pl_medina_square: 1100, pl_atelier_reparation: 1000,
      pl_reco_reparation_bank: 2400,
    } as Record<string, number>,
    /** Share of the pay when the delivery arrives after the time limit (never negative). */
    latePayFactor: 0.6,
    /** Generous limit: walking time × slack + a base, at least minLimitS (played seconds). */
    walkSpeed: 5.6, limitSlack: 2.5, limitBaseS: 40, minLimitS: 60,
    /** Distance (m) at which the parcel is picked up or handed over. */
    arriveRadius: 3.5,
    /** Below this energy the player is too tired to take a delivery. */
    minEnergy: 8,
    fatigue: { energie: -6, faim: -3, hygiene: -3 },
  },
  /** Starter-room furniture prices (see src/economy/furniture.ts). */
  furniture: { miroir: 2500, tapis: 3000, chaises: 3500, radio: 4000, matelas: 7500, tele: 12000 } as Record<string, number>,
  /**
   * Ventures (« Affaires », src/economy/business.ts): price of the first unit and income per in-game hour of play
   * (1 city hour = 1 real minute). Each tier is about 5–6× the previous; payback grows from ≈ 2 to ≈ 3 hours of play.
   * Tier n needs n different activities ever practised and one unit of the tier below.
   */
  business: {
    tiers: [
      { id: 'bana', price: 50_000, perHour: 400 },
      { id: 'kiosque', price: 300_000, perHour: 2_200 },
      { id: 'boutique', price: 1_500_000, perHour: 10_500 },
      { id: 'car_rapide', price: 8_000_000, perHour: 52_000 },
      { id: 'restaurant', price: 40_000_000, perHour: 245_000 },
      { id: 'immeuble', price: 200_000_000, perHour: 1_150_000 },
      { id: 'entreprise', price: 1_000_000_000, perHour: 5_400_000 },
    ],
    /** Each unit already owned makes the next one of the same tier this much dearer. */
    growth: 1.15,
    /** Income is counted on played time only; at most this many in-game hours are counted at once (travel, a stalled tab). */
    maxCatchUpHours: 24,
  },
  /** Polyvalence: distinct activity categories practised within the window (played time) raise job pay and venture income. */
  polyvalence: {
    /** 3 in-game days of play (72 min of played time). */
    windowDays: 3,
    /** +20 % per category beyond the first: 4 → ×1,6; capped at ×2 (6 categories). */
    step: 0.2, cap: 2,
  },
  /**
   * Ownership rules (src/economy/assets.ts). Homes, land, billboards, ventures and furniture share one model; each item's
   * price, rent and income is in its catalogue entry (src/economy/catalog.ts).
   */
  property: {
    /** Share of a home's rent its owner receives when letting it (the rest goes to the agency and the upkeep). */
    letShare: 0.85,
    /** Selling pays this share of the current value at once (no paperwork, no wait); furniture resells at half price. */
    saleShare: 0.9, furnitureResale: 0.5,
    /** Value of land, homes and billboards: (price + upgrades) × (floor + (1 − floor) × condition / 100). */
    valueFloor: 0.7,
    /** Rent brought by a let asset: × (floor + (1 − floor) × condition / 100). */
    rentFloor: 0.5,
    /** A repair costs this share of the price per condition point missing. */
    repairPerPoint: 0.001,
    /** A lease ends after this many in-game days of unpaid rent (the landlord takes the keys back; the debt is dropped). */
    evictDays: 3,
    /** Ad space on a billboard: price per in-game day, and the boost to the ventures' income while the ad runs. */
    adSpace: { perDay: 25_000, boost: 0.1 },
  },
  /** Wallet history kept in the save. */
  ledgerMax: 100,
} as const;

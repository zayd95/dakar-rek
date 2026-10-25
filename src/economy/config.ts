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
      // between districts (a ride of 1.2 to 2 km on the roads): PROVISIONAL
      x_pk_pl_diallo_ndeye: 5000, x_pl_pk_market_mame: 5000, x_pk_al_maiga_pointe: 6500, x_pl_co_fatou_etudiants: 6000,
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
    /** « Tournée » (src/economy/tour.ts): one pick-up, two clients, the player picks who is served first. */
    tour: {
      /** A client's trust is a whole number between these; a late stop or an abandoned one costs 1, a stop on time earns 1. */
      trustMin: -3, trustMax: 5,
      /** Each trust level above 0 raises that client's pay by this share (never below the base); each level, up or down, moves their patience (the stop's time limit). */
      payPerLevel: 0.04, patiencePerLevel: 0.06,
      /** The clock of a tour starts when the courier is this far (m) from the pick-up point. */
      departRadius: 8,
      /** Below this energy the courier is too tired for two stops. */
      minEnergy: 14,
    },
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
  /**
   * The player's own bana-bana table in Pikine (src/economy/bana.ts), on top of the venture's hourly income (unchanged: « la famille tient la table quand
   * tu n'es pas là »). Kept by the player: goods bought from the market's wholesaler at `cost`, sold one customer at a time at `price` (`qty`: what a
   * customer takes, at most what is left). A full table of customers (`clientele.max`) brings ≈ 1 600 F of profit — about one Tiak Tiak delivery — and
   * the customers come back with PLAYED time only (one every `everyHours` in-game hours, the first `start` come with the table): no farming, nothing offline.
   */
  bana: {
    goods: [
      { id: 'arachides', name: 'Cornet d’arachides', one: 'un cornet d’arachides', plural: 'cornets d’arachides', icon: '🥜', cost: 50, price: 100, lot: 10, max: 30, qty: [2, 5] },
      { id: 'recharge', name: 'Carte de recharge 1 000 F', one: 'une carte de recharge', plural: 'cartes de recharge', icon: '📱', cost: 900, price: 1000, lot: 5, max: 10, qty: [1, 2] },
      { id: 'mouchoirs', name: 'Paquet de mouchoirs', one: 'un paquet de mouchoirs', plural: 'paquets de mouchoirs', icon: '🧻', cost: 60, price: 100, lot: 10, max: 20, qty: [1, 3] },
    ] as readonly { id: string; name: string; one: string; plural: string; icon: string; cost: number; price: number; lot: number; max: number; qty: readonly [number, number] }[],
    clientele: { start: 4, max: 12, everyHours: 1 },
    /** The player is « at the table » within this many metres of it; walking further away closes the session (the till is paid). */
    reach: 2.6, leave: 6,
  },
  /**
   * Variety (« polyvalence »): distinct activity categories practised within the window (played time) raise ACTIVE pay only
   * (shifts, deliveries, services). It is an optional bonus: it never gates a purchase and never touches passive income
   * (ventures, rents).
   */
  polyvalence: {
    /** 3 in-game days of play (72 min of played time). */
    windowDays: 3,
    /** +5 % per category beyond the first: 4 or more → +15 %, the cap. Provisional: to be tuned by the lifestyle simulation. */
    step: 0.05, cap: 1.15,
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
  /**
   * Credit between people (src/economy/credit.ts): Pape Sarr (Sarr Auto, Pikine) finances a city car, Modou lets a customer pay a repair later.
   * Game money only, no interest; trust is the relationship level (src/social/relations.ts, −100…100). PROVISIONAL until the economy pass.
   */
  credit: {
    dealer: {
      /** He finances a car up to this price (a city car), one credit at a time. */
      maxPrice: 6_000_000,
      /** Terms by trust, best first: the down payment, fixed or a share of the price (the more he trusts, the less he asks up front). */
      tiers: [{ trust: 60, down: 15_000 }, { trust: 45, share: 0.05 }, { trust: 30, share: 0.15 }, { trust: 20, share: 0.3 }],
      /**
       * The rest is repaid like a Dakar driver pays a car's owner: a small « versement » every one of the PLAYER's days (src/economy/streak.ts: time away
       * never counts against them), about three or four short VTC rides; more whenever they like. A long road for 4 000 000 F, every franc of it visible.
       */
      installment: 10_000, every: 1,
      /** A due date counts as missed only when more than this many installments are behind (a slow day is not a broken promise). */
      grace: 2,
      /** While his credit runs, this share of each VTC fare goes to him (shown on the ride's card; « Crédits » turns it off). */
      fareShare: 0.3,
      /** Due dates missed with him before he refuses any new credit. */
      missedLimit: 3,
    },
    garage: {
      /** Modou talks arrangements from this trust (or once he has said the player works well: the `modou_trust` flag). */
      trustToArrange: 10, trustedLevel: 35,
      /** Share of the bill paid now: someone he knows, someone he trusts. */
      partKnown: 0.6, partTrusted: 0.35,
      /** Never less than this now; never more than this on the slate; the trusted, reliable customer's discount. */
      minNow: 1000, maxDebt: 60_000, discount: 0.1,
      /** The rest is repaid in this many installments, one every `every` of the player's days; missed beyond `grace` installments behind. */
      installments: 3, every: 1, grace: 1, missedLimit: 2,
    },
    /** Trust: an errand done (the first, second… of a city day; nothing after the fourth), a first visit, an installment on time, a due date missed, a debt repaid in full. */
    trust: { errands: [10, 8, 6, 4], firstVisit: 4, paidOnTime: 2, missed: -4, repaidAll: 6 },
  },
  /**
   * VTC rides (src/transport/vtc.ts): the fare is fixed when the ride is accepted, from the length of the way by road (the streets' grid inside a district,
   * the roads between districts), in the bands a Dakar ride costs: a few streets 1 000–2 000 F, across a district 2 000–3 500 F, to the next district
   * 3 500–4 500 F, two districts away 3 500–5 000 F; never more than 5 000 F, never a multiplier. Rounded to 500 F.
   */
  vtc: {
    step: 500,
    /** Inside a district: a pick-up charge and a rate per metre of street, between a minimum and a maximum. */
    town: { base: 1000, perMetre: 1.6, min: 1000, max: 3500 },
    /** To another district: from `min` for the first `from` metres of road, `perMetre` beyond, capped by how many districts away it is (1, 2). */
    away: { min: 3500, from: 1500, perMetre: 0.6, max: [4500, 5000] as readonly number[] },
    /** The time a ride should take (late beyond it): the way at this mean speed (m/s), times the slack, plus the pick-up. */
    speed: 7, slack: 1.6, pickupS: 90,
  },
  /**
   * Repairs (src/transport/garage.ts): the work a car needs is priced by how much is wrong, not by what the car cost: a touch-up is free, ordinary damage
   * costs what a garage in Pikine would ask, and a dearer car only costs somewhat more (its class factor, (price / ref)^exp, within [min, max]).
   * `points`: [lost condition points, F] corners of the price curve for a car of the reference class.
   */
  repair: {
    freeBelow: 5,
    points: [[5, 2000], [15, 8000], [40, 33000], [100, 63000]] as [number, number][],
    classRef: 6_000_000, classExp: 0.3, classMin: 0.3, classMax: 2.2,
    /** The partial repair brings the car back to this condition (« remise en route »), or no lower than where it is. */
    partialTo: 70,
  },
  /**
   * Banque Teranga (src/economy/bank.ts, docs/MONEY.md): the savings account « Épargne Teranga ». Once per player day (SaveData.play.day: the days the
   * player plays, never the ones that go by while away, never offline), the bank pays interest on the savings carried into that day: the rate and the
   * daily cap of the highest level the balance has reached. Each level above the first is celebrated once. Small next to work on purpose (a Tiak
   * delivery pays 1 000–2 400 F) and next to a venture (a bana-bana table at 50 000 F brings 400 F per city hour): saving keeps money safe and moves
   * toward a goal, it is not a way to get rich.
   */
  bank: {
    levels: [
      { from: 0, rate: 0.005, cap: 100 },
      { from: 25_000, rate: 0.01, cap: 250 },
      { from: 100_000, rate: 0.01, cap: 500 },
      { from: 500_000, rate: 0.01, cap: 1_000 },
    ],
    /** Quick amounts of a deposit or a withdrawal (« Tout » is offered beside them). */
    chips: [5_000, 10_000, 25_000, 50_000],
    /** The savings goals offered: these ventures (ECONOMY.business tiers) at the price the player would pay for the next unit. */
    goalTiers: ['bana', 'kiosque', 'boutique'],
  },
  /** Wallet history kept in the save. */
  ledgerMax: 100,
} as const;

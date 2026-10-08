/**
 * Economy design table — PROVISIONAL (to review with Habib). Every price and pay of Lot B lives here.
 * Amounts are game money (FCFA in the fiction), saved on this device only: there is no shared or server economy yet.
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
  /** Wallet history kept in the save. */
  ledgerMax: 100,
} as const;

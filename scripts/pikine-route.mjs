// The Pikine starting walk, shared by the capture and measurement scripts: room door → west along z = -60 → south down the
// x = -60 avenue (past the gare's west gate) → east along z = 60 → into the grand-place; then back to the avenue and west into the shops' court.
// yaw 0 walks south (+z), -π/2 west (-x), π/2 east (+x), π north.
const PI = Math.PI;
export const ROUTE_SHOTS = [
  ['01-room-door', -42, -57.5, 0],
  ['02-road-west', -50, -60, -PI / 2],
  ['03-avenue-south-a', -60, -50, 0],
  ['04-avenue-south-b', -60, -20, 0],
  ['05-avenue-south-c', -60, 10, 0],
  ['06-gare-west-gate', -57, 30, PI / 2],
  ['07-avenue-to-place', -60, 50, 0],
  ['08-road-east', -46, 60, PI / 2],
  ['09-place-approach', -26, 68, 0],
  ['10-grand-place', -26, 99, PI],
  ['11-shops-court', -60, 92, -PI / 2],
  ['12-boutique-diallo', -100, 93, PI],
];
/** The centre line of the walk, for the collision sweep and the walkthrough (x, z). */
export const ROUTE_PATH = [[-42, -56.5], [-42, -60], [-60, -60], [-60, 60], [-26, 60], [-26, 100], [-26, 60], [-60, 60], [-60, 92], [-100, 92], [-100, 93]];
/** Close-ups of what the slice adds, as the player meets them: [name, player x, z, looks at x, z]. */
export const ROUTE_DETAILS = [
  ['d01-baobab-corner', -44, -58, -50.5, -49.5],
  ['d02-gates-and-shops-east', -60, -47, -52.9, -45],
  ['d03-painted-walls-east', -60, -31, -52.9, -31],
  ['d04-painted-walls-west', -60, 32, -67.1, 32],
  ['d05-gare-portal', -61, 14, -54.6, 30],
  ['d06-standpipe', -62, -21, -67, -30],
  ['d07-grand-place-gateway', -30, 55, -30, 67.4],
  ['d08-market-gate', -57, 92, -66.2, 92],
  ['d09-salon-awa-flank', -62, 80, -70.3, 80],
  ['d10-shops-court', -90, 95, -100, 85],
];
/** The home street and its frontage (round 2): the room's road, the Cité Jàmm side, the dibiterie, the bank on the avenue. */
export const HOME_DETAILS = [
  ['h01-home-road-east', -8, -58.5, -30, -58.5],
  ['h02-home-road-mid', -26, -58.5, -46, -58.5],
  ['h03-home-door', -34, -58.5, -42, -54.5],
  ['h04-cite-jamm-frontage', -30, -58, -30, -70],
  ['h05-cite-jamm-west', -50, -58, -44, -70],
  ['h06-dibiterie', -12, -60, -15.6, -51.3],
  ['h07-bank-from-avenue', -60, -22, -67, -34],
  ['h08-bank-front', -60, -47, -67, -40],
  ['h09-bank-corner', -55, -56, -67, -53],
];
/** The home street walk (round 2): the road east of the room, past the dibiterie and the Cité Jàmm side, to the avenue and down the bank's flank (x, z). */
export const HOME_PATH = [[-8, -58.5], [-60, -60], [-60, -8]];

/** The arena street (the road z = −60 east of the junction), walked out and back on three lanes: the north pavement lane, the carriageway's centre, the south pavement lane. */
export const ARENA_PATHS = [[[-4, -65.4], [56, -65.4]], [[-4, -62.4], [56, -62.4]], [[-4, -54.6], [56, -54.6]]];

/** The arena street, from the junction to the gate's parvis and back (yaw: PI / 2 looks east): the waypoints of the performance and capture runs. */
export const ARENA_SHOTS = [
  ['a01-junction', -6, -60, PI / 2], ['a02-gateway', 3, -60, PI / 2], ['a03-approach', 9, -62.4, PI / 2], ['a04-lamb-shop-side', 22, -58.5, PI / 2], ['a05-parvis', 28, -60, PI / 2],
  ['a06-gate', 30, -59, 0], ['a07-east-parvis', 38, -62.4, PI / 2], ['a08-east-end', 50, -60, PI / 2], ['a09-from-east', 52, -60, -PI / 2], ['a10-from-parvis', 26, -60, -PI / 2], ['a11-gateway-east', 20, -60, -PI / 2],
];

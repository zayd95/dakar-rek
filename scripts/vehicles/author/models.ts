// The player cars with a body of their own, as numbers for lib.ts. Each is an ORIGINAL design that reads as its class of car
// (the game's names; no maker's name, badge, emblem or lettering anywhere: the grille and the plates are blank).
// Dimensions come from the kit (src/actors/vehicleKit.ts CAR_MODELS), so seats, doors, cameras and collisions fit the body.
import type { CarModelId } from '../../../src/actors/vehicleKit';
import { carModelDims } from '../../../src/actors/vehicleKit';
import type { BodySpec, Decal, P2, WheelStyle } from './lib';
import { rrect, soft, ellipse } from './lib';

export interface CarDef {
  id: string; model: CarModelId; name: string; inspiredBy: string;
  /** Paint (sRGB hex) of the model as delivered; the showroom's other lots tint it. */
  paint: number;
  body: BodySpec;
  decals: Decal[];
  wheel: WheelStyle;
  /** Mirror housing: centre (z, y) just outside the body, size, colour cell. */
  mirror: { z: number; y: number; size: [number, number, number]; cell: string };
  /** Small extra pieces: [cell, centre, size] boxes (antenna, roof rails). */
  boxes?: [string, [number, number, number], [number, number, number]][];
}

/** A thin strip between two points of a side view (a panel seam). */
const seam = (a: P2, b: P2, w = 0.011): Decal => {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), nx = (-dy / l) * w / 2, ny = (dx / l) * w / 2;
  return { poly: [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], frame: 'side', cell: 'seam', map: 'flat', off: 0.004, edge: 0.06, facing: [1, 0, 0] };
};
const side = (poly: P2[], cell: string, off = 0.006, extra: Partial<Decal> = {}): Decal => ({ poly, frame: 'side', cell, off, facing: [1, 0.15, 0], edge: 0.085, ...extra });

// ------------------------------------------------------------------------------------------------ Teranga: a modern five-door city hatch
const T = carModelDims('teranga');
const teranga: CarDef = {
  id: 'teranga', model: 'teranga', name: 'Teranga', inspiredBy: 'a current-generation five-door city hatch (two-tone, black roof)',
  paint: 0xeceeed,
  body: {
    L: T.L, W: T.W,
    top: [[-1.97, 0.96], [-1.93, 1.03], [-1.85, 1.07], [-1.78, 1.1], [-1.6, 1.25], [-1.38, 1.4], [-1.18, 1.475], [-0.8, 1.5], [-0.3, 1.5], [-0.08, 1.48], [0.15, 1.37], [0.4, 1.18], [0.62, 1.0],
      [0.9, 0.95], [1.2, 0.895], [1.5, 0.83], [1.72, 0.775], [1.86, 0.725], [1.94, 0.67], [1.97, 0.61]],
    belt: [[-1.97, 0.9], [-1.82, 0.97], [-1.55, 1.0], [-1.25, 1.005], [-1.0, 0.975], [-0.4, 0.955], [0.3, 0.945], [0.62, 0.935], [1.0, 0.87], [1.4, 0.79], [1.7, 0.73], [1.86, 0.69], [1.97, 0.59]],
    bot: [[-1.97, 0.36], [-1.88, 0.27], [-1.62, 0.2], [1.6, 0.2], [1.8, 0.245], [1.92, 0.3], [1.97, 0.37]],
    front: { z0: 1.3, p: 3.1 }, rear: { z0: -1.62, p: 3.6 },
    roofHw: [[-1.97, 0.62], [-1.3, 0.6], [-0.6, 0.625], [0.0, 0.63], [0.62, 0.72], [1.97, 0.8]],
    n: 4.4, shoulderIn: 0.035, tuck: 0.075, waist: 0.6,
    axles: [{ z: T.fz, r: T.r, arch: T.r + 0.06 }, { z: T.rz, r: T.r, arch: T.r + 0.06 }],
    greenhouse: [-1.79, 0.63], blackRoof: true,
    stations: [0.64, -0.36, -1.02, 1.9, -1.9],
  },
  decals: [
    // glass: front door, rear door with the kick-up at its tail, windscreen, hatch
    side(soft([[0.53, 0.97], [0.06, 1.405], [-0.31, 1.42], [-0.33, 0.965]], 2, 0.18), 'glass', 0.008),
    side(soft([[-0.41, 0.965], [-0.41, 1.42], [-0.92, 1.41], [-1.1, 1.27], [-1.06, 0.99]], 2, 0.18), 'glass', 0.008),
    { poly: soft([[-0.69, 0.6], [0.69, 0.6], [0.6, -0.04], [-0.6, -0.04]], 2, 0.12), frame: 'top', cell: 'glass', off: 0.008, mirror: false, facing: [0, 1, 0.7], edge: 0.06 },
    { poly: soft([[-0.55, -1.73], [0.55, -1.73], [0.5, -1.27], [-0.5, -1.27]], 2, 0.12), frame: 'top', cell: 'glass', off: 0.008, mirror: false, facing: [0, 1, -0.9], edge: 0.05 },
    // the swept headlamps, high on the corners; the wide hexagon-mesh grille under a slim upper slot; corner intakes with round lamps
    { poly: soft([[0.27, 0.7], [0.4, 0.665], [0.66, 0.7], [0.83, 0.765], [0.86, 0.85], [0.66, 0.83], [0.34, 0.775]], 1, 0.2), frame: 'front', cell: 'headA', off: 0.007, mirror: true, facing: [0.4, 0.3, 1], edge: 0.03 },
    { poly: soft([[-0.24, 0.685], [0, 0.64], [0.24, 0.685], [0.46, 0.49], [0.53, 0.37], [0.45, 0.265], [-0.45, 0.265], [-0.53, 0.37], [-0.46, 0.49]], 1, 0.18), frame: 'front', cell: 'grilleHex', off: 0.006, mirror: false, facing: [0, 0, 1], edge: 0.04 },
    { poly: soft([[-0.26, 0.715], [0.26, 0.715], [0.22, 0.735], [-0.22, 0.735]], 1), frame: 'front', cell: 'black', off: 0.006, mirror: false, facing: [0, 0.3, 1], edge: 0.04 },
    { poly: soft([[0.6, 0.56], [0.69, 0.59], [0.76, 0.42], [0.71, 0.3], [0.61, 0.34]], 1), frame: 'front', cell: 'black', off: 0.006, mirror: true, facing: [0.3, 0, 1], edge: 0.03 },
    { poly: ellipse(0.675, 0.4, 0.035, 0.035, 12), frame: 'front', cell: 'fog', off: 0.01, mirror: true, facing: [0.3, 0, 1], edge: 0.03 },
    { poly: rrect(0, 0.43, 0.52, 0.11, 0.015), frame: 'front', cell: 'plate', off: 0.012, mirror: false, facing: [0, 0, 1], edge: 0.06 },
    // the tail: wrap-round lamps high on the hatch, the plate between them, a dark diffuser, reflectors
    { poly: soft([[0.4, 0.985], [0.68, 1.0], [0.82, 0.93], [0.81, 0.85], [0.56, 0.87], [0.42, 0.91]], 1), frame: 'rear', cell: 'tailA', off: 0.007, mirror: true, facing: [0.3, 0, -1], edge: 0.03 },
    { poly: rrect(0, 0.72, 0.52, 0.11, 0.015), frame: 'rear', cell: 'plate', off: 0.01, mirror: false, facing: [0, 0, -1], edge: 0.06 },
    { poly: soft([[-0.62, 0.44], [0.62, 0.44], [0.72, 0.36], [0.7, 0.3], [-0.7, 0.3], [-0.72, 0.36]], 1), frame: 'rear', cell: 'black', off: 0.006, mirror: false, facing: [0, 0, -1], edge: 0.05 },
    { poly: rrect(0.68, 0.48, 0.07, 0.025, 0.008), frame: 'rear', cell: 'tailB', off: 0.01, mirror: true, facing: [0.3, 0, -1] },
    // panel seams (the driver's door's front and rear edges, the rear door, the sill line) and the handles
    seam([0.64, 0.42], [0.64, 0.93]), seam([-0.36, 0.42], [-0.36, 0.955]), seam([0.64, 0.42], [-1.0, 0.42]),
    seam([-1.0, 0.42], [-1.07, 0.6]), seam([-1.07, 0.6], [-1.07, 0.99]),
    side(rrect(0.02, 0.885, 0.13, 0.032, 0.012), 'seam', 0.005, { map: 'flat' }), side(rrect(-0.88, 0.905, 0.13, 0.032, 0.012), 'seam', 0.005, { map: 'flat' }),
    side(rrect(-1.45, 0.95, 0.1, 0.07, 0.03), 'seam', 0.004, { map: 'flat', mirror: false }),           // the fuel flap, on the left
  ],
  wheel: { spokes: 10, rim: 'rimSilver', face: 'rimGun', rimShare: 0.62, wIn: 0.2, wOut: 0.13, dish: 0.025, caliper: 'caliper' },
  mirror: { z: 0.5, y: 1.02, size: [0.13, 0.11, 0.19], cell: 'black' },
  boxes: [['black', [0, 1.505, -1.08], [0.045, 0.05, 0.15]]],
};

// ------------------------------------------------------------------------------------------------ Lamane Sport: a large luxury SUV
const R = carModelDims('lamane');
const lamane: CarDef = {
  id: 'lamane', model: 'lamane', name: 'Lamane Sport', inspiredBy: 'a large British-style luxury SUV (floating black roof, clamshell bonnet)',
  paint: 0xc2141f,
  body: {
    L: R.L, W: R.W,
    top: [[-2.44, 1.14], [-2.4, 1.21], [-2.32, 1.255], [-2.28, 1.27], [-2.12, 1.52], [-1.95, 1.7], [-1.7, 1.765], [-1.0, 1.79], [0.1, 1.8], [0.42, 1.78], [0.62, 1.6], [0.82, 1.38], [1.0, 1.165],
      [1.4, 1.135], [1.9, 1.11], [2.2, 1.085], [2.36, 1.05], [2.42, 0.99], [2.44, 0.93]],
    belt: [[-2.44, 1.1], [-2.25, 1.19], [-1.9, 1.215], [-1.0, 1.19], [0.0, 1.165], [1.0, 1.14], [1.5, 1.12], [2.0, 1.085], [2.3, 1.04], [2.44, 0.9]],
    bot: [[-2.44, 0.6], [-2.34, 0.48], [-2.06, 0.36], [2.05, 0.36], [2.3, 0.43], [2.44, 0.55]],
    front: { z0: 1.85, p: 4.2 }, rear: { z0: -1.95, p: 4.6 },
    roofHw: [[-2.44, 0.78], [-1.7, 0.76], [0.4, 0.79], [1.0, 0.88], [2.44, 0.92]],
    n: 6.5, shoulderIn: 0.045, tuck: 0.06, waist: 0.62,
    axles: [{ z: R.fz, r: R.r, arch: R.r + 0.07 }, { z: R.rz, r: R.r, arch: R.r + 0.07 }],
    greenhouse: [-2.29, 1.01], blackRoof: true,
    stations: [0.98, -0.12, -0.98, 2.38, -2.38],
  },
  decals: [
    side(soft([[0.9, 1.18], [0.45, 1.705], [-0.06, 1.715], [-0.08, 1.18]], 2, 0.15), 'glass', 0.008),
    side(soft([[-0.17, 1.18], [-0.17, 1.715], [-0.95, 1.715], [-0.95, 1.19]], 2, 0.15), 'glass', 0.008),
    side(soft([[-1.06, 1.195], [-1.06, 1.71], [-1.72, 1.69], [-1.93, 1.36], [-1.85, 1.22]], 2, 0.15), 'glass', 0.008),
    { poly: soft([[-0.82, 0.99], [0.82, 0.99], [0.74, 0.46], [-0.74, 0.46]], 2, 0.1), frame: 'top', cell: 'glass', off: 0.008, mirror: false, facing: [0, 1, 0.8], edge: 0.06 },
    { poly: soft([[-0.67, -2.27], [0.67, -2.27], [0.64, -1.98], [-0.64, -1.98]], 2, 0.1), frame: 'top', cell: 'glass', off: 0.008, mirror: false, facing: [0, 1, -1], edge: 0.05 },
    // slim lamps on the corners at the bonnet's edge, the mesh grille between them; the deep lower intakes; the lip
    { poly: soft([[0.5, 0.94], [0.9, 0.965], [0.94, 1.03], [0.56, 1.02], [0.47, 0.985]], 1, 0.2), frame: 'front', cell: 'headB', off: 0.007, mirror: true, facing: [0.35, 0.2, 1], edge: 0.03 },
    { poly: soft([[-0.44, 0.91], [0.44, 0.91], [0.46, 1.03], [-0.46, 1.03]], 1, 0.12), frame: 'front', cell: 'grilleMesh', off: 0.006, mirror: false, facing: [0, 0, 1], edge: 0.04 },
    { poly: soft([[-0.56, 0.47], [0.56, 0.47], [0.6, 0.67], [-0.6, 0.67]], 1, 0.12), frame: 'front', cell: 'grilleMesh', off: 0.006, mirror: false, facing: [0, 0, 1], edge: 0.04 },
    { poly: soft([[0.66, 0.5], [0.9, 0.52], [0.93, 0.75], [0.68, 0.73]], 1, 0.15), frame: 'front', cell: 'grilleMesh', off: 0.006, mirror: true, facing: [0.3, 0, 1], edge: 0.03 },
    { poly: [[-0.97, 0.395], [0.97, 0.395], [0.97, 0.455], [-0.97, 0.455]], frame: 'front', cell: 'black', off: 0.005, mirror: false, facing: [0, 0, 1], edge: 0.05 },
    { poly: rrect(0, 0.8, 0.52, 0.11, 0.015), frame: 'front', cell: 'plate', off: 0.012, mirror: false, facing: [0, 0, 1], edge: 0.06 },
    // tail: thin lamps across the corners, plate on the tailgate, dark diffuser with twin finishers
    { poly: soft([[0.48, 1.0], [0.96, 1.015], [0.98, 1.12], [0.52, 1.115]], 1, 0.2), frame: 'rear', cell: 'tailB', off: 0.007, mirror: true, facing: [0.3, 0, -1], edge: 0.03 },
    { poly: [[-0.5, 1.045], [0.5, 1.045], [0.5, 1.085], [-0.5, 1.085]], frame: 'rear', cell: 'black', off: 0.006, mirror: false, facing: [0, 0, -1], edge: 0.05 },
    { poly: rrect(0, 0.9, 0.52, 0.11, 0.015), frame: 'rear', cell: 'plate', off: 0.01, mirror: false, facing: [0, 0, -1], edge: 0.06 },
    { poly: soft([[-0.8, 0.6], [0.8, 0.6], [0.88, 0.48], [-0.88, 0.48]], 1), frame: 'rear', cell: 'black', off: 0.006, mirror: false, facing: [0, 0, -1], edge: 0.05 },
    { poly: rrect(0.55, 0.53, 0.2, 0.06, 0.02), frame: 'rear', cell: 'chrome', off: 0.011, mirror: true, facing: [0, 0, -1] },
    // the dark sill strip, the vent on the front door, the seams, flush handles
    side([[1.0, 0.37], [-0.92, 0.37], [-0.92, 0.47], [1.0, 0.47]], 'black', 0.005, { map: 'flat', edge: 0.06 }),
    side([[0.93, 0.98], [0.79, 0.98], [0.8, 0.9], [0.92, 0.9]], 'vent', 0.007),
    seam([0.98, 0.47], [0.98, 1.13]), seam([-0.12, 0.47], [-0.12, 1.16]), seam([-0.12, 0.47], [-0.98, 0.47]),
    seam([-0.98, 0.47], [-0.98, 1.18]),
    side(rrect(0.05, 1.07, 0.17, 0.028, 0.012), 'seam', 0.005, { map: 'flat' }), side(rrect(-0.85, 1.08, 0.17, 0.028, 0.012), 'seam', 0.005, { map: 'flat' }),
  ],
  wheel: { spokes: 5, twin: true, rim: 'rimBlack', face: 'rimBlack', rimShare: 0.66, wIn: 0.26, wOut: 0.16, dish: 0.04, caliper: 'disc' },
  mirror: { z: 0.86, y: 1.25, size: [0.15, 0.14, 0.24], cell: 'black' },
  boxes: [['black', [0, 1.805, -1.62], [0.05, 0.055, 0.17]]],
};

/** A black arch moulding around a wheel (side view): a band `w` wide outside the arch, from the sill up and over. (Not used: projected onto the flared lip it frays.) */
export const archTrim = (zw: number, hub: number, r: number, w: number, low: number): Decal => {
  const outer: P2[] = [], inner: P2[] = [];
  for (let i = 0; i <= 14; i++) { const a = Math.PI * (i / 14); outer.push([zw + Math.cos(a) * (r + w), hub + Math.sin(a) * (r + w)]); inner.push([zw + Math.cos(a) * (r - 0.005), hub + Math.sin(a) * (r - 0.005)]); }
  const poly: P2[] = [[zw + r + w, low], ...outer, [zw - r - w, low], [zw - r + 0.01, low], ...inner.reverse(), [zw + r - 0.01, low]];
  return { poly, frame: 'side', cell: 'black', map: 'flat', off: 0.005, facing: [1, -0.2, 0], edge: 0.05 };
};

// ------------------------------------------------------------------------------------------------ Rafet: a sporty five-door hatch
const F = carModelDims('rafet');
const rafet: CarDef = {
  id: 'rafet', model: 'rafet', name: 'Rafet', inspiredBy: 'a current sporty five-door city hatch (claw lamps, fang lights, black arches)',
  paint: 0xf1bf17,
  body: {
    L: F.L, W: F.W,
    top: [[-2.03, 0.94], [-1.99, 1.0], [-1.92, 1.04], [-1.85, 1.06], [-1.65, 1.2], [-1.4, 1.355], [-1.2, 1.415], [-0.8, 1.43], [-0.3, 1.43], [-0.05, 1.41], [0.2, 1.3], [0.42, 1.13], [0.6, 0.97],
      [0.9, 0.92], [1.25, 0.86], [1.55, 0.8], [1.78, 0.74], [1.92, 0.68], [2.0, 0.62], [2.03, 0.56]],
    belt: [[-2.03, 0.88], [-1.85, 0.95], [-1.55, 0.985], [-1.2, 0.99], [-0.9, 0.955], [-0.4, 0.935], [0.3, 0.925], [0.6, 0.915], [1.0, 0.85], [1.45, 0.76], [1.8, 0.69], [1.95, 0.64], [2.03, 0.54]],
    bot: [[-2.03, 0.34], [-1.95, 0.25], [-1.7, 0.19], [1.7, 0.19], [1.88, 0.23], [1.98, 0.28], [2.03, 0.34]],
    front: { z0: 1.45, p: 3.2 }, rear: { z0: -1.7, p: 3.4 },
    roofHw: [[-2.03, 0.6], [-1.3, 0.58], [-0.6, 0.6], [0.0, 0.61], [0.6, 0.7], [2.03, 0.78]],
    n: 4.2, shoulderIn: 0.035, tuck: 0.075, waist: 0.62,
    axles: [{ z: F.fz, r: F.r, arch: F.r + 0.06 }, { z: F.rz, r: F.r, arch: F.r + 0.06 }],
    greenhouse: [-1.86, 0.61], blackRoof: true,
    stations: [0.62, -0.35, -0.98, 1.97, -1.97],
  },
  decals: [
    side(soft([[0.52, 0.955], [0.08, 1.35], [-0.29, 1.365], [-0.31, 0.95]], 2, 0.16), 'glass', 0.008),
    side(soft([[-0.39, 0.95], [-0.39, 1.365], [-0.88, 1.355], [-1.12, 1.17], [-1.08, 0.98]], 2, 0.16), 'glass', 0.008),
    { poly: soft([[-0.68, 0.58], [0.68, 0.58], [0.6, -0.02], [-0.6, -0.02]], 2, 0.12), frame: 'top', cell: 'glass', off: 0.008, mirror: false, facing: [0, 1, 0.7], edge: 0.06 },
    { poly: soft([[-0.54, -1.8], [0.54, -1.8], [0.5, -1.27], [-0.5, -1.27]], 2, 0.12), frame: 'top', cell: 'glass', off: 0.008, mirror: false, facing: [0, 1, -0.9], edge: 0.05 },
    // claw lamps high on the corners, the « fang » light dropping from each down the bumper, the wide mesh grille, the lower black band
    { poly: soft([[0.36, 0.68], [0.5, 0.66], [0.74, 0.7], [0.84, 0.755], [0.83, 0.81], [0.62, 0.79], [0.4, 0.74]], 1, 0.2), frame: 'front', cell: 'headC', off: 0.007, mirror: true, facing: [0.4, 0.3, 1], edge: 0.03 },
    { poly: [[0.71, 0.68], [0.75, 0.68], [0.7, 0.36], [0.67, 0.36]], frame: 'front', cell: 'led', map: 'flat', off: 0.008, mirror: true, facing: [0.4, 0, 1], edge: 0.02 },
    { poly: soft([[-0.33, 0.66], [0.33, 0.66], [0.52, 0.5], [0.56, 0.36], [0.48, 0.3], [-0.48, 0.3], [-0.56, 0.36], [-0.52, 0.5]], 1, 0.15), frame: 'front', cell: 'grilleHex', off: 0.006, mirror: false, facing: [0, 0, 1], edge: 0.04 },
    { poly: [[-0.7, 0.215], [0.7, 0.215], [0.74, 0.275], [-0.74, 0.275]], frame: 'front', cell: 'black', map: 'flat', off: 0.006, mirror: false, facing: [0, -0.2, 1], edge: 0.05 },
    { poly: rrect(0, 0.42, 0.52, 0.11, 0.015), frame: 'front', cell: 'plate', off: 0.012, mirror: false, facing: [0, 0, 1], edge: 0.06 },
    // tail: a gloss black band joining the claw lamps across the hatch, plate below, black diffuser
    { poly: soft([[0.42, 0.95], [0.78, 0.965], [0.86, 0.9], [0.84, 0.82], [0.46, 0.84]], 1), frame: 'rear', cell: 'tailC', off: 0.008, mirror: true, facing: [0.3, 0, -1], edge: 0.03 },
    { poly: [[-0.5, 0.85], [0.5, 0.85], [0.5, 0.94], [-0.5, 0.94]], frame: 'rear', cell: 'black', off: 0.006, mirror: false, facing: [0, 0, -1], edge: 0.04 },
    { poly: rrect(0, 0.62, 0.52, 0.11, 0.015), frame: 'rear', cell: 'plate', off: 0.01, mirror: false, facing: [0, 0, -1], edge: 0.06 },
    { poly: soft([[-0.66, 0.42], [0.66, 0.42], [0.76, 0.33], [0.74, 0.27], [-0.74, 0.27], [-0.76, 0.33]], 1), frame: 'rear', cell: 'black', off: 0.006, mirror: false, facing: [0, 0, -1], edge: 0.05 },
    // the black arch mouldings and sills, the seams, the handles
    side([[0.9, 0.2], [-0.84, 0.2], [-0.84, 0.31], [0.9, 0.31]], 'black', 0.005, { map: 'flat', edge: 0.06 }),
    seam([0.62, 0.32], [0.62, 0.915]), seam([-0.35, 0.32], [-0.35, 0.94]), seam([-1.0, 0.33], [-1.07, 0.6]), seam([-1.07, 0.6], [-1.07, 0.97]),
    side(rrect(0.0, 0.875, 0.13, 0.03, 0.012), 'seam', 0.005, { map: 'flat' }), side(rrect(-0.86, 0.89, 0.13, 0.03, 0.012), 'seam', 0.005, { map: 'flat' }),
  ],
  wheel: { spokes: 12, rim: 'rimBlack', face: 'rimSilver', rimShare: 0.64, wIn: 0.16, wOut: 0.08, dish: 0.03, caliper: 'disc' },
  mirror: { z: 0.48, y: 0.99, size: [0.13, 0.1, 0.19], cell: 'black' },
  boxes: [['black', [0, 1.435, -1.02], [0.04, 0.05, 0.14]]],
};

// ------------------------------------------------------------------------------------------------ Gaïndé: an SUV coupé
const G = carModelDims('gainde');
const gainde: CarDef = {
  id: 'gainde', model: 'gainde', name: 'Gaïndé', inspiredBy: 'a large German-style SUV coupé (sloping roof, big single grille, black wheels)',
  paint: 0xf0f0ee,
  body: {
    L: G.L, W: G.W,
    top: [[-2.47, 1.06], [-2.43, 1.15], [-2.36, 1.2], [-2.28, 1.215], [-2.15, 1.27], [-1.85, 1.43], [-1.5, 1.56], [-1.0, 1.65], [-0.4, 1.69], [0.15, 1.69], [0.38, 1.66], [0.6, 1.47], [0.8, 1.29], [0.95, 1.13],
      [1.3, 1.1], [1.8, 1.06], [2.15, 1.02], [2.34, 0.97], [2.43, 0.9], [2.47, 0.82]],
    belt: [[-2.47, 1.0], [-2.25, 1.1], [-1.9, 1.15], [-1.4, 1.16], [-0.8, 1.14], [0.0, 1.12], [0.95, 1.1], [1.5, 1.07], [2.0, 1.03], [2.3, 0.97], [2.47, 0.8]],
    bot: [[-2.47, 0.58], [-2.38, 0.46], [-2.1, 0.34], [2.1, 0.34], [2.35, 0.41], [2.47, 0.5]],
    front: { z0: 1.8, p: 3.8 }, rear: { z0: -1.95, p: 3.6 },
    roofHw: [[-2.47, 0.66], [-1.6, 0.68], [-0.6, 0.72], [0.4, 0.75], [0.95, 0.86], [2.47, 0.9]],
    n: 5.2, shoulderIn: 0.05, tuck: 0.065, waist: 0.6,
    axles: [{ z: G.fz, r: G.r, arch: G.r + 0.07 }, { z: G.rz, r: G.r, arch: G.r + 0.07 }],
    greenhouse: [-2.16, 0.96], blackRoof: false,
    stations: [0.96, -0.2, -1.0, 2.41, -2.41],
  },
  decals: [
    // the black window line (the glass sits on it), the glass, the B pillar black
    side(soft([[0.92, 1.135], [0.4, 1.645], [-0.4, 1.655], [-1.2, 1.56], [-1.85, 1.35], [-1.98, 1.17]], 2, 0.15), 'black', 0.009, { map: 'flat', edge: 0.13, facing: [1, 0.5, 0.25] }),
    side(soft([[0.86, 1.15], [0.4, 1.625], [-0.12, 1.635], [-0.14, 1.15]], 2, 0.15), 'glass', 0.013),
    side(soft([[-0.24, 1.15], [-0.24, 1.625], [-0.95, 1.575], [-1.3, 1.45], [-1.2, 1.17]], 2, 0.15), 'glass', 0.013, { edge: 0.05, facing: [1, 0.5, 0] }),
    side(soft([[-1.32, 1.17], [-1.42, 1.42], [-1.8, 1.31], [-1.9, 1.18]], 1, 0.15), 'glass', 0.013, { edge: 0.05, facing: [1, 0.5, 0] }),
    { poly: soft([[-0.82, 0.94], [0.82, 0.94], [0.72, 0.37], [-0.72, 0.37]], 2, 0.1), frame: 'top', cell: 'glass', off: 0.008, mirror: false, facing: [0, 1, 0.8], edge: 0.06 },
    { poly: soft([[-0.62, -2.12], [0.62, -2.12], [0.6, -1.6], [-0.6, -1.6]], 2, 0.1), frame: 'top', cell: 'glass', off: 0.008, mirror: false, facing: [0, 1, -0.6], edge: 0.05 },
    // the front: slim lamps, one big grille of vertical slats, deep corner intakes, the black lip
    { poly: soft([[0.5, 0.92], [0.92, 0.965], [0.94, 1.02], [0.6, 1.005], [0.47, 0.96]], 1, 0.2), frame: 'front', cell: 'headD', off: 0.007, mirror: true, facing: [0.35, 0.2, 1], edge: 0.03 },
    { poly: soft([[-0.4, 0.98], [0.4, 0.98], [0.46, 0.9], [0.44, 0.66], [0.36, 0.6], [-0.36, 0.6], [-0.44, 0.66], [-0.46, 0.9]], 1, 0.12), frame: 'front', cell: 'grilleKidney', off: 0.006, mirror: false, facing: [0, 0, 1], edge: 0.04 },
    { poly: soft([[0.56, 0.42], [0.92, 0.46], [0.94, 0.8], [0.84, 0.82], [0.8, 0.58], [0.58, 0.55]], 1, 0.15), frame: 'front', cell: 'grilleMesh', off: 0.006, mirror: true, facing: [0.3, 0, 1], edge: 0.03 },
    { poly: [[-0.5, 0.42], [0.5, 0.42], [0.52, 0.54], [-0.52, 0.54]], frame: 'front', cell: 'grilleMesh', off: 0.006, mirror: false, facing: [0, 0, 1], edge: 0.04 },
    { poly: [[-0.98, 0.37], [0.98, 0.37], [0.98, 0.42], [-0.98, 0.42]], frame: 'front', cell: 'black', map: 'flat', off: 0.005, mirror: false, facing: [0, 0, 1], edge: 0.05 },
    { poly: rrect(0, 0.71, 0.52, 0.11, 0.015), frame: 'front', cell: 'plate', off: 0.014, mirror: false, facing: [0, 0, 1], edge: 0.06 },
    // tail: L-shaped lamps, plate, black diffuser and four tips
    { poly: soft([[0.46, 0.98], [0.94, 0.99], [0.97, 1.07], [0.6, 1.08], [0.5, 1.04]], 1, 0.2), frame: 'rear', cell: 'tailD', off: 0.008, mirror: true, facing: [0.3, 0.1, -1], edge: 0.03 },
    { poly: rrect(0, 0.86, 0.52, 0.11, 0.015), frame: 'rear', cell: 'plate', off: 0.01, mirror: false, facing: [0, 0, -1], edge: 0.06 },
    { poly: soft([[-0.86, 0.58], [0.86, 0.58], [0.92, 0.46], [-0.92, 0.46]], 1), frame: 'rear', cell: 'black', off: 0.006, mirror: false, facing: [0, 0, -1], edge: 0.05 },
    { poly: ellipse(0.62, 0.51, 0.055, 0.04, 12), frame: 'rear', cell: 'chrome', off: 0.011, mirror: true, facing: [0, 0, -1] },
    { poly: ellipse(0.48, 0.51, 0.055, 0.04, 12), frame: 'rear', cell: 'chrome', off: 0.011, mirror: true, facing: [0, 0, -1] },
    // the fender gill behind the front wheel, black sills, seams, flush handles
    side([[1.08, 0.88], [1.02, 0.86], [0.99, 0.72], [1.04, 0.73]], 'black', 0.007, { map: 'flat', edge: 0.03 }),
    side([[1.0, 0.36], [-0.98, 0.36], [-0.98, 0.46], [1.0, 0.46]], 'black', 0.005, { map: 'flat', edge: 0.06 }),
    seam([0.96, 0.47], [0.96, 1.11]), seam([-0.2, 0.47], [-0.2, 1.14]), seam([-0.2, 0.47], [-1.0, 0.47]), seam([-1.0, 0.47], [-1.1, 0.72]), seam([-1.1, 0.72], [-1.18, 1.15]),
    side(rrect(0.02, 1.04, 0.17, 0.028, 0.012), 'seam', 0.005, { map: 'flat' }), side(rrect(-0.85, 1.05, 0.17, 0.028, 0.012), 'seam', 0.005, { map: 'flat' }),
  ],
  wheel: { spokes: 10, rim: 'rimBlack', face: 'rimBlack', rimShare: 0.67, wIn: 0.16, wOut: 0.09, dish: 0.035, caliper: 'caliper' },
  mirror: { z: 0.84, y: 1.22, size: [0.15, 0.13, 0.24], cell: 'black' },
  boxes: [['black', [0, 1.695, -0.9], [0.05, 0.05, 0.16]]],
};

export const CARS: Record<string, CarDef> = { teranga, lamane, rafet, gainde };

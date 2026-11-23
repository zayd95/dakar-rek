// Prints the numbers a replacement model must meet: the procedural kit vehicle the game uses today, as JSON.
// Usage: npx vite-node scripts/vehicles/kit-target.ts <kind=sedan> <seed=18>
// (sedan seed 18 was the retired `clando`; the modern sedan `compacte` is the seed of its silver-grey; moto seed 8 is the Jakarta.)
import { vehicleSpec, type VehicleKind } from '../../src/actors/vehicleKit';

const kind = (process.argv[2] ?? 'sedan') as VehicleKind, seed = Number(process.argv[3] ?? 18);
const s = vehicleSpec(kind, { seed, driver: false, passengers: false });
const driver = s.seats.find(x => x.kind === 'driver') ?? s.seats[0];
console.log(JSON.stringify({
  kind, seed, length: s.length, width: s.width, height: s.height, wheelbase: s.wheelbase,
  wheels: s.wheels.map(w => ({ x: w.x, y: w.y, z: w.z, r: w.r, width: w.width, steer: w.steer })),
  driver: { x: driver.x, z: driver.z, top: driver.top },
  cameras: { chase: s.cameras.chase, driver: s.cameras.driver },
  lights: s.lights, drive: s.drive,
  budget: s.budget,
}, null, 1));

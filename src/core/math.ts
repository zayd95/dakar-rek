/**
 * The length of (x, z), as Math.sqrt(x² + z²): the per-frame loops (people, cars, the camera) measure hundreds of
 * distances a frame, and `Math.hypot` costs about 40 ns a call against 3 for this (it is a generic builtin that boxes its
 * result). Only for values nowhere near overflow or underflow, such as positions in metres.
 */
export const len2 = (x: number, z: number): number => Math.sqrt(x * x + z * z);

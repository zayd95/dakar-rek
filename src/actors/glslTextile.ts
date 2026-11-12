/**
 * Shader snippets shared by the body's garment recolour (src/actors/meshyLook.ts) and the procedural hair and headwear (src/actors/hairStyles.ts): a small 3D value
 * noise, and the studio's geometric textile print. Plain GLSL text, no uniforms: each material declares its own.
 */
export const GLSL_NOISE = /* glsl */`
float tnHash(vec3 p){ p = fract(p*.3183099 + .1); p *= 17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float tnNoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(tnHash(i), tnHash(i+vec3(1,0,0)), f.x), mix(tnHash(i+vec3(0,1,0)), tnHash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(tnHash(i+vec3(0,0,1)), tnHash(i+vec3(1,0,1)), f.x), mix(tnHash(i+vec3(0,1,1)), tnHash(i+vec3(1,1,1)), f.x), f.y), f.z);
}
`;

/**
 * A geometric print in the spirit of West African printed and mud-dyed cloth (not a copy of any one cloth, and not called « wax »): bands of diamonds with a dot,
 * separated by a fine double rule and a band of chevrons. `uv` in units of one motif (the caller scales it: about 6 cm a motif on a garment).
 * Returns the mix weights of the base, light and dark inks (x, y, z), summing to 1.
 */
export const GLSL_TEXTILE = /* glsl */`
vec3 textileInks(vec2 uv){
  float band = mod(floor(uv.y), 3.);                       // two rows of diamonds, one row of chevrons
  vec2 g = fract(uv) - .5;
  float light = 0., dark = 0.;
  float aa = .035;
  if (band < 1.5) {
    float d = abs(g.x) + abs(g.y);
    light = smoothstep(.40+aa, .40, d) - smoothstep(.29+aa, .29, d);            // the diamond's outline
    dark = smoothstep(.10+aa, .10, length(g));                                   // its dot
    float h = abs(g.x) + abs(g.y - .5); light = max(light, smoothstep(.13+aa, .13, h) * 0.); // (reserved)
  } else {
    float z = abs(fract(uv.x*1.5) - .5);                                         // a chevron line
    light = smoothstep(.07+aa, .07, abs(g.y - (z - .25) * .9));
    dark = smoothstep(.06+aa, .06, abs(g.y + .3 - (z - .25) * .9)) * .9;
  }
  float rule = smoothstep(.025+aa*.5, .025, abs(g.y + .5 - .04)) + smoothstep(.02+aa*.5, .02, abs(g.y + .5 - .1));   // a fine double rule between rows
  dark = max(dark, rule * step(band, .5));
  light = clamp(light - dark, 0., 1.);
  return vec3(1. - light - dark, light, dark);
}
`;

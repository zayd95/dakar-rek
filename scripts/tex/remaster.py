"""Remaster the batch 3 Higgsfield textures into the 512 px game textures in public/assets/tex.

Run from the repo root: python3 scripts/tex/remaster.py [--report]   (numpy and Pillow only)

Sources are the 2048 px seamless files in assets-src/references/higgsfield (provenance in PROVENANCE.md).
Every filter works on the whole tile in the frequency domain, so it wraps around the edges and the result stays seamless.

What the remaster does, per texture (parameters in TEXTURES):
- equalise: divides out the local mean brightness (a periodic Gaussian of the given size, in fractions of the tile).
  Tile-sized blotches are what make a repeat obvious from a distance; the fine detail (joints, cracks, grain) stays.
  `down` only flattens along each column, keeping the corrugation profile across the sheet.
  `wrap` crossfades the top/bottom join (galvanized sheet: its streaks were cut there, a faint band when tiled).
  `mask` leaves the darkest pixels (mortar joints, tile gaps, terrazzo chips) out of the mean, so they keep their depth.
- grey / colour / neutral: as before (detail maps modulate the vertex colour; colour maps keep their hue).
- lift: raises the darkest values so tile gaps read as shadow, not as black lines (the shader adds the relief now).
--report prints, for the old and the new game file: tile-scale blotchiness (spread of a 1/32-tile blur, lower repeats less)
and the wrap seam (difference across the wrap edge / difference between neighbouring rows, about 1 is invisible).
"""
import sys
import numpy as np
from PIL import Image

SRC = 'assets-src/references/higgsfield/'
OUT = 'public/assets/tex/'
SIZE = 512


def load(name):
    return np.asarray(Image.open(SRC + name).convert('RGB')).astype(np.float64) / 255


def lum(a):
    return a @ np.array([0.2126, 0.7152, 0.0722]) if a.ndim == 3 else a


def blur(x, sx, sy=None):
    """Periodic Gaussian blur, sigma in fractions of the tile (sx across, sy down)."""
    sy = sx if sy is None else sy
    h, w = x.shape
    fy = np.fft.fftfreq(h)[:, None] * h  # cycles per tile
    fx = np.fft.fftfreq(w)[None, :] * w
    k = np.exp(-2 * np.pi ** 2 * ((sx * fx) ** 2 + (sy * fy) ** 2))
    return np.real(np.fft.ifft2(np.fft.fft2(x) * k))


def equalise(a, sx, sy=None, strength=1.0, mask=None):
    """Flatten brightness variations larger than the blur; mask = percentile of darkest pixels left out of the mean."""
    L = lum(a)
    m = np.ones_like(L) if mask is None else (L > np.percentile(L, mask)).astype(np.float64)
    mu = blur(L * m, sx, sy) / np.maximum(blur(m, sx, sy), 1e-3)
    target = (L * m).sum() / m.sum()
    g = (target / np.maximum(mu, 1e-3)) ** strength
    return a * (g[..., None] if a.ndim == 3 else g)


def equalise_down(a, sy, strength=1.0):
    """Flatten brightness variations along each column (banding, blotches down a corrugation) and keep the profile across."""
    L = lum(a)
    mu = blur(L, 0, sy)
    g = (L.mean(axis=0, keepdims=True) / np.maximum(mu, 1e-3)) ** strength
    return a * (g[..., None] if a.ndim == 3 else g)


def wrap_down(a, frac):
    """Crossfade the bottom rows into the top ones and stretch back: a seamless top/bottom join for textures whose streaks
    run down the tile (stretching along them does not show)."""
    h = a.shape[0]; n = int(h * frac)
    w = np.linspace(0, 1, n, endpoint=False)[:, None, None]
    out = a[:h - n].copy()
    out[:n] = a[h - n:] * (1 - w) + a[:n] * w
    im = Image.fromarray((out.clip(0, 1) * 255).round().astype(np.uint8), 'RGB').resize((a.shape[1], h), Image.LANCZOS)
    return np.asarray(im).astype(np.float64) / 255


def resize(a):
    mode = 'RGB' if a.ndim == 3 else 'L'
    im = Image.fromarray((a.clip(0, 1) * 255).round().astype(np.uint8), mode)
    return np.asarray(im.resize((SIZE, SIZE), Image.LANCZOS)).astype(np.float64) / 255


def grey(a, contrast, mean, lift=None):
    g = resize(lum(a))
    g = (g - g.mean()) * contrast + mean
    if lift:  # (threshold, keep): values under the threshold keep only `keep` of their distance to it
        t, keep = lift
        g = np.where(g < t, t - (t - g) * keep, g)
    return np.repeat(g[..., None], 3, axis=2)


def colour(a, mean):
    c = resize(a)
    return c * (mean / c.mean())


def neutral(a, mean):
    c = resize(a)
    return c / c.reshape(-1, 3).mean(0) * mean


# name: (source, steps before the finish, finish)
TEXTURES = {
    'hollow_block': ('50_texture_hollow_block.jpg',
                     [dict(sx=0.12), dict(sx=0.05, strength=0.7, mask=18)],
                     lambda a: grey(a, 1.5, 0.84)),
    'asphalt': ('27_texture_asphalt.jpg',
                [dict(sx=0.06, strength=0.85)],
                lambda a: grey(a, 1.4, 0.9)),
    'clay_tiles': ('29_texture_clay_roof_tiles.jpg',
                   [dict(sx=0.05, strength=0.6, mask=22)],
                   lambda a: grey(a, 1.15, 0.86, lift=(0.5, 0.55))),
    'corrugated': ('25_texture_corrugated_galvanized.jpg',
                   [dict(down=0.15, strength=0.7), dict(wrap=0.125)],
                   lambda a: grey(a, 1.4, 0.88)),
    'corrugated_rusty': ('26_texture_corrugated_rusty.jpg',
                         [dict(sx=0.08, strength=0.7)],
                         lambda a: colour(a, 0.86)),
    'palm_trunk': ('49_texture_palm_trunk_v2_tiled.jpg',
                   [dict(sx=0.03, strength=0.85)],
                   lambda a: grey(a, 1.3, 0.86)),
    'terrazzo': ('28_texture_terrazzo_tiled.jpg',
                 [dict(sx=0.1, strength=0.6, mask=20)],
                 lambda a: colour(a, 0.92)),
    'sand_trampled': ('31_texture_sand_trampled.jpg',
                      [dict(sx=0.08, strength=0.8)],
                      lambda a: neutral(a, 0.9)),
}


def blotch(g):
    """Spread of a 1/32-tile blur relative to the mean: patches (block tones, bands, stains) that show as a repeat."""
    b = blur(g, 1 / 32)
    return b.std() / g.mean()


def seam(g):
    """Wrap-edge difference over the mean neighbouring-row/column difference (both axes, worst)."""
    out = []
    for x in (g, g.T):
        across = np.abs(x[0] - x[-1]).mean()
        inside = np.abs(np.diff(x, axis=0)).mean()
        out.append(across / inside)
    return max(out)


def main():
    report = '--report' in sys.argv
    old = {n: lum(np.asarray(Image.open(OUT + n + '.jpg').convert('RGB')).astype(np.float64) / 255) for n in TEXTURES} if report else {}
    for name, (src, steps, finish) in TEXTURES.items():
        a = load(src)
        for s in steps:
            a = wrap_down(a, s['wrap']) if 'wrap' in s else equalise_down(a, s['down'], s['strength']) if 'down' in s else equalise(a, **s)
        out = finish(a)
        Image.fromarray((out.clip(0, 1) * 255).round().astype(np.uint8), 'RGB').save(OUT + name + '.jpg', quality=88)
        if report:
            g = lum(out)
            print(f'{name:17s} blotch {blotch(old[name]):.3f} -> {blotch(g):.3f}   seam {seam(old[name]):.2f} -> {seam(g):.2f}   mean {g.mean():.2f}')


if __name__ == '__main__':
    main()

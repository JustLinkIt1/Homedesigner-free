# Seamless 512 px material textures for HomeDesigner, generated with numpy.
# Every pattern is built from periodic functions or FFT-filtered noise, so the
# image tiles with no seam.
import numpy as np, os, sys
from PIL import Image
N = 512
OUT = sys.argv[1]
yy, xx = np.mgrid[0:N, 0:N] / N

def norm(a, lo=1, hi=99):
    l, h = np.percentile(a, [lo, hi]); return np.clip((a - l) / (h - l + 1e-9), 0, 1)
def spectral(beta, seed, ax=1.0, ay=1.0):
    r = np.random.default_rng(seed)
    f = np.fft.fft2(r.standard_normal((N, N)))
    fx = np.fft.fftfreq(N)[None, :] * ax; fy = np.fft.fftfreq(N)[:, None] * ay
    k = np.sqrt(fx * fx + fy * fy); k[0, 0] = 1
    amp = 1 / k ** beta; amp[0, 0] = 0
    return norm(np.real(np.fft.ifft2(f * amp)))
def blur(a, sigma):
    fx = np.fft.fftfreq(N)[None, :]; fy = np.fft.fftfreq(N)[:, None]
    return np.real(np.fft.ifft2(np.fft.fft2(a) * np.exp(-2 * np.pi ** 2 * sigma ** 2 * (fx * fx + fy * fy))))
def white(seed): return np.random.default_rng(seed).random((N, N))
def col(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)], float) / 255
def mix(a, b, t): return a[None, None, :] * (1 - t[..., None]) + b[None, None, :] * t[..., None]
def save(name, rgb):
    img = Image.fromarray((np.clip(rgb, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGB')
    path = os.path.join(OUT, name + '.webp'); img.save(path, 'WEBP', quality=84, method=6)
    m = (np.clip(rgb, 0, 1).reshape(-1, 3).mean(0) * 255).astype(int)
    print(f"{name}: {os.path.getsize(path)//1024} KB, mean #{m[0]:02x}{m[1]:02x}{m[2]:02x}")
def specks(seed, density, sigma):
    return norm(blur((white(seed) < density).astype(float), sigma), 0, 99.8)
def veins(seed, k, warp, width, angle=0.6):
    w = spectral(2.4, seed) - 0.5; w2 = spectral(2.0, seed + 7) - 0.5
    kx, ky = round(k * np.cos(angle)), round(k * np.sin(angle))
    ph = kx * xx + ky * yy + warp * w + 0.35 * warp * w2
    d = np.abs(((ph + 0.5) % 1.0) - 0.5)
    return np.exp(-(d / width) ** 2) * norm(spectral(1.6, seed + 3), 5, 95)

# --- stone
t = 0.5 * spectral(1.2, 1) + 0.5 * white(2)
q = mix(col('#f1f0ec'), col('#dcdad4'), norm(blur(t, 0.6)))
q = q * (1 - 0.10 * specks(3, 0.004, 0.9)[..., None]) + 0.03 * specks(4, 0.002, 0.7)[..., None]
save('quartz_white', q)

g = mix(col('#141518'), col('#2e3034'), spectral(1.0, 11))
g = g + 0.42 * specks(12, 0.012, 0.8)[..., None] * col('#b9bcc2')[None, None, :] + 0.5 * specks(13, 0.0015, 1.1)[..., None] * col('#d8d2c6')[None, None, :]
save('granite_black', g)

base = mix(col('#f4f1ec'), col('#e6e2db'), spectral(2.2, 21))
v1 = veins(22, 2, 1.6, 0.035); v2 = veins(23, 5, 1.1, 0.012, angle=0.9)
m = base * (1 - 0.55 * v1[..., None]) + (0.55 * v1[..., None]) * col('#8f8c8a')[None, None, :]
m = m * (1 - 0.35 * v2[..., None]) + (0.35 * v2[..., None]) * col('#b79a6a')[None, None, :]
save('marble_calacatta', m)

base = mix(col('#121214'), col('#232327'), spectral(2.0, 31))
v1 = veins(32, 2, 1.8, 0.02, angle=1.0); v2 = veins(33, 6, 1.2, 0.008, angle=0.3)
m = base + 0.85 * v1[..., None] * col('#e9e7e2')[None, None, :] + 0.4 * v2[..., None] * col('#cfcdc8')[None, None, :]
save('marble_nero', m)

bands = norm(0.7 * spectral(2.0, 41, ax=0.18, ay=1.0) + 0.3 * spectral(1.2, 42, ax=0.4, ay=1.0))
tr = mix(col('#e4d6bc'), col('#c9b693'), bands)
pits = specks(43, 0.006, 1.0) * norm(spectral(1.5, 44, ax=0.3, ay=1.0))
tr = tr * (1 - 0.45 * pits[..., None])
save('travertine', tr)

cleft = norm(0.6 * spectral(2.2, 51, ax=0.5, ay=1.0) + 0.4 * spectral(1.3, 52))
sl = mix(col('#30353a'), col('#4b5157'), cleft) + 0.03 * (white(53)[..., None] - 0.5)
save('slate_dark', sl)

# terrazzo: irregular chips on a pale binder, wrapped at the edges
rng = np.random.default_rng(61)
tz = mix(col('#e2dcd1'), col('#d6d0c4'), spectral(1.5, 62))
chipcols = ['#b9aa94', '#8d8478', '#c9b8a0', '#6f6a63', '#a2896f', '#efe9df', '#9aa39c', '#c08f73']
for _ in range(520):
    cx, cy = rng.random(2); rx = rng.uniform(0.006, 0.026); ry = rx * rng.uniform(0.5, 1.0); a = rng.uniform(0, np.pi)
    c = col(chipcols[rng.integers(len(chipcols))]) * rng.uniform(0.9, 1.08)
    dx = (xx - cx + 0.5) % 1 - 0.5; dy = (yy - cy + 0.5) % 1 - 0.5
    u = dx * np.cos(a) + dy * np.sin(a); v = -dx * np.sin(a) + dy * np.cos(a)
    e = np.abs(u / rx) ** 3 + np.abs(v / ry) ** 3
    mask = np.clip((1 - e) * 6, 0, 1)[..., None]
    tz = tz * (1 - mask) + c[None, None, :] * mask
save('terrazzo_slab', tz)

cs = mix(col('#bdbbb7'), col('#a8a6a2'), norm(0.75 * spectral(2.0, 71) + 0.25 * spectral(0.8, 72))) + 0.025 * (white(73)[..., None] - 0.5)
cs = cs * (1 - 0.12 * specks(74, 0.0012, 1.2)[..., None])
save('concrete_smooth', cs)

# --- wood
def grain(seed, stretch=0.06):
    return norm(0.65 * spectral(1.6, seed, ax=1.0, ay=stretch) + 0.35 * spectral(0.9, seed + 1, ax=1.0, ay=stretch * 0.5))
staves = 8
rng = np.random.default_rng(81)
sx = np.floor(xx * staves).astype(int)
tone = rng.uniform(-0.09, 0.09, staves)[sx]
off = rng.random(staves)[sx]
gy = (yy + off) % 1.0
cols = np.arange(N)[None, :].repeat(N, 0)
g = grain(82)[np.floor(gy * N).astype(int) % N, cols]
bb = mix(col('#d3a86e'), col('#b08350'), g) * (1 + tone[..., None])
edge = np.minimum((xx * staves) % 1, 1 - (xx * staves) % 1)
joint = np.abs(((gy * 2) % 1) - 0.5)
bb = bb * (1 - 0.22 * np.exp(-(edge / 0.012) ** 2))[..., None] * (1 - 0.18 * np.exp(-(joint / 0.004) ** 2))[..., None]
save('butcher_block_oak', bb)

wal = mix(col('#7a5236'), col('#4a2e1c'), norm(0.72 * grain(92, 0.018) + 0.28 * spectral(2.0, 91, ax=1.0, ay=0.12)))
wal = wal * (1 - 0.08 * norm(spectral(1.0, 93, ax=1.0, ay=0.01))[..., None])
save('walnut_slab', wal)

# --- metal
st = norm(0.8 * spectral(0.9, 101, ax=1.0, ay=0.012) + 0.2 * spectral(1.5, 102, ax=1.0, ay=0.05))
save('steel_brushed', mix(col('#aeb1b5'), col('#c6c9cc'), st))

# --- tiles
# flat-top hexagons: 4 horizontal periods (3r each) and 7 rows (sqrt3 r each);
# about 1% stretch keeps it seamless
a, b = 4, 7
R3 = np.sqrt(3)
u = xx * a * 3.0; v = yy * b * R3
def hexdist(u, v):
    best = np.full(u.shape, 9.0)
    for ox, oy in ((0, 0), (1.5, R3 / 2)):
        cu = np.abs((u - ox + 1.5) % 3.0 - 1.5); cv = np.abs((v - oy + R3 / 2) % R3 - R3 / 2)
        best = np.minimum(best, np.maximum(cu * (R3 / 2) + cv * 0.5, cv))
    return best
hd = hexdist(u, v) / (R3 / 2)   # 1.0 at the hexagon edge
tile = np.clip((0.95 - hd) / 0.04, 0, 1)
hx = mix(col('#b9b6ae'), col('#efeeea'), tile) * (1 - 0.04 * spectral(1.5, 111)[..., None])
save('hex_tile_white', hx)

n = 4
rng = np.random.default_rng(121)
tx = np.floor(xx * n).astype(int); ty = np.floor(yy * n).astype(int)
tone = rng.uniform(-0.16, 0.16, (n, n))[ty, tx]
fx = (xx * n) % 1; fy = (yy * n) % 1
dome = 1 - 0.5 * ((fx - 0.5) ** 2 + (fy - 0.5) ** 2)
glaze = norm(spectral(1.8, 122))
zg = mix(col('#3f6e59'), col('#6a9a82'), norm(0.6 * glaze + 0.4 * dome)) * (1 + tone[..., None])
e = np.minimum(np.minimum(fx, 1 - fx), np.minimum(fy, 1 - fy))
grout = np.clip(1 - e / 0.022, 0, 1)[..., None]
zg = zg * (1 - grout) + col('#d8d3c7')[None, None, :] * grout
save('zellige_green', zg)

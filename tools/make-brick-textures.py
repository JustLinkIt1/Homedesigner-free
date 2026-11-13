"""Draw the clean brick wall textures in public/textures.

    python tools/make-brick-textures.py

The photographed bricks in the library are heavily weathered: burnt headers next
to chalk-white ones. Close up that is characterful; across a whole elevation it
turns into noise, and a house clad in it looks camouflaged. These are drawn
instead, to the size of a real wall: a 215 x 65 mm brick, a 10 mm joint,
stretcher bond. One image is 4 bricks by 12 courses, which is 90 cm each way,
so the material's scaleCm is 90 and the bond tiles without a seam.

The result is deterministic: the same script always writes the same files.
"""
import os
import random

from PIL import Image, ImageDraw, ImageFilter

SIZE = 512
COLS, ROWS = 4, 12
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'textures')

# name -> (brick colour, mortar colour, how far brick tones wander, seed)
BRICKS = {
    'brick_red_stock': ((166, 88, 64), (196, 188, 174), 13, 7),
    'brick_buff_stock': ((201, 170, 122), (214, 207, 193), 11, 19),
    'brick_grey_stock': ((132, 127, 122), (190, 187, 180), 9, 31),
}


def clamp(v):
    return max(0, min(255, int(round(v))))


def draw(name, brick, mortar, wander, seed):
    rnd = random.Random(seed)
    img = Image.new('RGB', (SIZE, SIZE), mortar)
    d = ImageDraw.Draw(img)
    bw, bh = SIZE / COLS, SIZE / ROWS
    joint = SIZE * 10 / 900  # a 10 mm joint in a 900 mm image
    for row in range(ROWS):
        shift = bw / 2 if row % 2 else 0
        for col in range(-1, COLS + 1):
            # One tone per brick, the same for the two halves of a brick that
            # is cut by the edge of the image, so the wrap shows no seam.
            key = (row, col % COLS)
            tone = random.Random(hash((seed, key)) & 0xFFFFFFFF)
            light = tone.uniform(-wander, wander)
            warm = tone.uniform(-wander / 3, wander / 3)
            # About one brick in nine is fired a little harder: darker, never black.
            if tone.random() < 0.11:
                light -= wander * 1.1
            c = (clamp(brick[0] + light + warm), clamp(brick[1] + light), clamp(brick[2] + light - warm))
            x0 = col * bw + shift + joint / 2
            y0 = row * bh + joint / 2
            x1 = x0 + bw - joint
            y1 = y0 + bh - joint
            d.rectangle([x0, y0, x1, y1], fill=c)
            # The arris: lit along the top edge, in shade along the bottom.
            d.line([x0, y0, x1, y0], fill=tuple(clamp(v + 12) for v in c), width=1)
            d.line([x0, y1, x1, y1], fill=tuple(clamp(v - 16) for v in c), width=1)
    # Sanded-face grain: fine speckle, wrapped so it does not show the tile.
    px = img.load()
    for _ in range(SIZE * SIZE // 5):
        x, y = rnd.randrange(SIZE), rnd.randrange(SIZE)
        k = rnd.uniform(-9, 9)
        r, g, b = px[x, y]
        px[x, y] = (clamp(r + k), clamp(g + k), clamp(b + k))
    # A slight softening, as a wall has at arm's length. Blur a 3x3 tiling and
    # crop the middle so the softening wraps too.
    big = Image.new('RGB', (SIZE * 3, SIZE * 3))
    for i in range(3):
        for j in range(3):
            big.paste(img, (i * SIZE, j * SIZE))
    img = big.filter(ImageFilter.GaussianBlur(0.6)).crop((SIZE, SIZE, SIZE * 2, SIZE * 2))
    path = os.path.join(OUT, name + '.webp')
    img.save(path, 'WEBP', quality=88, method=6)
    print(name, os.path.getsize(path), 'bytes')


for name, (brick, mortar, wander, seed) in BRICKS.items():
    draw(name, brick, mortar, wander, seed)

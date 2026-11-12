"""Shrink a GLB for the website: re-encode its PNG textures.

  python tools/shrink-glb.py in.glb out.glb [max_px=1024] [jpeg_quality=82]

Opaque PNGs become JPEG (no glTF extension needed); PNGs with real
transparency stay PNG but are downscaled and optimised. Everything else in the
file is copied as is. Needs Pillow.
"""
import io, json, struct, sys
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
max_px = int(sys.argv[3]) if len(sys.argv) > 3 else 1024
quality = int(sys.argv[4]) if len(sys.argv) > 4 else 82

data = open(src, 'rb').read()
json_len = struct.unpack('<I', data[12:16])[0]
gltf = json.loads(data[20:20 + json_len])
bin_start = 20 + json_len + 8
binary = data[bin_start:bin_start + struct.unpack('<I', data[20 + json_len:24 + json_len])[0]]
views = gltf['bufferViews']
replaced = {}
for img in gltf.get('images', []):
    view = views[img['bufferView']]
    raw = binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
    im = Image.open(io.BytesIO(raw))
    im.load()
    if max(im.size) > max_px:
        im.thumbnail((max_px, max_px), Image.LANCZOS)
    has_alpha = im.mode in ('RGBA', 'LA', 'P') and im.convert('RGBA').getchannel('A').getextrema()[0] < 250
    out = io.BytesIO()
    if has_alpha:
        im.convert('RGBA').save(out, 'PNG', optimize=True)
        img['mimeType'] = 'image/png'
    else:
        im.convert('RGB').save(out, 'JPEG', quality=quality, optimize=True, progressive=True)
        img['mimeType'] = 'image/jpeg'
    replaced[img['bufferView']] = out.getvalue()

chunks, offset = [], 0
for i, view in enumerate(views):
    blob = replaced.get(i) or binary[view.get('byteOffset', 0):view.get('byteOffset', 0) + view['byteLength']]
    pad = (-offset) % 4
    chunks.append(b'\0' * pad)
    offset += pad
    view['byteOffset'] = offset
    view['byteLength'] = len(blob)
    view['buffer'] = 0
    chunks.append(blob)
    offset += len(blob)
new_bin = b''.join(chunks)
new_bin += b'\0' * ((-len(new_bin)) % 4)
gltf['buffers'] = [{'byteLength': len(new_bin)}]
js = json.dumps(gltf, separators=(',', ':')).encode()
js += b' ' * ((-len(js)) % 4)
total = 12 + 8 + len(js) + 8 + len(new_bin)
with open(dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, total))
    f.write(struct.pack('<I', len(js)) + b'JSON' + js)
    f.write(struct.pack('<I', len(new_bin)) + b'BIN\0' + new_bin)
print('%s: %.2f MB -> %.2f MB' % (dst, len(data) / 1e6, total / 1e6))

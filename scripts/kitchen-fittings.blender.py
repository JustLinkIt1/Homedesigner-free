# HomeDesigner kitchen fittings, built in Blender and exported as small GLBs.
# Blender axes: X right, -Y is the FRONT (becomes +Z in glTF), Z up. Metres.
import bpy, bmesh, math, os
from mathutils import Vector

OUT = r"C:\Projects\Homedesigner-free\public\models\kitchen"
PI = math.pi


def clear():
    for o in list(bpy.data.objects):
        bpy.data.objects.remove(o, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.curves, bpy.data.materials):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


def mat(name, color, metallic=0.0, rough=0.5):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (color[0], color[1], color[2], 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    return m


# Metal stays below 1 so it still reads on phones that render without reflections.
def steel(): return mat('steel', (0.62, 0.63, 0.65), 0.75, 0.32)
def chrome(): return mat('chrome', (0.78, 0.79, 0.81), 0.85, 0.14)
def glass(): return mat('black_glass', (0.012, 0.012, 0.015), 0.1, 0.07)
def dark(): return mat('dark', (0.025, 0.025, 0.028), 0.2, 0.55)
def mark(): return mat('mark', (0.32, 0.33, 0.35), 0.0, 0.4)
def lamp(): return mat('lamp', (0.9, 0.88, 0.8), 0.0, 0.3)


def box(name, sx, sy, sz, loc, m, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        md = o.modifiers.new('bv', 'BEVEL')
        md.width = bevel
        md.segments = 2
        md.limit_method = 'ANGLE'
    o.data.materials.append(m)
    return o


def cyl(name, r, h, loc, m, rot=(0, 0, 0), verts=24, r2=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=h, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r2, depth=h, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.data.materials.append(m)
    return o


def ring(name, R, r, loc, m, flat=0.3, seg=24):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg, minor_segments=4, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = (1, 1, flat)
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(m)
    return o


def tube(name, pts, radius, m):
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    cu.resolution_u = 8
    cu.use_fill_caps = True
    o = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    return o


def shell(name, quads, m):
    """Mesh from quads given as (4 points, direction the face must look toward)."""
    bm = bmesh.new()
    for pts, want in quads:
        f = bm.faces.new([bm.verts.new(p) for p in pts])
        f.normal_update()
        if f.normal.dot(Vector(want)) < 0:
            f.normal_flip()
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(m)
    return o


def rect(w, d, z, cy=0.0):
    return [(-w / 2, cy - d / 2, z), (w / 2, cy - d / 2, z), (w / 2, cy + d / 2, z), (-w / 2, cy + d / 2, z)]


def band(a, b, want_out=True):
    """Four side quads joining rectangle a to rectangle b; normals point away from (or toward) the axis."""
    out = []
    for i in range(4):
        j = (i + 1) % 4
        mid = (Vector(a[i]) + Vector(a[j])) / 2
        n = Vector((mid.x, mid.y - (a[0][1] + a[2][1]) / 2, 0))
        if n.length == 0:
            n = Vector((0, 0, 1))
        out.append(([a[i], a[j], b[j], b[i]], tuple(n if want_out else -n)))
    return out


def export(name):
    objs = list(bpy.context.scene.objects)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target='MESH')
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    bpy.context.scene.cursor.location = (0, 0, 0)
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    try:
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    except Exception:
        bpy.ops.object.shade_smooth()
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True,
                              export_apply=True, export_animations=False)
    lo = [min(v.co[i] for v in o.data.vertices) for i in range(3)]
    hi = [max(v.co[i] for v in o.data.vertices) for i in range(3)]
    print(f"{name}: {tris} tris, {os.path.getsize(path)} bytes, x {lo[0]:.3f}..{hi[0]:.3f} y {lo[1]:.3f}..{hi[1]:.3f} z {lo[2]:.3f}..{hi[2]:.3f}")


# ---------------------------------------------------------------- fittings

def tap():
    c = chrome()
    cyl('base', 0.027, 0.012, (0, 0, 0.006), c)
    cyl('body', 0.019, 0.10, (0, 0, 0.062), c)
    tube('spout', [(0, 0, 0.10), (0, 0, 0.255), (0, -0.055, 0.32), (0, -0.135, 0.32), (0, -0.185, 0.265)], 0.011, c)
    cyl('nozzle', 0.0135, 0.026, (0, -0.186, 0.255), c)
    cyl('lever', 0.006, 0.075, (0.05, 0, 0.088), c, rot=(0, PI / 2, 0), verts=12)
    cyl('lever_hub', 0.012, 0.02, (0.022, 0, 0.088), c, rot=(0, PI / 2, 0), verts=16)


def sink_bowl():
    s = steel()
    top = 0.004
    outer_t, inner_t = rect(0.50, 0.40, top), rect(0.44, 0.34, top)
    outer_b = rect(0.50, 0.40, 0.0)
    floor = rect(0.40, 0.30, -0.18)
    quads = []
    for i in range(4):
        j = (i + 1) % 4
        quads.append(([outer_t[i], outer_t[j], inner_t[j], inner_t[i]], (0, 0, 1)))
    quads += band(outer_t, outer_b, True)
    quads += band(inner_t, floor, False)
    quads.append((floor, (0, 0, 1)))
    shell('bowl', quads, s)
    cyl('drain', 0.024, 0.003, (0, 0, -0.1785), dark())
    cyl('drain_ring', 0.03, 0.002, (0, 0, -0.179), chrome())


def hob_induction():
    box('plate', 0.58, 0.51, 0.006, (0, 0, 0.003), glass(), bevel=0.0015)
    for x, y, r in ((-0.145, 0.105, 0.105), (0.145, 0.105, 0.08), (-0.145, -0.085, 0.08), (0.145, -0.085, 0.095)):
        ring('zone', r, 0.0013, (x, y, 0.0062), mark())
        ring('zone_in', r * 0.55, 0.0009, (x, y, 0.0062), mark())
    for i in range(5):
        box('touch', 0.014, 0.014, 0.0006, (-0.07 + i * 0.035, -0.222, 0.0062), mark())


def hob_gas():
    box('plate', 0.58, 0.51, 0.008, (0, 0, 0.004), steel(), bevel=0.002)
    d = dark()
    for sx in (-1, 1):
        cx = sx * 0.15
        for cy in (0.115, -0.065):
            cyl('burner', 0.05, 0.006, (cx, cy, 0.011), d)
            cyl('cap', 0.032, 0.012, (cx, cy, 0.02), d)
            box('bar_x', 0.19, 0.01, 0.01, (cx, cy, 0.037), d)
            box('bar_y', 0.01, 0.17, 0.01, (cx, cy, 0.037), d)
        # one cast grate per side: outer frame plus legs
        for fx in (-0.1, 0.1):
            box('frame_y', 0.012, 0.38, 0.012, (cx + fx, 0.025, 0.036), d)
            for fy in (0.21, -0.16):
                box('leg', 0.012, 0.012, 0.03, (cx + fx, fy, 0.022), d)
        for fy in (0.21, -0.16):
            box('frame_x', 0.212, 0.012, 0.012, (cx, fy, 0.036), d)
    for i in range(4):
        cyl('knob', 0.016, 0.02, (-0.09 + i * 0.06, -0.222, 0.018), d, verts=16)


def oven_front():
    W, H = 0.595, 0.595
    strip = 0.095
    door_h = H - strip - 0.005
    box('back', W, 0.004, H, (0, -0.002, H / 2), dark())
    box('strip', W, 0.02, strip, (0, -0.012, H - strip / 2), steel(), bevel=0.0015)
    box('door', W, 0.022, door_h, (0, -0.013, door_h / 2), glass(), bevel=0.002)
    box('window', W * 0.74, 0.002, door_h * 0.56, (0, -0.0245, door_h * 0.47), mat('oven_window', (0.03, 0.03, 0.035), 0.2, 0.04))
    hz = door_h - 0.05
    cyl('handle', 0.009, 0.48, (0, -0.06, hz), steel(), rot=(0, PI / 2, 0), verts=16)
    for x in (-0.2, 0.2):
        cyl('post', 0.006, 0.04, (x, -0.042, hz), steel(), rot=(PI / 2, 0, 0), verts=12)
        cyl('knob', 0.017, 0.018, (x * 1.1, -0.03, H - strip / 2), dark(), rot=(PI / 2, 0, 0), verts=20)
    box('display', 0.13, 0.002, 0.036, (0, -0.0225, H - strip / 2), glass())


def microwave_front():
    W, H = 0.595, 0.38
    box('fascia', W, 0.012, H, (0, -0.006, H / 2), steel(), bevel=0.0015)
    door_w = 0.43
    dx = -W / 2 + 0.012 + door_w / 2
    box('door', door_w, 0.01, H - 0.024, (dx, -0.017, H / 2), glass(), bevel=0.0015)
    box('window', door_w * 0.8, 0.002, (H - 0.024) * 0.7, (dx, -0.0225, H / 2), mat('oven_window', (0.03, 0.03, 0.035), 0.2, 0.04))
    px = W / 2 - 0.075
    box('display', 0.105, 0.002, 0.034, (px, -0.013, H - 0.06), glass())
    for r in range(2):
        for c in range(3):
            box('button', 0.026, 0.004, 0.018, (px - 0.036 + c * 0.036, -0.014, H - 0.125 - r * 0.03), dark())
    cyl('dial', 0.024, 0.016, (px, -0.02, 0.075), dark(), rot=(PI / 2, 0, 0), verts=24)
    hx = dx + door_w / 2 - 0.03
    cyl('handle', 0.007, 0.26, (hx, -0.047, H / 2), steel(), verts=12)
    for z in (H / 2 - 0.1, H / 2 + 0.1):
        cyl('post', 0.005, 0.026, (hx, -0.034, z), steel(), rot=(PI / 2, 0, 0), verts=10)


def hood():
    s = steel()
    box('lip', 0.60, 0.50, 0.03, (0, 0, 0.015), s, bevel=0.002)
    base = rect(0.60, 0.50, 0.03)
    top = rect(0.32, 0.28, 0.115, cy=0.25 - 0.14)
    quads = band(base, top, True)
    quads.append((top, (0, 0, 1)))
    # the back face is vertical, so point it at the wall explicitly
    quads[2] = (quads[2][0], (0, 1, 0))
    shell('canopy', quads, s)
    box('chimney', 0.28, 0.24, 0.64, (0, 0.25 - 0.12, 0.115 + 0.32), s, bevel=0.002)
    box('filter', 0.5, 0.36, 0.004, (0, 0.02, -0.002), dark())
    for x in (-0.2, 0.2):
        cyl('light', 0.02, 0.003, (x, -0.205, -0.0015), lamp(), verts=16)


BUILDERS = {
    'tap': tap, 'sink_bowl': sink_bowl, 'hob_induction': hob_induction, 'hob_gas': hob_gas,
    'oven_front': oven_front, 'microwave_front': microwave_front, 'hood': hood,
}


def build_all():
    for name, fn in BUILDERS.items():
        clear()
        fn()
        export(name)
    clear()


def preview():
    """Import every exported GLB side by side to check what the app will load."""
    clear()
    x = 0.0
    for name in BUILDERS:
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(OUT, name + '.glb'))
        for o in set(bpy.data.objects) - before:
            if o.parent is None:
                o.location.x += x
        x += 0.8

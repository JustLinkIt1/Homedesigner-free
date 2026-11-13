"""Model HomeDesigner's front doors and export them as GLB.

    blender -b -P tools/blender/front_doors.py -- <out_dir> [--preview]

Writes front_panel.glb, front_glazed.glb and front_modern.glb. Each is a
closed door in its frame for a 0.90 m x 2.10 m opening: origin at the bottom
centre of the opening, X = width, Z = up, and -Y is the outside face (so after
glTF's axis change the outside faces +Z). DesignScene scales the model to the
opening's real width and height.
"""
import math
import os
import sys

import bpy

W, H = 0.90, 2.10          # opening
FRAME = 0.055              # frame section seen from the front
FRAME_D = 0.11             # frame depth
LEAF_T = 0.045
GAP = 0.004

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
OUT = argv[0] if argv else os.path.join(os.path.dirname(__file__), 'out')
PREVIEW = '--preview' in argv
os.makedirs(OUT, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(name, color, rough=0.55, metal=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Alpha'].default_value = alpha
    if alpha < 1.0:
        for attr, value in (('blend_method', 'BLEND'), ('surface_render_method', 'BLENDED')):
            try:
                setattr(m, attr, value)
            except Exception:
                pass
    return m


def box(name, size, loc, mat, bevel=0.003):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        mod = o.modifiers.new('bevel', 'BEVEL')
        mod.width = min(bevel, min(size) * 0.45)
        mod.segments = 2
        bpy.ops.object.modifier_apply(modifier=mod.name)
        bpy.ops.object.shade_smooth()
        try:
            bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
        except Exception:
            pass
    o.data.materials.append(mat)
    return o


def cylinder(name, radius, depth, loc, rot, mat, verts=20):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=depth, vertices=verts, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    bpy.ops.object.shade_smooth()
    o.data.materials.append(mat)
    return o


def frame(mat, sill_mat):
    box('frame_l', (FRAME, FRAME_D, H), (-W / 2 + FRAME / 2, 0, H / 2), mat)
    box('frame_r', (FRAME, FRAME_D, H), (W / 2 - FRAME / 2, 0, H / 2), mat)
    box('frame_top', (W, FRAME_D, FRAME), (0, 0, H - FRAME / 2), mat)
    # threshold with a weather bar, slightly proud on the outside
    box('threshold', (W, FRAME_D + 0.05, 0.03), (0, -0.025, 0.015), sill_mat)


LEAF_W = W - 2 * FRAME - 2 * GAP
LEAF_H = H - FRAME - 0.03 - 2 * GAP
LEAF_Z = 0.03 + GAP + LEAF_H / 2
LEAF_X0 = -LEAF_W / 2


def leaf(mat):
    return box('leaf', (LEAF_W, LEAF_T, LEAF_H), (0, 0, LEAF_Z), mat, bevel=0.004)


def panel(name, x, z, w, h, mat, glass=None, bars=(0, 0), bar_mat=None):
    """A framed panel on both faces: a moulding ring and a raised field, or glass."""
    for side in (-1, 1):
        y = side * (LEAF_T / 2)
        m = 0.022  # moulding width
        for (sx, sz, px, pz) in ((w, m, 0, h / 2 - m / 2), (w, m, 0, -h / 2 + m / 2),
                                 (m, h - 2 * m, -w / 2 + m / 2, 0), (m, h - 2 * m, w / 2 - m / 2, 0)):
            box(f'{name}_mould', (sx, 0.014, sz), (x + px, y + side * 0.004, z + pz), mat, bevel=0.004)
        if glass is None:
            box(f'{name}_field', (w - 2 * m - 0.03, 0.012, h - 2 * m - 0.03), (x, y + side * 0.002, z), mat, bevel=0.005)
    if glass is not None:
        box(f'{name}_glass', (w - 0.03, 0.012, h - 0.03), (x, 0, z), glass, bevel=0)
        nx, nz = bars
        for i in range(1, nx):
            box(f'{name}_bar_v', (0.018, LEAF_T + 0.012, h - 0.03), (x - w / 2 + w * i / nx, 0, z), bar_mat or mat, bevel=0.003)
        for i in range(1, nz):
            box(f'{name}_bar_h', (w - 0.03, LEAF_T + 0.012, 0.018), (x, 0, z - h / 2 + h * i / nz), bar_mat or mat, bevel=0.003)


def lever(metal, x, z=1.02):
    """Lever handle on a backplate, both faces."""
    for side in (-1, 1):
        y = side * (LEAF_T / 2)
        box('plate', (0.04, 0.008, 0.20), (x, y + side * 0.004, z), metal, bevel=0.003)
        cylinder('rose', 0.011, 0.045, (x, y + side * 0.026, z + 0.03), (math.pi / 2, 0, 0), metal)
        box('lever', (0.12, 0.016, 0.018), (x - 0.05 if x > 0 else x + 0.05, y + side * 0.048, z + 0.03), metal, bevel=0.006)


def knob(metal, x, z=1.02):
    for side in (-1, 1):
        y = side * (LEAF_T / 2)
        cylinder('knob_rose', 0.03, 0.008, (x, y + side * 0.004, z), (math.pi / 2, 0, 0), metal)
        cylinder('knob_stem', 0.009, 0.04, (x, y + side * 0.024, z), (math.pi / 2, 0, 0), metal)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.03, segments=20, ring_count=12, location=(x, y + side * 0.052, z))
        s = bpy.context.active_object
        s.scale = (1, 0.75, 1)
        bpy.ops.object.shade_smooth()
        s.data.materials.append(metal)


def letterbox(metal, z=0.98):
    y = -LEAF_T / 2
    box('letter_plate', (0.26, 0.008, 0.07), (0, y - 0.004, z), metal, bevel=0.004)
    box('letter_flap', (0.21, 0.006, 0.035), (0, y - 0.010, z), metal, bevel=0.003)


def knocker(metal, z=1.50):
    y = -LEAF_T / 2
    cylinder('knocker_boss', 0.022, 0.012, (0, y - 0.006, z + 0.05), (math.pi / 2, 0, 0), metal)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.045, minor_radius=0.007, major_segments=24, minor_segments=8,
                                     location=(0, y - 0.016, z), rotation=(math.pi / 2, 0, 0))
    t = bpy.context.active_object
    bpy.ops.object.shade_smooth()
    t.data.materials.append(metal)


def hinges(metal):
    for z in (0.25, 1.05, 1.85):
        cylinder('hinge', 0.007, 0.09, (LEAF_X0 - 0.002, LEAF_T / 2 + 0.004, z), (0, 0, 0), metal, verts=12)


def panel_door():
    """Traditional six-panel door, top pair glazed. White paint, chrome."""
    paint = material('Paint white', (0.92, 0.92, 0.90), rough=0.42)
    sill = material('Threshold', (0.62, 0.64, 0.66), rough=0.35, metal=0.6)
    chrome = material('Chrome', (0.78, 0.79, 0.80), rough=0.22, metal=1.0)
    glass = material('Frosted glass', (0.82, 0.90, 0.94), rough=0.25, alpha=0.55)
    frame(paint, sill)
    leaf(paint)
    pw = (LEAF_W - 3 * 0.085) / 2
    xs = (-pw / 2 - 0.0425, pw / 2 + 0.0425)
    z0 = LEAF_Z - LEAF_H / 2
    for x in xs:
        panel('low', x, z0 + 0.12 + 0.30, pw, 0.60, paint)
        panel('mid', x, z0 + 0.12 + 0.60 + 0.24 + 0.33, pw, 0.66, paint)
        panel('top', x, z0 + LEAF_H - 0.11 - 0.18, pw, 0.36, paint, glass=glass)
    lever(chrome, LEAF_W / 2 - 0.045)
    letterbox(chrome, z=z0 + 0.12 + 0.60 + 0.12)
    hinges(chrome)


def glazed_door():
    """Cottage door: two timber panels below, nine-light glazing above. Oak, brass."""
    oak = material('Oak', (0.50, 0.31, 0.16), rough=0.5)
    frame_paint = material('Frame cream', (0.90, 0.88, 0.82), rough=0.45)
    sill = material('Threshold', (0.45, 0.30, 0.18), rough=0.5)
    brass = material('Brass', (0.80, 0.62, 0.28), rough=0.28, metal=1.0)
    glass = material('Clear glass', (0.78, 0.90, 0.95), rough=0.08, alpha=0.32)
    frame(frame_paint, sill)
    leaf(oak)
    z0 = LEAF_Z - LEAF_H / 2
    pw = (LEAF_W - 3 * 0.085) / 2
    for x in (-pw / 2 - 0.0425, pw / 2 + 0.0425):
        panel('low', x, z0 + 0.13 + 0.33, pw, 0.66, oak)
    gw, gh = LEAF_W - 2 * 0.085, 0.92
    panel('lights', 0, z0 + LEAF_H - 0.11 - gh / 2, gw, gh, oak, glass=glass, bars=(3, 3), bar_mat=oak)
    knob(brass, LEAF_W / 2 - 0.05, z=z0 + 0.98)
    letterbox(brass, z=z0 + 0.90)
    hinges(brass)


def modern_door():
    """Flush anthracite door with a tall glazed slot and a long bar pull."""
    anth = material('Anthracite', (0.11, 0.12, 0.13), rough=0.45)
    sill = material('Threshold', (0.55, 0.56, 0.58), rough=0.3, metal=0.7)
    steel = material('Brushed steel', (0.72, 0.73, 0.74), rough=0.3, metal=1.0)
    glass = material('Satin glass', (0.80, 0.88, 0.92), rough=0.2, alpha=0.5)
    frame(anth, sill)
    leaf(anth)
    # horizontal grooves
    for i in range(1, 5):
        z = (LEAF_Z - LEAF_H / 2) + LEAF_H * i / 5
        for side in (-1, 1):
            box('groove', (LEAF_W - 0.01, 0.004, 0.006), (0, side * (LEAF_T / 2 + 0.001), z), steel, bevel=0)
    # glazed slot on the hinge side
    sx = LEAF_X0 + 0.16
    box('slot_glass', (0.11, LEAF_T + 0.004, 1.50), (sx, 0, LEAF_Z + 0.05), glass, bevel=0)
    for side in (-1, 1):
        y = side * (LEAF_T / 2 + 0.004)
        for (w_, h_, px, pz) in ((0.15, 0.02, 0, 0.76), (0.15, 0.02, 0, -0.76), (0.02, 1.54, -0.065, 0), (0.02, 1.54, 0.065, 0)):
            box('slot_trim', (w_, 0.008, h_), (sx + px, y, LEAF_Z + 0.05 + pz), steel, bevel=0.002)
    # long bar pull outside, short lever inside
    hx = LEAF_W / 2 - 0.07
    cylinder('pull', 0.014, 1.10, (hx, -LEAF_T / 2 - 0.055, LEAF_Z), (0, 0, 0), steel)
    for dz in (-0.42, 0.42):
        cylinder('pull_post', 0.008, 0.055, (hx, -LEAF_T / 2 - 0.027, LEAF_Z + dz), (math.pi / 2, 0, 0), steel, verts=12)
    box('in_plate', (0.04, 0.008, 0.18), (hx, LEAF_T / 2 + 0.004, 1.02), steel, bevel=0.003)
    box('in_lever', (0.12, 0.016, 0.018), (hx - 0.05, LEAF_T / 2 + 0.045, 1.05), steel, bevel=0.006)
    hinges(steel)


def export(name):
    bpy.ops.object.select_all(action='SELECT')
    bpy.context.view_layer.objects.active = bpy.context.selected_objects[0]
    bpy.ops.object.join()
    obj = bpy.context.active_object
    obj.name = name
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    path = os.path.join(OUT, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_materials='EXPORT')
    print('EXPORTED', name, tris, 'tris', os.path.getsize(path), 'bytes')
    if PREVIEW:
        preview(name)


def preview(name):
    scene = bpy.context.scene
    engines = [i.identifier for i in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items]
    for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'BLENDER_WORKBENCH'):
        if engine in engines:
            try:
                scene.render.engine = engine
                break
            except TypeError:
                continue
    bpy.ops.object.light_add(type='SUN', location=(2, -4, 5), rotation=(math.radians(50), 0, math.radians(25)))
    bpy.context.active_object.data.energy = 4
    bpy.ops.object.light_add(type='AREA', location=(-2, -3, 2))
    bpy.context.active_object.data.energy = 300
    bpy.ops.object.camera_add(location=(1.3, -3.4, 1.35), rotation=(math.radians(86), 0, math.radians(20)))
    scene.camera = bpy.context.active_object
    scene.camera.data.lens = 50
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.78, 0.82, 1)
    scene.world = world
    scene.render.resolution_x, scene.render.resolution_y = 520, 900
    scene.render.filepath = os.path.join(OUT, name + '.png')
    try:
        bpy.ops.render.render(write_still=True)
        print('PREVIEW', name)
    except Exception as e:  # no GPU in this session: the GLB is still fine
        print('PREVIEW FAILED', name, e)


for name, build in (('front_panel', panel_door), ('front_glazed', glazed_door), ('front_modern', modern_door)):
    reset()
    build()
    export(name)

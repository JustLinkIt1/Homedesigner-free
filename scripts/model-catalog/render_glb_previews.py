"""Render simple turntable-style PNG previews for a directory of GLB files.

Run with Blender:

  blender --background --python render_glb_previews.py -- \
    --models-dir <models> --output-dir <previews>
"""

from __future__ import annotations

import argparse
from pathlib import Path
import sys

import bpy
from mathutils import Vector


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--models-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else None
    return parser.parse_args(argv)


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return (
        Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points))),
        Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points))),
    )


def point_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def render_one(source: Path, destination: Path) -> None:
    clear_scene()
    bpy.ops.import_scene.gltf(filepath=str(source.resolve()))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No meshes imported from {source.name}")

    minimum, maximum = world_bounds(meshes)
    centre = (minimum + maximum) * 0.5
    size = maximum - minimum
    radius = max(size.x, size.y, size.z, 0.1)

    camera_data = bpy.data.cameras.new("PreviewCamera")
    camera = bpy.data.objects.new("PreviewCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = centre + Vector((radius * 1.45, -radius * 1.75, radius * 1.15))
    camera.data.lens = 52
    point_at(camera, centre)
    bpy.context.scene.camera = camera

    for name, location, energy, size_value in (
        ("Key", centre + Vector((radius * 2, -radius * 2, radius * 3)), 1100, radius * 1.5),
        ("Fill", centre + Vector((-radius * 2, -radius, radius * 1.5)), 650, radius),
    ):
        light_data = bpy.data.lights.new(name, "AREA")
        light_data.energy = energy
        light_data.shape = "DISK"
        light_data.size = size_value
        light = bpy.data.objects.new(name, light_data)
        bpy.context.collection.objects.link(light)
        light.location = location
        point_at(light, centre)

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 512
    scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = True
    scene.render.filepath = str(destination.resolve())
    scene.view_settings.look = "AgX - Medium High Contrast"
    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)


def main() -> None:
    args = parse_args()
    failures: list[str] = []
    for source in sorted(args.models_dir.glob("*.glb")):
        destination = args.output_dir / f"{source.stem}.png"
        try:
            render_one(source, destination)
            print(f"OK   {source.name} -> {destination.name}")
        except Exception as error:
            failures.append(f"{source.name}: {error}")
            print(f"FAIL {failures[-1]}")
    if failures:
        raise SystemExit("\n".join(failures))


if __name__ == "__main__":
    main()

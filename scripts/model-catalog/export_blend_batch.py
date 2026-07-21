"""Export the Blender files named by a catalog batch spec to individual GLBs.

Run this with a Python environment that contains Blender's `bpy` package:

  python export_blend_batch.py --spec quaternius-ultimate-home-batch.json \
    --source-dir <download>/Blends --output-dir <work>/raw

The app normalizes each model to its catalog footprint at runtime, so this
step intentionally preserves the artist's proportions and material setup.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

import bpy


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec", required=True, type=Path)
    parser.add_argument("--source-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    # Blender keeps its own command-line options in sys.argv. Arguments after
    # `--` belong to this exporter; ordinary Python invocation still works.
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else None
    return parser.parse_args(argv)


def export_one(source: Path, destination: Path) -> None:
    bpy.ops.wm.open_mainfile(filepath=str(source.resolve()))
    bpy.ops.object.select_all(action="DESELECT")
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise RuntimeError(f"No renderable meshes in {source.name}")
    for mesh in meshes:
        # Some source files save their only product mesh hidden. Because each
        # pack file represents one catalog object, every mesh belongs in the
        # standalone export.
        mesh.hide_render = False
        mesh.hide_viewport = False
        mesh.hide_set(False)
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    destination.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(destination.resolve()),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_cameras=False,
        export_lights=False,
    )


def main() -> None:
    args = parse_args()
    spec = json.loads(args.spec.read_text(encoding="utf-8"))
    failures: list[str] = []
    for entry in spec["entries"]:
        source = args.source_dir / entry["sourceFile"]
        destination = args.output_dir / f'{entry["objectKey"]}.glb'
        if not source.exists():
            print(f"SKIP missing {source.name}")
            continue
        try:
            export_one(source, destination)
            print(f"OK   {source.name} -> {destination.name}")
        except Exception as error:  # Blender reports useful per-file context.
            failures.append(f"{source.name}: {error}")
            print(f"FAIL {failures[-1]}")
    if failures:
        raise SystemExit("\n".join(failures))


if __name__ == "__main__":
    main()

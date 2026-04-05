#!/usr/bin/env python3

from __future__ import annotations

import argparse
import struct
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


TRANSPARENT_INDEX = 255


@dataclass
class TileRecord:
    tile_index: int
    width: int
    height: int
    picanm: int
    pixels: bytes


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export Build-engine ART tiles to PNGs using PALETTE.DAT.",
    )
    parser.add_argument(
        "--palette",
        type=Path,
        default=Path("imports/duke3d/raw/PALETTE.DAT"),
        help="Path to PALETTE.DAT",
    )
    parser.add_argument(
        "--art-dir",
        type=Path,
        default=Path("imports/duke3d/raw"),
        help="Directory containing TILES*.ART",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("exports/duke3d/png"),
        help="Directory to write PNG tiles into",
    )
    parser.add_argument(
        "--tile-start",
        type=int,
        default=None,
        help="Optional first global tile index to export",
    )
    parser.add_argument(
        "--tile-end",
        type=int,
        default=None,
        help="Optional last global tile index to export",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional max number of non-empty tiles to export",
    )
    parser.add_argument(
        "--contact-sheet",
        type=Path,
        default=None,
        help="Optional path to save a contact sheet of the exported tiles",
    )
    return parser.parse_args()


def load_palette(palette_path: Path) -> list[tuple[int, int, int, int]]:
    raw = palette_path.read_bytes()
    if len(raw) < 768:
        raise ValueError(f"{palette_path} is too small to contain a Build palette")

    rgb_bytes = raw[:768]
    palette: list[tuple[int, int, int, int]] = []
    for index in range(256):
        r = min(255, rgb_bytes[index * 3] * 4)
        g = min(255, rgb_bytes[index * 3 + 1] * 4)
        b = min(255, rgb_bytes[index * 3 + 2] * 4)
        a = 0 if index == TRANSPARENT_INDEX else 255
        palette.append((r, g, b, a))
    return palette


def iter_art_tiles(art_path: Path) -> list[TileRecord]:
    data = art_path.read_bytes()
    if len(data) < 16:
        raise ValueError(f"{art_path} is too small to be a valid ART file")

    version, _numtiles, local_start, local_end = struct.unpack_from("<4l", data, 0)
    if version != 1:
        raise ValueError(f"{art_path} uses unsupported ART version {version}")

    tile_count = local_end - local_start + 1
    widths_offset = 16
    heights_offset = widths_offset + tile_count * 2
    picanm_offset = heights_offset + tile_count * 2
    pixels_offset = picanm_offset + tile_count * 4

    widths = struct.unpack_from(f"<{tile_count}h", data, widths_offset)
    heights = struct.unpack_from(f"<{tile_count}h", data, heights_offset)
    picanms = struct.unpack_from(f"<{tile_count}l", data, picanm_offset)

    cursor = pixels_offset
    records: list[TileRecord] = []

    for i in range(tile_count):
        width = max(0, widths[i])
        height = max(0, heights[i])
        pixel_count = width * height
        pixels = data[cursor : cursor + pixel_count]
        if len(pixels) != pixel_count:
            raise ValueError(f"{art_path} is truncated while reading tile {local_start + i}")
        cursor += pixel_count

        records.append(
            TileRecord(
                tile_index=local_start + i,
                width=width,
                height=height,
                picanm=picanms[i],
                pixels=pixels,
            ),
        )

    return records


def tile_to_image(tile: TileRecord, palette: list[tuple[int, int, int, int]]) -> Image.Image | None:
    if tile.width <= 0 or tile.height <= 0:
        return None

    image = Image.new("RGBA", (tile.width, tile.height))
    image_pixels = image.load()

    for x in range(tile.width):
        for y in range(tile.height):
            color_index = tile.pixels[x * tile.height + y]
            image_pixels[x, y] = palette[color_index]

    return image


def should_export(tile: TileRecord, start: int | None, end: int | None) -> bool:
    if tile.width <= 0 or tile.height <= 0:
        return False
    if start is not None and tile.tile_index < start:
        return False
    if end is not None and tile.tile_index > end:
        return False
    return True


def save_contact_sheet(images: list[tuple[int, Image.Image]], output_path: Path) -> None:
    if not images:
        return

    thumb_size = 96
    label_height = 18
    columns = 6
    rows = (len(images) + columns - 1) // columns
    sheet = Image.new("RGBA", (columns * thumb_size, rows * (thumb_size + label_height)), (10, 12, 16, 255))

    for idx, (tile_index, image) in enumerate(images):
        col = idx % columns
        row = idx // columns
        x = col * thumb_size
        y = row * (thumb_size + label_height)

        thumb = image.copy()
        thumb.thumbnail((thumb_size - 8, thumb_size - 8), Image.Resampling.NEAREST)
        draw_x = x + (thumb_size - thumb.width) // 2
        draw_y = y + (thumb_size - thumb.height) // 2
        sheet.alpha_composite(thumb, (draw_x, draw_y))

        label = Image.new("RGBA", (thumb_size, label_height), (24, 28, 34, 255))
        sheet.alpha_composite(label, (x, y + thumb_size))

        # Tiny bitmap-less label using PIL's default draw path via text.
        from PIL import ImageDraw

        draw = ImageDraw.Draw(sheet)
        draw.text((x + 4, y + thumb_size + 2), str(tile_index), fill=(241, 222, 189, 255))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path)


def main() -> None:
    args = parse_args()
    palette = load_palette(args.palette.expanduser().resolve())
    art_dir = args.art_dir.expanduser().resolve()
    output_dir = args.output.expanduser().resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    art_files = sorted(art_dir.glob("TILES*.ART"))
    if not art_files:
        raise SystemExit(f"no ART files found in {art_dir}")

    exported = 0
    contact_images: list[tuple[int, Image.Image]] = []
    skipped_art_files: list[str] = []

    for art_file in art_files:
        try:
            tiles = iter_art_tiles(art_file)
        except ValueError as exc:
            skipped_art_files.append(f"{art_file.name}: {exc}")
            continue

        for tile in tiles:
            if not should_export(tile, args.tile_start, args.tile_end):
                continue

            image = tile_to_image(tile, palette)
            if image is None:
                continue

            tile_path = output_dir / f"{tile.tile_index:05d}.png"
            image.save(tile_path)
            exported += 1

            if args.contact_sheet and len(contact_images) < 60:
                contact_images.append((tile.tile_index, image))

            if args.limit is not None and exported >= args.limit:
                if args.contact_sheet:
                    save_contact_sheet(contact_images, args.contact_sheet.expanduser().resolve())
                for skipped in skipped_art_files:
                    print(f"skipped {skipped}")
                print(f"exported {exported} tiles into {output_dir}")
                return

    if args.contact_sheet:
        save_contact_sheet(contact_images, args.contact_sheet.expanduser().resolve())

    for skipped in skipped_art_files:
        print(f"skipped {skipped}")
    print(f"exported {exported} tiles into {output_dir}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3

from __future__ import annotations

import argparse
import struct
from pathlib import Path


MAGIC = b"KenSilverman"
ENTRY_NAME_SIZE = 12
ENTRY_SIZE = 16


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract raw files from a Duke/Build-engine GRP archive.",
    )
    parser.add_argument(
        "grp_path",
        type=Path,
        help="Path to DUKE3D.GRP or another Build engine .grp archive",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("imports/duke3d/raw"),
        help="Directory to extract raw files into",
    )
    return parser.parse_args()


def decode_name(raw_name: bytes) -> str:
    return raw_name.split(b"\x00", 1)[0].decode("ascii", errors="replace")


def extract_grp(grp_path: Path, output_dir: Path) -> None:
    data = grp_path.read_bytes()
    if len(data) < len(MAGIC) + 4:
      raise ValueError(f"{grp_path} is too small to be a valid GRP archive")

    if data[: len(MAGIC)] != MAGIC:
        raise ValueError(f"{grp_path} does not start with the expected Build GRP header")

    file_count = struct.unpack_from("<I", data, len(MAGIC))[0]
    table_offset = len(MAGIC) + 4
    payload_offset = table_offset + file_count * ENTRY_SIZE

    if len(data) < payload_offset:
        raise ValueError(f"{grp_path} has a truncated file table")

    output_dir.mkdir(parents=True, exist_ok=True)

    cursor = payload_offset
    for index in range(file_count):
        entry_offset = table_offset + index * ENTRY_SIZE
        raw_name = data[entry_offset : entry_offset + ENTRY_NAME_SIZE]
        file_size = struct.unpack_from("<I", data, entry_offset + ENTRY_NAME_SIZE)[0]
        file_name = decode_name(raw_name)

        file_bytes = data[cursor : cursor + file_size]
        if len(file_bytes) != file_size:
            raise ValueError(f"{grp_path} is truncated while reading {file_name}")

        destination = output_dir / file_name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(file_bytes)
        cursor += file_size

    if cursor != len(data):
        extra_bytes = len(data) - cursor
        print(f"warning: {grp_path.name} has {extra_bytes} trailing bytes after extraction")


def main() -> None:
    args = parse_args()
    grp_path = args.grp_path.expanduser().resolve()
    output_dir = args.output.expanduser().resolve()

    if not grp_path.is_file():
        raise SystemExit(f"missing GRP file: {grp_path}")

    extract_grp(grp_path, output_dir)
    print(f"extracted raw files from {grp_path} into {output_dir}")


if __name__ == "__main__":
    main()

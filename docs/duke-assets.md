# Duke Asset Import Notes

This project does not ship Duke Nukem 3D assets.

If you have permission and a local `DUKE3D.GRP`, the first step is to unpack the raw game files:

```bash
python3 scripts/extract_duke_grp.py /absolute/path/to/DUKE3D.GRP
```

That writes the raw archive contents into:

```text
imports/duke3d/raw/
```

Expected raw files of interest:

- `PALETTE.DAT`
- `LOOKUP.DAT`
- `TILES000.ART`
- `TILES001.ART`
- `TILES002.ART`
- `TILES003.ART`
- `TILES004.ART`
- `TILES005.ART`
- `DEFS.CON`
- `GAME.CON`

What we want first for this prototype:

- first-person weapon frames
- muzzle flash frames
- impact / smoke puffs
- shell casing frames
- one enemy sprite set for target testing

Planned pipeline:

1. Unpack `DUKE3D.GRP` into `imports/duke3d/raw/`.
2. Convert Build `.ART` + `PALETTE.DAT` into indexed PNG exports.
3. Curate the specific weapon / VFX sprites we want into project-ready folders.
4. Hook selected sequences into the runtime as configurable animation sets.

Current status:

- raw GRP extraction script exists
- ART-to-PNG conversion script exists

PNG export example:

```bash
python3 scripts/export_build_art.py \
  --palette imports/duke3d/raw/PALETTE.DAT \
  --art-dir imports/duke3d/raw \
  --output exports/duke3d/png \
  --tile-start 0 \
  --tile-end 400 \
  --contact-sheet exports/duke3d/contact-0000-0400.png
```

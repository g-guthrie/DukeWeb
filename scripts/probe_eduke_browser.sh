#!/usr/bin/env zsh
set -euo pipefail

ROOT="/Users/gguthrie/Desktop/pixelart"
source "$ROOT/.emsdk/emsdk_env.sh" >/dev/null 2>&1

echo "emcc: $(command -v emcc)"
echo "em++: $(command -v em++)"
echo "emcmake: $(command -v emcmake)"
echo
echo "Dry-run of EDuke32 browser makefile graph:"
make_args=(
  -C "$ROOT/vendor/eduke32"
  -n
  PLATFORM=EMSCRIPTEN
  duke3d_game=eduke32-web
  eduke32-web.html
  RELEASE=1
  LTO=0
  NOASM=1
  NETCODE=0
  USE_OPENGL=0
  STARTUP_WINDOW=0
  HAVE_GTK2=0
  HAVE_VORBIS=0
  HAVE_FLAC=0
  HAVE_XMP=0
  USE_LIBVPX=0
  "LDFLAGS=-sASYNCIFY_STACK_SIZE=1048576 --preload-file $ROOT/imports/duke3d/duke3d.grp@/duke3d.grp --preload-file $ROOT/vendor/eduke32/eduke32.dat@/eduke32.dat"
)

make "${make_args[@]}" 2>&1 | head -n 120

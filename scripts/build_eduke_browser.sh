#!/usr/bin/env zsh
set -euo pipefail

ROOT="/Users/gguthrie/Desktop/pixelart"
source "$ROOT/.emsdk/emsdk_env.sh" >/dev/null 2>&1

mkdir -p "$ROOT/build/browser"

make_args=(
  -C "$ROOT/vendor/eduke32"
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
  "LDFLAGS=--preload-file $ROOT/imports/duke3d/duke3d.grp@/duke3d.grp --preload-file $ROOT/vendor/eduke32/eduke32.dat@/eduke32.dat"
)

make "${make_args[@]}"

cat > "$ROOT/vendor/eduke32/eduke32-web.html" <<'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=./launch.html" />
    <title>Redirecting...</title>
  </head>
  <body>
    <p>Redirecting to <a href="./launch.html">launch.html</a>...</p>
  </body>
</html>
EOF

cat > "$ROOT/vendor/eduke32/eduke32.html" <<'EOF'
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0; url=./launch.html" />
    <title>Redirecting...</title>
  </head>
  <body>
    <p>Redirecting to <a href="./launch.html">launch.html</a>...</p>
  </body>
</html>
EOF

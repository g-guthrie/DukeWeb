# Duke Browser Port

Goal: run the actual Duke/EDuke runtime in the browser, using the real Duke data path, and stop approximating the game with custom JavaScript rendering.

## Source of truth

Engine source staged into:

- `/Users/gguthrie/Desktop/pixelart/vendor/eduke32`

Game data staged into:

- `/Users/gguthrie/Desktop/pixelart/imports/duke3d/duke3d.grp`
- `/Users/gguthrie/Desktop/pixelart/imports/duke3d/raw`

Useful custom/mod data also staged into:

- `/Users/gguthrie/Desktop/pixelart/imports/hduke/raw`
- `/Users/gguthrie/Desktop/pixelart/imports/dn3dle/raw`

## What "no differences" implies

For the browser version, "no differences" means:

- use the original Build/EDuke rendering and game logic path
- use the original Duke content/data files
- stop hand-placing HUD weapons in JS
- port platform/input/audio/display layers to browser-compatible equivalents

It does **not** mean "rewrite the visuals until they look similar".

## Current direction

1. Bootstrap an Emscripten toolchain locally in the workspace.
2. Build the actual EDuke32 code toward WebAssembly.
3. Identify the minimum platform shims needed for:
   - filesystem/data loading
   - video output
   - input
   - audio
4. Produce the first browser-hosted runtime using the real game data.
5. Only after that, design live multiplayer around an authoritative server model.

## Known immediate blocker

The local machine currently has:

- `cmake`
- `clang`
- `git`
- `node`
- `python3`

But it does **not** currently have:

- `emcc`
- `emcmake`

So the first hard requirement is installing or vendoring Emscripten.

## Current probe results

Emscripten has now been installed locally in:

- `/Users/gguthrie/Desktop/pixelart/.emsdk`

The first dry-run against the staged EDuke32 source shows the build is still wired for desktop:

- compiler path is still `clang++`, not `em++`
- SDL2 is expected from desktop include paths
- platform-specific units like `source/build/src/osxbits.mm` are still in the graph
- the default target is the native `eduke32` executable, not a browser shell

This means the next engineering step is not art/UI tuning. It is build-system surgery:

1. Add a browser/WebAssembly build profile.
2. Replace desktop compiler/linker with `emcc` / `em++`.
3. Remove native platform units from the browser target.
4. Swap or shim the SDL/video/input/audio layer for browser-compatible equivalents.

Only after that do we get a meaningful "real Duke in browser" build artifact.

## Browser Input Policy

The browser runtime intentionally uses two input models only:

- gameplay: relative mouse + keyboard/game buttons
- menus: directional keyboard/gamepad-style navigation

It does **not** support a separate browser-only menu mouse cursor path.

That policy is intentional:

- the current menu behavior already works well
- a separate browser menu mouse path creates an extra input mode to debug
- removing that path reduces browser-only failure cases

When editing browser input code, preserve this rule:

- keep gameplay mouse support
- keep menus directional-only
- do not reintroduce a menu hover/click cursor path unless there is a strong reason and dedicated regression coverage

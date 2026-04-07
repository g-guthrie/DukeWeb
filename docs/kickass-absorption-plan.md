# Kick Ass Absorption Plan

Goal: absorb the useful parts of Kick Ass Duke into our main game and engine instead of running it as an external mod layer.

## What Kick Ass Actually Is

Source package inspected:

- `/Users/gguthrie/Downloads/KickAssDuke_1_2/KADuke_Data.zip`

It is not a forked native engine. It is a large EDuke32 data+script mod:

- 6 `.CON` files
- 2 `.DEF` files
- 14 `.ART` files
- 40 `.MAP` files
- 617 graphics assets
- 453 sound assets

Important implication: "absorbing Kick Ass" should not start with random C++ edits. It should start by deciding which Kick Ass behaviors deserve first-class engine systems and which should remain content/data.

## What Should Become Engine

These are the high-value systems to absorb:

- Weapon state machine
  - Kick Ass has heavy custom fire/reload/alt-fire behavior.
  - `GAME.CON` contains 82 event hooks, including `EVENT_PROCESSINPUT`, `EVENT_PRESSEDFIRE`, `EVENT_FIRE`, `EVENT_ALTFIRE`, `EVENT_DOFIRE`, `EVENT_CHANGEWEAPON`, and `EVENT_SELECTWEAPON`.
  - It also defines 93 unique projectile types.
- Projectile framework
  - This mod is projectile-heavy and uses many custom projectile behaviors as gameplay identity, not just cosmetics.
- HUD and inventory model
  - Kick Ass carries a lot of HUD/inventory state in gamevars and display events. That is a sign the gameplay model wants stronger native support.
- Surface/material response
  - `STEPSOUNDS.CON` is small but useful: footstep and landing sounds by floor material are a good candidate for an engine-owned material system.
- Save-backed gameplay options
  - Kick Ass persists many gameplay options via gamevars. That should become a structured config/save model if we keep those features.

## What Should Stay Data

These should not be hardwired into the engine:

- Episode and level pack definitions in `EPISODES.CON`
- High-res texture replacement rules in `duke3d.def` and `duke3d_KADHRP_polymost.def`
- Raw art/audio imports
- One-off map scripting assumptions tied to specific community maps

If we fuse those directly into engine code, we will make the game less maintainable instead of better.

## Where To Start

Start with the weapon/projectile stack.

Reason:

- It is where Kick Ass adds the most value.
- It is also where the stock modding layer is doing the most workarounds.
- It is central to the feel of the game, browser playability, and future networking.

Relevant engine entry points:

- [player.cpp](/Users/gguthrie/Desktop/pixelart/vendor/eduke32/source/duke3d/src/player.cpp#L873)
- [player.cpp](/Users/gguthrie/Desktop/pixelart/vendor/eduke32/source/duke3d/src/player.cpp#L2036)
- [player.cpp](/Users/gguthrie/Desktop/pixelart/vendor/eduke32/source/duke3d/src/player.cpp#L2103)
- [player.cpp](/Users/gguthrie/Desktop/pixelart/vendor/eduke32/source/duke3d/src/player.cpp#L4148)
- [actors.cpp](/Users/gguthrie/Desktop/pixelart/vendor/eduke32/source/duke3d/src/actors.cpp#L3120)
- [actors.cpp](/Users/gguthrie/Desktop/pixelart/vendor/eduke32/source/duke3d/src/actors.cpp#L4302)

Those files currently own:

- shot creation
- projectile behavior
- weapon firing cadence
- spawn-on-fire logic
- damage resolution

That is the right seam for replacing ad hoc Kick Ass script logic with native systems.

## First Vertical Slice

Do not try to "port Kick Ass" wholesale.

Implement one vertical slice:

1. Add a structured weapon definition model in engine code.
2. Add native support for:
   - primary fire
   - alt fire
   - reload state
   - ammo type
   - projectile or hitscan mode
   - muzzle FX hooks
3. Recreate one Kick Ass weapon end-to-end on top of that model.
4. Only after that, migrate the next weapon.

Good candidate first weapon:

- the combat rifle / reloadable ballistic weapon family

Reason:

- It exercises reloads, muzzle FX, ammo, HUD state, and fire cadence.
- It is less exotic than black holes or special gravity projectiles.

## Low-Risk Parallel Slice

If we want a smaller proving task before weapons, absorb the material footsteps system from `STEPSOUNDS.CON`.

Why it is a good early win:

- isolated
- easy to test
- immediately improves feel
- does not drag in enemy AI, HUD, or savegame complexity

Likely engine seam:

- player movement / landing handling near [player.cpp](/Users/gguthrie/Desktop/pixelart/vendor/eduke32/source/duke3d/src/player.cpp#L3922)

## What Not To Start With

Do not start with:

- `ENEMIES.CON` full AI port
- level-pack integration
- HRP/polymost asset replacement rules
- menu/UI rewrite
- custom gore edge cases

Those are all bigger and more coupled than they look.

## Recommended Next Tasks

1. Unpack `KADuke_Data.zip` into a read-only reference tree inside the project so we can diff and grep it without treating the zip as the source of truth.
2. Build a feature manifest from `GAME.CON`:
   - weapon states
   - projectile definitions
   - HUD/inventory events
   - persisted gameplay options
3. Design a native weapon definition schema.
4. Implement one Kick Ass weapon on top of it.
5. Then add the material footsteps system as a separate cleanup if we have not already done it first.

## Decision Rule

When evaluating a Kick Ass feature, use this rule:

- If it is general gameplay structure used by many weapons or systems, move it into engine code.
- If it is content, presentation, or map-specific behavior, keep it as data.

That keeps the engine cleaner while still letting us absorb the good parts.

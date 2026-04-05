const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

ctx.imageSmoothingEnabled = false;

const renderWidth = canvas.width;
const renderHeight = canvas.height;
const fov = Math.PI / 3;
const baselineAimDegrees = 7;
const baselineAimOffset = Math.tan((baselineAimDegrees * Math.PI) / 180) * renderHeight * 0.6;
const baseViewPitch = -32 - baselineAimOffset;
const maxLookPitch = (20 * Math.PI) / 180;
const lookPitchToPixels = renderHeight * 0.6;
const wallPalette = {
  1: "#68513d",
  2: "#7d7345",
  3: "#4c6772",
  4: "#6a4b5f",
};

const worldMap = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 3, 3, 0, 0, 2, 2, 2, 0, 1],
  [1, 0, 0, 3, 0, 0, 0, 0, 0, 2, 0, 1],
  [1, 0, 0, 3, 0, 4, 4, 4, 0, 2, 0, 1],
  [1, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 1],
  [1, 0, 2, 2, 0, 4, 0, 0, 3, 3, 0, 1],
  [1, 0, 0, 2, 0, 0, 0, 0, 3, 0, 0, 1],
  [1, 0, 0, 2, 2, 2, 0, 0, 3, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 4, 4, 4, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const player = {
  x: 2.5,
  y: 2.5,
  angle: 0,
  pitch: 0,
  radius: 0.22,
  moveSpeed: 2.8,
  turnSpeed: 2.1,
};

const keyState = new Set();
const idleWeaponDef = {
  src: "../assets/duke-pistol/pistol-idle.png",
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};
const firingWeaponDefs = [
  { src: "../assets/duke-pistol/pistol-fire-1.png", duration: 45, scale: 1, offsetX: -2, offsetY: -20 },
  { src: "../assets/duke-pistol/pistol-fire-2.png", duration: 55, scale: 1, offsetX: -2, offsetY: -18 },
  { src: "../assets/duke-pistol/pistol-idle.png", duration: 65, scale: 1, offsetX: 0, offsetY: 0 },
];
const shellDefs = [
  { src: "../assets/duke-pistol/shell-1.png", scale: 1 },
  { src: "../assets/duke-pistol/shell-2.png", scale: 1 },
  { src: "../assets/duke-pistol/shell-3.png", scale: 1 },
];

const state = {
  lastFrameAt: performance.now(),
  flashAt: -Infinity,
  pointerLocked: false,
  idleWeaponFrame: null,
  firingWeaponFrames: [],
  shellFrames: [],
  weaponCycleLength: firingWeaponDefs.reduce((sum, frame) => sum + frame.duration, 0),
  brassCasings: [],
};

function clampPitch(value) {
  return Math.max(-maxLookPitch, Math.min(maxLookPitch, value));
}

function isWall(x, y) {
  const mapX = Math.floor(x);
  const mapY = Math.floor(y);
  return worldMap[mapY]?.[mapX] > 0;
}

function tryMove(nextX, nextY) {
  if (!isWall(nextX + player.radius, player.y) && !isWall(nextX - player.radius, player.y)) {
    player.x = nextX;
  }

  if (!isWall(player.x, nextY + player.radius) && !isWall(player.x, nextY - player.radius)) {
    player.y = nextY;
  }
}

function updatePlayer(delta) {
  let moveX = 0;
  let moveY = 0;
  let angleDelta = 0;
  let pitchDelta = 0;

  const forwardX = Math.cos(player.angle);
  const forwardY = Math.sin(player.angle);
  const rightX = Math.cos(player.angle + Math.PI / 2);
  const rightY = Math.sin(player.angle + Math.PI / 2);

  if (keyState.has("KeyW")) {
    moveX += forwardX;
    moveY += forwardY;
  }
  if (keyState.has("KeyS")) {
    moveX -= forwardX;
    moveY -= forwardY;
  }
  if (keyState.has("KeyA")) {
    moveX -= rightX;
    moveY -= rightY;
  }
  if (keyState.has("KeyD")) {
    moveX += rightX;
    moveY += rightY;
  }
  if (keyState.has("ArrowLeft")) {
    angleDelta -= 1;
  }
  if (keyState.has("ArrowRight")) {
    angleDelta += 1;
  }
  if (keyState.has("ArrowUp")) {
    pitchDelta += 1;
  }
  if (keyState.has("ArrowDown")) {
    pitchDelta -= 1;
  }

  if (moveX !== 0 || moveY !== 0) {
    const length = Math.hypot(moveX, moveY);
    moveX /= length;
    moveY /= length;

    const speed = player.moveSpeed * delta;
    tryMove(player.x + moveX * speed, player.y + moveY * speed);
  }

  if (angleDelta !== 0) {
    player.angle += angleDelta * player.turnSpeed * delta;
  }

  if (pitchDelta !== 0) {
    player.pitch = clampPitch(player.pitch + pitchDelta * player.turnSpeed * 0.65 * delta);
  }
}

function shadeColor(hex, amount) {
  const clamped = Math.max(-1, Math.min(1, amount));
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  const next = [r, g, b].map((channel) => {
    if (clamped >= 0) {
      return Math.round(channel + (255 - channel) * clamped);
    }
    return Math.round(channel * (1 + clamped));
  });
  return `rgb(${next[0]}, ${next[1]}, ${next[2]})`;
}

function getViewPitchOffset() {
  return baseViewPitch + Math.tan(player.pitch) * lookPitchToPixels;
}

function drawSkyAndFloor() {
  const horizonY = renderHeight / 2 + getViewPitchOffset();
  const skyGradient = ctx.createLinearGradient(0, 0, 0, horizonY + renderHeight * 0.08);
  skyGradient.addColorStop(0, "#29394d");
  skyGradient.addColorStop(1, "#101923");
  ctx.fillStyle = skyGradient;
  ctx.fillRect(0, 0, renderWidth, horizonY);

  const floorGradient = ctx.createLinearGradient(0, horizonY, 0, renderHeight);
  floorGradient.addColorStop(0, "#1b1512");
  floorGradient.addColorStop(1, "#09090b");
  ctx.fillStyle = floorGradient;
  ctx.fillRect(0, horizonY, renderWidth, renderHeight - horizonY);

  ctx.fillStyle = "rgba(255, 206, 142, 0.08)";
  for (let y = horizonY; y < renderHeight; y += 12) {
    ctx.fillRect(0, y, renderWidth, 1);
  }
}

function castWalls() {
  const horizonY = renderHeight / 2 + getViewPitchOffset();

  for (let x = 0; x < renderWidth; x += 1) {
    const cameraX = (2 * x) / renderWidth - 1;
    const rayAngle = player.angle + cameraX * (fov / 2);
    const rayDirX = Math.cos(rayAngle);
    const rayDirY = Math.sin(rayAngle);

    let mapX = Math.floor(player.x);
    let mapY = Math.floor(player.y);

    const deltaDistX = Math.abs(1 / (rayDirX || 0.0001));
    const deltaDistY = Math.abs(1 / (rayDirY || 0.0001));

    let stepX = 0;
    let stepY = 0;
    let sideDistX = 0;
    let sideDistY = 0;

    if (rayDirX < 0) {
      stepX = -1;
      sideDistX = (player.x - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1 - player.x) * deltaDistX;
    }

    if (rayDirY < 0) {
      stepY = -1;
      sideDistY = (player.y - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1 - player.y) * deltaDistY;
    }

    let wallType = 0;
    let side = 0;

    while (wallType === 0) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }
      wallType = worldMap[mapY]?.[mapX] ?? 1;
    }

    const distance =
      side === 0
        ? (mapX - player.x + (1 - stepX) / 2) / (rayDirX || 0.0001)
        : (mapY - player.y + (1 - stepY) / 2) / (rayDirY || 0.0001);

    const correctedDistance = Math.max(0.001, distance * Math.cos(rayAngle - player.angle));
    const wallHeight = Math.min(renderHeight * 1.8, renderHeight / correctedDistance);
    const wallTop = Math.round(horizonY - wallHeight / 2);
    const wallBottom = Math.round(horizonY + wallHeight / 2);

    const baseColor = wallPalette[wallType] ?? "#7b6754";
    const distanceShade = Math.min(0.72, correctedDistance / 10);
    const sideShade = side === 1 ? -0.18 : 0;

    ctx.fillStyle = shadeColor(baseColor, -(distanceShade + Math.abs(sideShade)));
    ctx.fillRect(x, wallTop, 1, wallBottom - wallTop);

    ctx.fillStyle = "rgba(255, 245, 228, 0.05)";
    ctx.fillRect(x, wallTop, 1, 1);
  }
}

function shotKick(now) {
  const elapsed = now - state.flashAt;
  const attackMs = 18;
  const releaseMs = 72;
  const totalMs = attackMs + releaseMs;

  if (elapsed < 0 || elapsed > totalMs) {
    return 0;
  }

  if (elapsed <= attackMs) {
    return elapsed / attackMs;
  }

  const releaseProgress = (elapsed - attackMs) / releaseMs;
  return 1 - releaseProgress * releaseProgress;
}

function currentWeaponFrame(now) {
  const elapsed = now - state.flashAt;
  if (elapsed < 0 || elapsed >= state.weaponCycleLength) {
    return state.idleWeaponFrame;
  }

  let cursor = 0;
  for (const frame of state.firingWeaponFrames) {
    cursor += frame.duration;
    if (elapsed < cursor) {
      return frame;
    }
  }

  return state.idleWeaponFrame;
}

function getWeaponPlacement(frame, now, delta, shotActive) {
  const kick = shotKick(now);
  const moving = ["KeyW", "KeyA", "KeyS", "KeyD"].some((code) => keyState.has(code));
  const walkPhase = now * 0.008;
  const bobX = moving ? Math.sin(walkPhase) * 1.2 : 0;
  const bobY = moving ? Math.abs(Math.cos(walkPhase)) * 1.2 : 0;
  const settleY = Math.min(1, delta * 30);
  const recoilScale = shotActive ? 1 : 1 - kick * 0.01;
  const scale = frame.scale * recoilScale;
  const drawWidth = frame.image.width * scale;
  const drawHeight = frame.image.height * scale;
  const recoilX = shotActive ? 0 : kick * 3;
  const recoilY = shotActive ? 0 : kick * 5;
  const anchorRight = 282 + bobX + recoilX;
  const anchorBottom = 196 + bobY + recoilY + settleY;

  return {
    drawWidth,
    drawHeight,
    drawX: anchorRight - drawWidth + frame.offsetX,
    drawY: anchorBottom - drawHeight + frame.offsetY,
  };
}

function spawnBrass(now) {
  const frame = state.firingWeaponFrames[0] ?? state.idleWeaponFrame;
  if (!frame || state.shellFrames.length === 0) {
    return;
  }

  const placement = getWeaponPlacement(frame, now, 0, true);
  const shellFrame = state.shellFrames[Math.floor(Math.random() * state.shellFrames.length)];
  state.brassCasings.push({
    image: shellFrame.image,
    scale: shellFrame.scale,
    x: placement.drawX + placement.drawWidth * 0.18,
    y: placement.drawY + placement.drawHeight * 0.2,
    vx: -38 - Math.random() * 10,
    vy: -62 - Math.random() * 18,
    gravity: 260,
    rotation: Math.random() * Math.PI * 2,
    vr: -10 - Math.random() * 3,
    bornAt: now,
    lifeMs: 420,
  });

  if (state.brassCasings.length > 8) {
    state.brassCasings.shift();
  }
}

function drawWeapon(now, delta) {
  const frame = currentWeaponFrame(now);
  const shotActive = now - state.flashAt >= 0 && now - state.flashAt < state.weaponCycleLength;
  const { drawX, drawY, drawWidth, drawHeight } = getWeaponPlacement(frame, now, delta, shotActive);

  ctx.drawImage(frame.image, Math.round(drawX), Math.round(drawY), drawWidth, drawHeight);
}

function drawBrass(now) {
  state.brassCasings = state.brassCasings.filter((casing) => now - casing.bornAt < casing.lifeMs);

  for (const casing of state.brassCasings) {
    const ageMs = now - casing.bornAt;
    const t = ageMs / 1000;
    const x = casing.x + casing.vx * t;
    const y = casing.y + casing.vy * t + 0.5 * casing.gravity * t * t;
    const rotation = casing.rotation + casing.vr * t;
    const alpha = 1 - ageMs / casing.lifeMs;

    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.rotate(rotation);
    const width = casing.image.width * casing.scale;
    const height = casing.image.height * casing.scale;
    ctx.globalAlpha = alpha;
    ctx.drawImage(casing.image, -width / 2, -height / 2, width, height);
    ctx.restore();
  }
}

function drawShotFlash(now) {
  const kick = shotKick(now);
  if (kick <= 0) {
    return;
  }

  ctx.fillStyle = `rgba(255, 235, 205, ${kick * 0.08})`;
  ctx.fillRect(0, 0, renderWidth, renderHeight);
}

function drawMiniMap() {
  const tileSize = 6;
  const offsetX = renderWidth - worldMap[0].length * tileSize - 8;
  const offsetY = 8;

  ctx.fillStyle = "rgba(7, 8, 11, 0.72)";
  ctx.fillRect(offsetX - 4, offsetY - 4, worldMap[0].length * tileSize + 8, worldMap.length * tileSize + 8);

  for (let y = 0; y < worldMap.length; y += 1) {
    for (let x = 0; x < worldMap[y].length; x += 1) {
      ctx.fillStyle = worldMap[y][x] ? shadeColor(wallPalette[worldMap[y][x]] ?? "#866c58", -0.15) : "#12161d";
      ctx.fillRect(offsetX + x * tileSize, offsetY + y * tileSize, tileSize - 1, tileSize - 1);
    }
  }

  ctx.fillStyle = "#f1a255";
  ctx.fillRect(offsetX + player.x * tileSize - 1, offsetY + player.y * tileSize - 1, 3, 3);
  ctx.strokeStyle = "#f5dfbf";
  ctx.beginPath();
  ctx.moveTo(offsetX + player.x * tileSize, offsetY + player.y * tileSize);
  ctx.lineTo(
    offsetX + player.x * tileSize + Math.cos(player.angle) * 5,
    offsetY + player.y * tileSize + Math.sin(player.angle) * 5,
  );
  ctx.stroke();
}

function render(now) {
  const delta = Math.min(0.033, (now - state.lastFrameAt) / 1000);
  state.lastFrameAt = now;

  updatePlayer(delta);
  drawSkyAndFloor();
  castWalls();
  drawMiniMap();
  drawShotFlash(now);
  drawBrass(now);
  drawWeapon(now, delta);

  requestAnimationFrame(render);
}

function handlePointerMove(event) {
  if (!state.pointerLocked) {
    return;
  }
  player.angle += event.movementX * 0.0028;
  player.pitch = clampPitch(player.pitch - event.movementY * 0.0022);
}

function fireWeapon(now = performance.now()) {
  state.flashAt = now;
  spawnBrass(now);
}

async function loadWeaponFrames() {
  const idleImage = new Image();
  idleImage.src = idleWeaponDef.src;

  const [firingImages, shellImages] = await Promise.all([
    Promise.all(
      firingWeaponDefs.map((frame) => {
        const image = new Image();
        image.src = frame.src;
        return image.decode().then(() => image);
      }),
    ),
    Promise.all(
      shellDefs.map((frame) => {
        const image = new Image();
        image.src = frame.src;
        return image.decode().then(() => image);
      }),
    ),
  ]);

  await idleImage.decode();

  state.idleWeaponFrame = {
    ...idleWeaponDef,
    image: idleImage,
  };
  state.firingWeaponFrames = firingImages.map((image, index) => ({
    ...firingWeaponDefs[index],
    image,
  }));
  state.shellFrames = shellImages.map((image, index) => ({
    ...shellDefs[index],
    image,
  }));
}

function attachControls() {
  window.addEventListener("keydown", (event) => {
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) {
      event.preventDefault();
    }
    if (event.code === "Space") {
      fireWeapon();
    }
    keyState.add(event.code);
  });

  window.addEventListener("keyup", (event) => {
    keyState.delete(event.code);
  });

  window.addEventListener("blur", () => {
    keyState.clear();
  });

  canvas.addEventListener("mousedown", async (event) => {
    if (event.button !== 0) {
      return;
    }

    if (document.pointerLockElement !== canvas) {
      await canvas.requestPointerLock();
    } else {
      fireWeapon();
    }
  });

  document.addEventListener("pointerlockchange", () => {
    state.pointerLocked = document.pointerLockElement === canvas;
  });

  document.addEventListener("mousemove", handlePointerMove);
}

await loadWeaponFrames();
attachControls();
requestAnimationFrame(render);

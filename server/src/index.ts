import { WebSocketServer, WebSocket } from "ws";

const PORT = Number(process.env.PORT ?? 8080);

type InputState = {
  x: number;
  y: number;
  ghostPressed: boolean;
};

type Player = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  score: number;
  deaths: number;
  alive: boolean;
  respawnAt: number;
  input: InputState;
  ghostUntil: number;
  ghostCooldownUntil: number;
  lastSeenAt: number;
};

type Missile = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  spawnAt: number;
};

const TICK_RATE = 30;
const DT = 1 / TICK_RATE;
const ARENA_WIDTH = 1600;
const ARENA_HEIGHT = 900;
const PLAYER_RADIUS = 18;
const MISSILE_RADIUS = 10;
const PLAYER_SPEED = 320;
const GHOST_DURATION_MS = 5000;
const GHOST_COOLDOWN_MS = 15000;
const RESPAWN_DELAY_MS = 1800;
const INITIAL_MISSILE_SPAWN_MS = 1400;
const MIN_MISSILE_SPAWN_MS = 260;
const INITIAL_MAX_MISSILES = 6;
const MAX_MISSILES_CAP = 54;
const INITIAL_MISSILE_SPEED = 225;
const MAX_MISSILE_SPEED = 420;
const SURVIVAL_SCORE_PER_SECOND = 4;
const NEAR_DODGE_DISTANCE = 72;
const NEAR_DODGE_SCORE_PER_SECOND = 10;

const wss = new WebSocketServer({ port: PORT });
const players = new Map<WebSocket, Player>();
const missiles = new Map<string, Missile>();

let nextPlayerId = 1;
let nextMissileId = 1;
const gameStartAt = Date.now();
let lastMissileSpawnAt = gameStartAt;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeInput(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len <= 0.0001) return { x: 0, y: 0 };
  return { x: x / len, y: y / len };
}

function normalizeVector(x: number, y: number): { x: number; y: number } {
  const len = Math.hypot(x, y);
  if (len <= 0.0001) return { x: 1, y: 0 };
  return { x: x / len, y: y / len };
}

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcast(payload: unknown) {
  const message = JSON.stringify(payload);
  for (const ws of players.keys()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

function getAlivePlayers(): Player[] {
  return [...players.values()].filter((p) => p.alive);
}

function getRandomSpawnPoint(): { x: number; y: number } {
  const margin = 80;
  return {
    x: margin + Math.random() * (ARENA_WIDTH - margin * 2),
    y: margin + Math.random() * (ARENA_HEIGHT - margin * 2),
  };
}

function getDifficulty(now: number): number {
  return clamp((now - gameStartAt) / 180000, 0, 1);
}

function getMissileSpawnInterval(now: number): number {
  const difficulty = getDifficulty(now);
  return Math.round(
    INITIAL_MISSILE_SPAWN_MS -
      (INITIAL_MISSILE_SPAWN_MS - MIN_MISSILE_SPAWN_MS) * difficulty
  );
}

function getMaxMissiles(now: number): number {
  const difficulty = getDifficulty(now);
  return Math.round(
    INITIAL_MAX_MISSILES +
      (MAX_MISSILES_CAP - INITIAL_MAX_MISSILES) * difficulty
  );
}

function getMissileSpeed(now: number): number {
  const difficulty = getDifficulty(now);
  return (
    INITIAL_MISSILE_SPEED +
    (MAX_MISSILE_SPEED - INITIAL_MISSILE_SPEED) * difficulty
  );
}

function getMissileSpawnPose(): { x: number; y: number } {
  const margin = 70;
  const side = Math.floor(Math.random() * 4);

  if (side === 0) return { x: -margin, y: Math.random() * ARENA_HEIGHT };
  if (side === 1) return { x: ARENA_WIDTH + margin, y: Math.random() * ARENA_HEIGHT };
  if (side === 2) return { x: Math.random() * ARENA_WIDTH, y: -margin };
  return { x: Math.random() * ARENA_WIDTH, y: ARENA_HEIGHT + margin };
}

function getMissileAimPoint(): { x: number; y: number } {
  const alivePlayers = getAlivePlayers();
  const target = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];

  if (target && Math.random() < 0.72) {
    return {
      x: clamp(target.x + (Math.random() - 0.5) * 320, 0, ARENA_WIDTH),
      y: clamp(target.y + (Math.random() - 0.5) * 240, 0, ARENA_HEIGHT),
    };
  }

  return {
    x: Math.random() * ARENA_WIDTH,
    y: Math.random() * ARENA_HEIGHT,
  };
}

function spawnMissile(now: number) {
  if (getAlivePlayers().length === 0 || missiles.size >= getMaxMissiles(now)) return;

  const id = `M${nextMissileId++}`;
  const { x, y } = getMissileSpawnPose();
  const aim = getMissileAimPoint();
  const dir = normalizeVector(aim.x - x, aim.y - y);
  const speed = getMissileSpeed(now) * (0.9 + Math.random() * 0.22);

  missiles.set(id, {
    id,
    x,
    y,
    vx: dir.x * speed,
    vy: dir.y * speed,
    speed,
    spawnAt: now,
  });
}

function respawnPlayer(player: Player, now: number) {
  const spawn = getRandomSpawnPoint();
  player.x = spawn.x;
  player.y = spawn.y;
  player.vx = 0;
  player.vy = 0;
  player.alive = true;
  player.respawnAt = 0;
  player.ghostUntil = now + 1200;
  player.ghostCooldownUntil = Math.max(player.ghostCooldownUntil, now + 2500);
}

function killPlayer(player: Player, now: number) {
  player.alive = false;
  player.deaths += 1;
  player.respawnAt = now + RESPAWN_DELAY_MS;
  player.vx = 0;
  player.vy = 0;
  player.input.x = 0;
  player.input.y = 0;
  player.input.ghostPressed = false;
}

function updatePlayers(now: number) {
  for (const [ws, p] of players.entries()) {
    if (now - p.lastSeenAt > 30000) {
      ws.close();
      players.delete(ws);
      continue;
    }

    if (!p.alive) {
      if (now >= p.respawnAt) respawnPlayer(p, now);
      continue;
    }

    if (p.input.ghostPressed && now >= p.ghostCooldownUntil) {
      p.ghostUntil = now + GHOST_DURATION_MS;
      p.ghostCooldownUntil = now + GHOST_COOLDOWN_MS;
    }

    p.vx = p.input.x * PLAYER_SPEED;
    p.vy = p.input.y * PLAYER_SPEED;
    p.x = clamp(p.x + p.vx * DT, PLAYER_RADIUS, ARENA_WIDTH - PLAYER_RADIUS);
    p.y = clamp(p.y + p.vy * DT, PLAYER_RADIUS, ARENA_HEIGHT - PLAYER_RADIUS);
    p.score += SURVIVAL_SCORE_PER_SECOND * DT;

    p.input.ghostPressed = false;
  }
}

function updateMissiles(now: number) {
  const spawnInterval = getMissileSpawnInterval(now);

  while (
    now - lastMissileSpawnAt >= spawnInterval &&
    missiles.size < getMaxMissiles(now)
  ) {
    spawnMissile(now);
    lastMissileSpawnAt += spawnInterval;
  }

  for (const missile of missiles.values()) {
    missile.x += missile.vx * DT;
    missile.y += missile.vy * DT;

    const outside =
      missile.x < -120 ||
      missile.x > ARENA_WIDTH + 120 ||
      missile.y < -120 ||
      missile.y > ARENA_HEIGHT + 120;

    if (outside && now - missile.spawnAt > 350) {
      missiles.delete(missile.id);
    }
  }
}

function resolveCollisions(now: number) {
  for (const missile of missiles.values()) {
    for (const player of players.values()) {
      if (!player.alive) continue;

      const distance = Math.hypot(player.x - missile.x, player.y - missile.y);
      const isGhost = now < player.ghostUntil;

      if (distance <= PLAYER_RADIUS + MISSILE_RADIUS) {
        if (!isGhost) {
          killPlayer(player, now);
          missiles.delete(missile.id);
          break;
        }
      } else if (distance <= NEAR_DODGE_DISTANCE && !isGhost) {
        player.score += NEAR_DODGE_SCORE_PER_SECOND * DT;
      }
    }
  }
}

wss.on("connection", (ws) => {
  const id = `P${nextPlayerId++}`;
  const now = Date.now();
  const spawn = getRandomSpawnPoint();

  const player: Player = {
    id,
    x: spawn.x,
    y: spawn.y,
    vx: 0,
    vy: 0,
    score: 0,
    deaths: 0,
    alive: true,
    respawnAt: 0,
    input: { x: 0, y: 0, ghostPressed: false },
    ghostUntil: now + 1200,
    ghostCooldownUntil: 0,
    lastSeenAt: now,
  };

  players.set(ws, player);

  send(ws, {
    type: "welcome",
    id,
    arena: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
    serverTime: now,
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== "input") return;

      const ix = clamp(safeNumber(msg.x), -1, 1);
      const iy = clamp(safeNumber(msg.y), -1, 1);
      const input = normalizeInput(ix, iy);

      player.input.x = input.x;
      player.input.y = input.y;
      player.input.ghostPressed = Boolean(msg.ghostPressed);
      player.lastSeenAt = Date.now();
    } catch {
      // Ignore malformed packets.
    }
  });

  ws.on("close", () => {
    players.delete(ws);
    broadcast({ type: "playerLeft", id });
  });
});

setInterval(() => {
  const now = Date.now();

  updatePlayers(now);
  updateMissiles(now);
  resolveCollisions(now);

  broadcast({
    type: "state",
    serverTime: now,
    players: [...players.values()].map((p) => ({
      id: p.id,
      x: Math.round(p.x),
      y: Math.round(p.y),
      vx: Math.round(p.vx),
      vy: Math.round(p.vy),
      score: Math.floor(p.score),
      deaths: p.deaths,
      alive: p.alive,
      respawnRemainMs: Math.max(0, p.respawnAt - now),
      ghost: now < p.ghostUntil,
      ghostRemainMs: Math.max(0, p.ghostUntil - now),
      ghostCooldownRemainMs: Math.max(0, p.ghostCooldownUntil - now),
    })),
    missiles: [...missiles.values()].map((m) => ({
      id: m.id,
      x: Math.round(m.x),
      y: Math.round(m.y),
      vx: Math.round(m.vx),
      vy: Math.round(m.vy),
    })),
    difficulty: {
      level: Number((1 + getDifficulty(now) * 9).toFixed(1)),
      spawnIntervalMs: getMissileSpawnInterval(now),
      maxMissiles: getMaxMissiles(now),
    },
  });
}, 1000 / TICK_RATE);

console.log(`DodgeMissile server listening on ws://localhost:${PORT}`);

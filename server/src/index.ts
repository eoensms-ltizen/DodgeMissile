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
  input: InputState;
  ghostUntil: number;
  ghostCooldownUntil: number;
  lastSeenAt: number;
};

const TICK_RATE = 30;
const DT = 1 / TICK_RATE;
const ARENA_WIDTH = 1600;
const ARENA_HEIGHT = 900;
const PLAYER_SPEED = 320;
const GHOST_DURATION_MS = 5000;
const GHOST_COOLDOWN_MS = 15000;

const wss = new WebSocketServer({ port: PORT });
const players = new Map<WebSocket, Player>();

let nextId = 1;

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

wss.on("connection", (ws) => {
  const id = `P${nextId++}`;
  const now = Date.now();

  const player: Player = {
    id,
    x: Math.random() * ARENA_WIDTH,
    y: Math.random() * ARENA_HEIGHT,
    vx: 0,
    vy: 0,
    input: { x: 0, y: 0, ghostPressed: false },
    ghostUntil: 0,
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

  for (const [ws, p] of players.entries()) {
    if (now - p.lastSeenAt > 30000) {
      ws.close();
      players.delete(ws);
      continue;
    }

    if (p.input.ghostPressed && now >= p.ghostCooldownUntil) {
      p.ghostUntil = now + GHOST_DURATION_MS;
      p.ghostCooldownUntil = now + GHOST_COOLDOWN_MS;
    }

    p.vx = p.input.x * PLAYER_SPEED;
    p.vy = p.input.y * PLAYER_SPEED;
    p.x = clamp(p.x + p.vx * DT, 0, ARENA_WIDTH);
    p.y = clamp(p.y + p.vy * DT, 0, ARENA_HEIGHT);

    // One-shot input.
    p.input.ghostPressed = false;
  }

  broadcast({
    type: "state",
    serverTime: now,
    players: [...players.values()].map((p) => ({
      id: p.id,
      x: Math.round(p.x),
      y: Math.round(p.y),
      vx: Math.round(p.vx),
      vy: Math.round(p.vy),
      ghost: now < p.ghostUntil,
      ghostRemainMs: Math.max(0, p.ghostUntil - now),
      ghostCooldownRemainMs: Math.max(0, p.ghostCooldownUntil - now),
    })),
  });
}, 1000 / TICK_RATE);

console.log(`DodgeMissile server listening on ws://localhost:${PORT}`);

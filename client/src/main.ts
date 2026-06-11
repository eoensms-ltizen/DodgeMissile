import "./style.css";
import { Application, Container, Graphics, Text } from "pixi.js";

type PlayerState = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  score: number;
  deaths: number;
  alive: boolean;
  respawnRemainMs: number;
  ghost: boolean;
  ghostRemainMs: number;
  ghostCooldownRemainMs: number;
};

type MissileState = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type ServerMessage =
  | {
      type: "welcome";
      id: string;
      arena: { width: number; height: number };
      serverTime: number;
    }
  | {
      type: "state";
      serverTime: number;
      players: PlayerState[];
      missiles: MissileState[];
      difficulty?: {
        level: number;
        spawnIntervalMs: number;
        maxMissiles: number;
      };
    }
  | {
      type: "playerLeft";
      id: string;
    };

const WS_URL = import.meta.env.VITE_WS_URL ?? `ws://${location.hostname}:8080`;

const app = new Application();
const world = new Container();

const arena = { width: 1600, height: 900 };
let myId = "";
let socket: WebSocket | null = null;
let reconnectTimer: number | null = null;
let reconnectAttempts = 0;
let lastGhostPressed = false;

const players = new Map<string, PlayerState>();
const sprites = new Map<string, { body: Graphics; label: Text }>();
const playerViews = new Map<string, { x: number; y: number }>();
const missiles = new Map<string, MissileState>();
const missileSprites = new Map<string, Graphics>();
const missileViews = new Map<string, { x: number; y: number }>();
let difficulty = { level: 1, spawnIntervalMs: 0, maxMissiles: 0 };

const keys = new Set<string>();

const statusEl = document.querySelector<HTMLDivElement>("#status")!;
const statsEl = document.querySelector<HTMLDivElement>("#stats")!;
const ghostButton = document.querySelector<HTMLButtonElement>("#ghostButton")!;
const joystickBase = document.querySelector<HTMLDivElement>("#joystickBase")!;
const joystickKnob = document.querySelector<HTMLDivElement>("#joystickKnob")!;

let joystick = { active: false, pointerId: -1, x: 0, y: 0 };

function connect() {
  if (
    socket &&
    (socket.readyState === WebSocket.CONNECTING ||
      socket.readyState === WebSocket.OPEN)
  ) {
    return;
  }

  if (reconnectTimer !== null) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  statusEl.textContent = `connecting ${WS_URL}`;
  socket = new WebSocket(WS_URL);

  socket.addEventListener("open", () => {
    reconnectAttempts = 0;
    statusEl.textContent = "connected";
  });

  socket.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data) as ServerMessage;

    if (msg.type === "welcome") {
      myId = msg.id;
      arena.width = msg.arena.width;
      arena.height = msg.arena.height;
    }

    if (msg.type === "state") {
      players.clear();
      for (const p of msg.players) players.set(p.id, p);
      missiles.clear();
      for (const m of msg.missiles ?? []) missiles.set(m.id, m);
      if (msg.difficulty) difficulty = msg.difficulty;
    }

    if (msg.type === "playerLeft") {
      players.delete(msg.id);
      const sprite = sprites.get(msg.id);
      playerViews.delete(msg.id);
      if (sprite) {
        world.removeChild(sprite.body);
        world.removeChild(sprite.label);
        sprites.delete(msg.id);
      }
    }
  });

  socket.addEventListener("close", () => {
    socket = null;
    myId = "";
    players.clear();
    missiles.clear();

    const retryMs = Math.min(1000 * 2 ** reconnectAttempts, 8000);
    reconnectAttempts += 1;
    statusEl.textContent = `disconnected - retrying in ${Math.ceil(
      retryMs / 1000
    )}s`;

    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, retryMs);
  });

  socket.addEventListener("error", () => {
    statusEl.textContent = "socket error";
  });
}

function getKeyboardInput() {
  let x = 0;
  let y = 0;

  if (keys.has("KeyA") || keys.has("ArrowLeft")) x -= 1;
  if (keys.has("KeyD") || keys.has("ArrowRight")) x += 1;
  if (keys.has("KeyW") || keys.has("ArrowUp")) y -= 1;
  if (keys.has("KeyS") || keys.has("ArrowDown")) y += 1;

  return { x, y };
}

function getFinalInput() {
  const keyboard = getKeyboardInput();
  let x = keyboard.x + joystick.x;
  let y = keyboard.y + joystick.y;
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  return { x, y };
}

function sendInput() {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;

  const input = getFinalInput();
  socket.send(
    JSON.stringify({
      type: "input",
      x: input.x,
      y: input.y,
      ghostPressed: lastGhostPressed,
    })
  );

  lastGhostPressed = false;
}

function ensureSprite(id: string) {
  let sprite = sprites.get(id);
  if (sprite) return sprite;

  const body = new Graphics();
  const label = new Text({
    text: id,
    style: { fill: "white", fontSize: 13 },
  });

  world.addChild(body);
  world.addChild(label);

  sprite = { body, label };
  sprites.set(id, sprite);
  return sprite;
}

function ensureMissileSprite(id: string) {
  let sprite = missileSprites.get(id);
  if (sprite) return sprite;

  sprite = new Graphics();
  world.addChild(sprite);
  missileSprites.set(id, sprite);
  return sprite;
}

function getPlayerView(p: PlayerState, isMe: boolean) {
  let view = playerViews.get(p.id);
  if (!view || isMe) {
    view = { x: p.x, y: p.y };
    playerViews.set(p.id, view);
    return view;
  }

  view.x += (p.x - view.x) * 0.34;
  view.y += (p.y - view.y) * 0.34;
  return view;
}

function getMissileView(m: MissileState) {
  let view = missileViews.get(m.id);
  if (!view) {
    view = { x: m.x, y: m.y };
    missileViews.set(m.id, view);
    return view;
  }

  view.x += (m.x - view.x) * 0.46;
  view.y += (m.y - view.y) * 0.46;
  return view;
}

function drawArena() {
  const g = new Graphics();
  g.rect(0, 0, arena.width, arena.height);
  g.stroke({ color: 0x2a3558, width: 6 });
  world.addChildAt(g, 0);
}

function updateCamera() {
  const me = players.get(myId);
  const meView = me ? getPlayerView(me, true) : null;
  const targetX = meView ? meView.x : arena.width / 2;
  const targetY = meView ? meView.y : arena.height / 2;
  world.x = app.screen.width / 2 - targetX;
  world.y = app.screen.height / 2 - targetY;
}

function renderPlayers() {
  for (const p of players.values()) {
    const s = ensureSprite(p.id);
    const isMe = p.id === myId;
    const view = getPlayerView(p, isMe);

    s.body.clear();

    if (!p.alive) {
      s.body.circle(0, 0, isMe ? 20 : 17);
      s.body.stroke({ color: 0x98a0b3, width: 3, alpha: 0.65 });
      s.body.moveTo(-11, -11);
      s.body.lineTo(11, 11);
      s.body.moveTo(11, -11);
      s.body.lineTo(-11, 11);
      s.body.stroke({ color: 0x98a0b3, width: 3, alpha: 0.65 });
    } else if (p.ghost) {
      s.body.circle(0, 0, isMe ? 23 : 20);
      s.body.fill({ color: isMe ? 0x88ccff : 0xb6f0ff, alpha: 0.28 });
      s.body.circle(0, 0, isMe ? 14 : 12);
      s.body.stroke({ color: 0x99ddff, width: 3, alpha: 0.9 });
    } else {
      s.body.circle(0, 0, isMe ? 18 : 15);
      s.body.fill({ color: isMe ? 0x65e572 : 0xff6b6b, alpha: 0.95 });
    }

    s.body.x = view.x;
    s.body.y = view.y;

    s.label.text = `${isMe ? `${p.id} YOU` : p.id} ${p.alive ? p.score : `RESPAWN ${Math.ceil(p.respawnRemainMs / 1000)}`}`;
    s.label.x = view.x - 40;
    s.label.y = view.y - 42;
  }

  for (const [id, s] of sprites.entries()) {
    if (!players.has(id)) {
      world.removeChild(s.body);
      world.removeChild(s.label);
      sprites.delete(id);
      playerViews.delete(id);
    }
  }

  const me = players.get(myId);
  if (me) {
    const cd = Math.ceil(me.ghostCooldownRemainMs / 1000);
    ghostButton.textContent = me.ghost
      ? `GHOST\n${Math.ceil(me.ghostRemainMs / 1000)}`
      : cd > 0
        ? `CD ${cd}`
        : "GHOST";
  }
}

function renderMissiles() {
  for (const m of missiles.values()) {
    const s = ensureMissileSprite(m.id);
    const view = getMissileView(m);
    const angle = Math.atan2(m.vy, m.vx);

    s.clear();
    s.rotation = angle;
    s.x = view.x;
    s.y = view.y;
    s.moveTo(18, 0);
    s.lineTo(-12, -9);
    s.lineTo(-6, 0);
    s.lineTo(-12, 9);
    s.closePath();
    s.fill({ color: 0xff3658, alpha: 0.96 });
    s.circle(-15, 0, 5);
    s.fill({ color: 0xffb84d, alpha: 0.72 });
  }

  for (const [id, sprite] of missileSprites.entries()) {
    if (!missiles.has(id)) {
      world.removeChild(sprite);
      missileSprites.delete(id);
      missileViews.delete(id);
    }
  }
}

function updateHud() {
  const connected = socket?.readyState === WebSocket.OPEN;
  const me = players.get(myId);
  statusEl.textContent = `${connected ? "connected" : "connecting"} / myId=${myId || "-"} / players=${players.size}`;
  statsEl.textContent = me
    ? `score=${me.score} / deaths=${me.deaths} / missiles=${missiles.size}/${difficulty.maxMissiles} / level=${difficulty.level}`
    : `score=0 / deaths=0 / missiles=${missiles.size}`;
}

function updateJoystickVisual() {
  const r = 40;
  joystickKnob.style.transform = `translate(${joystick.x * r}px, ${joystick.y * r}px)`;
}

function setJoystickFromPointer(e: PointerEvent) {
  const rect = joystickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  let x = (e.clientX - cx) / (rect.width * 0.38);
  let y = (e.clientY - cy) / (rect.height * 0.38);
  const len = Math.hypot(x, y);
  if (len > 1) {
    x /= len;
    y /= len;
  }
  joystick.x = x;
  joystick.y = y;
  updateJoystickVisual();
}

window.addEventListener("keydown", (e) => {
  keys.add(e.code);
  if (e.code === "Space") {
    e.preventDefault();
    lastGhostPressed = true;
  }
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.code);
});

ghostButton.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  lastGhostPressed = true;
});

joystickBase.addEventListener("pointerdown", (e) => {
  joystick.active = true;
  joystick.pointerId = e.pointerId;
  joystickBase.setPointerCapture(e.pointerId);
  setJoystickFromPointer(e);
});

joystickBase.addEventListener("pointermove", (e) => {
  if (!joystick.active || joystick.pointerId !== e.pointerId) return;
  setJoystickFromPointer(e);
});

function releaseJoystick(e: PointerEvent) {
  if (joystick.pointerId !== e.pointerId) return;
  joystick.active = false;
  joystick.pointerId = -1;
  joystick.x = 0;
  joystick.y = 0;
  updateJoystickVisual();
}

joystickBase.addEventListener("pointerup", releaseJoystick);
joystickBase.addEventListener("pointercancel", releaseJoystick);

async function bootstrap() {
  await app.init({
    resizeTo: window,
    background: "#05070d",
    antialias: true,
  });

  document.querySelector<HTMLDivElement>("#app")!.appendChild(app.canvas);
  app.stage.addChild(world);

  drawArena();
  connect();

  setInterval(sendInput, 1000 / 30);

  app.ticker.add(() => {
    updateCamera();
    renderMissiles();
    renderPlayers();
    updateHud();
  });
}

void bootstrap();

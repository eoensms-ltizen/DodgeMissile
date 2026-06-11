import "./style.css";
import { Application, Container, Graphics, Text } from "pixi.js";

type PlayerState = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ghost: boolean;
  ghostRemainMs: number;
  ghostCooldownRemainMs: number;
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

const keys = new Set<string>();

const statusEl = document.querySelector<HTMLDivElement>("#status")!;
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
    }

    if (msg.type === "playerLeft") {
      players.delete(msg.id);
      const sprite = sprites.get(msg.id);
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

function drawArena() {
  const g = new Graphics();
  g.rect(0, 0, arena.width, arena.height);
  g.stroke({ color: 0x2a3558, width: 6 });
  world.addChildAt(g, 0);
}

function updateCamera() {
  const me = players.get(myId);
  const targetX = me ? me.x : arena.width / 2;
  const targetY = me ? me.y : arena.height / 2;
  world.x = app.screen.width / 2 - targetX;
  world.y = app.screen.height / 2 - targetY;
}

function renderPlayers() {
  for (const p of players.values()) {
    const s = ensureSprite(p.id);
    const isMe = p.id === myId;

    s.body.clear();

    if (p.ghost) {
      s.body.circle(0, 0, isMe ? 23 : 20);
      s.body.fill({ color: isMe ? 0x88ccff : 0xb6f0ff, alpha: 0.28 });
      s.body.circle(0, 0, isMe ? 14 : 12);
      s.body.stroke({ color: 0x99ddff, width: 3, alpha: 0.9 });
    } else {
      s.body.circle(0, 0, isMe ? 18 : 15);
      s.body.fill({ color: isMe ? 0x65e572 : 0xff6b6b, alpha: 0.95 });
    }

    s.body.x = p.x;
    s.body.y = p.y;

    s.label.text = isMe ? `${p.id} YOU` : p.id;
    s.label.x = p.x - 24;
    s.label.y = p.y - 42;
  }

  for (const [id, s] of sprites.entries()) {
    if (!players.has(id)) {
      world.removeChild(s.body);
      world.removeChild(s.label);
      sprites.delete(id);
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
    renderPlayers();

    const connected = socket?.readyState === WebSocket.OPEN;
    const count = players.size;
    statusEl.textContent = `${connected ? "connected" : "connecting"} / myId=${myId || "-"} / players=${count}`;
  });
}

void bootstrap();

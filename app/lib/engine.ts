import { audio } from "./audio";
import {
  COLS,
  ROWS,
  MazeData,
  isPassable,
  parseMaze,
  TileKind,
} from "./maze";

export type Dir = "up" | "down" | "left" | "right" | "none";

const DIR_VEC: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  none: { x: 0, y: 0 },
};

const OPPOSITE: Record<Dir, Dir> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
  none: "none",
};

interface Entity {
  x: number; // tile coords (float)
  y: number;
  dir: Dir;
  speed: number; // tiles per second
}

interface Pacman extends Entity {
  nextDir: Dir;
  mouth: number; // 0..1 animation
  alive: boolean;
}

type GhostName = "blinky" | "pinky" | "inky" | "clyde";

interface Ghost extends Entity {
  name: GhostName;
  color: string;
  scatterTarget: { x: number; y: number };
  mode: "chase" | "scatter" | "frightened" | "eaten";
  homeTile: { x: number; y: number };
  inHouse: boolean;
  releaseAt: number; // ms remaining before leaving house
}

export interface GameState {
  maze: MazeData;
  tiles: TileKind[][];
  pacman: Pacman;
  ghosts: Ghost[];
  score: number;
  highScore: number;
  lives: number;
  level: number;
  dotsRemaining: number;
  status: "ready" | "playing" | "paused" | "dying" | "won" | "lost";
  frightenedTimer: number; // ms
  ghostStreak: number; // ghosts eaten in current power session
  flashTimer: number; // for ready/lost text
  message: string;
}

const PAC_SPEED = 7.5; // tiles per second
const GHOST_SPEED = 6.8;
const FRIGHT_SPEED = 4.2;
const EATEN_SPEED = 12.0;
const FRIGHT_DURATION = 7000;

const GHOST_DEFS: Array<{
  name: GhostName;
  color: string;
  scatter: { x: number; y: number };
  releaseDelay: number;
}> = [
  { name: "blinky", color: "#ff2d2d", scatter: { x: COLS - 2, y: 1 }, releaseDelay: 0 },
  { name: "pinky", color: "#ffb6e0", scatter: { x: 1, y: 1 }, releaseDelay: 1500 },
  { name: "inky", color: "#3df0ff", scatter: { x: COLS - 2, y: ROWS - 2 }, releaseDelay: 4000 },
  { name: "clyde", color: "#ffae42", scatter: { x: 1, y: ROWS - 2 }, releaseDelay: 7000 },
];

export function createGameState(): GameState {
  const maze = parseMaze();
  const pacman: Pacman = {
    x: maze.pacmanSpawn.x,
    y: maze.pacmanSpawn.y,
    dir: "left",
    nextDir: "left",
    mouth: 0,
    alive: true,
    speed: PAC_SPEED,
  };

  const ghosts: Ghost[] = GHOST_DEFS.map((def, i) => {
    const spawn = maze.ghostSpawns[i] ?? maze.ghostSpawns[0];
    return {
      name: def.name,
      color: def.color,
      x: spawn.x,
      y: spawn.y,
      dir: i % 2 === 0 ? "up" : "down",
      speed: GHOST_SPEED,
      scatterTarget: def.scatter,
      mode: "scatter",
      homeTile: { x: 13, y: 14 }, // door tile area
      inHouse: def.name !== "blinky",
      releaseAt: def.releaseDelay,
    };
  });

  return {
    maze,
    tiles: maze.tiles.map((row) => [...row]),
    pacman,
    ghosts,
    score: 0,
    highScore: loadHighScore(),
    lives: 3,
    level: 1,
    dotsRemaining: maze.totalDots,
    status: "ready",
    frightenedTimer: 0,
    ghostStreak: 0,
    flashTimer: 0,
    message: "READY!",
  };
}

function loadHighScore(): number {
  if (typeof window === "undefined") return 0;
  const v = window.localStorage?.getItem("pacman.hi");
  return v ? parseInt(v, 10) || 0 : 0;
}

function saveHighScore(score: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem("pacman.hi", String(score));
  } catch {}
}

function tileAt(state: GameState, x: number, y: number): TileKind {
  // Tunnel wrap at the middle row
  const wrappedX = ((x % COLS) + COLS) % COLS;
  if (y < 0 || y >= ROWS) return "wall";
  return state.tiles[y][wrappedX];
}

// Door is one-way: only eaten ghosts (returning home) may pass.
function ghostCanEnter(tile: TileKind, ghost?: Ghost): boolean {
  if (tile === "wall") return false;
  if (tile === "door") return ghost ? ghost.mode === "eaten" : true;
  return true;
}

function atTileCenter(e: Entity): boolean {
  const dx = Math.abs(e.x - Math.round(e.x));
  const dy = Math.abs(e.y - Math.round(e.y));
  return dx < 0.05 && dy < 0.05;
}

function moveEntity(
  state: GameState,
  e: Entity,
  dt: number,
  asGhost: Ghost | null,
): boolean {
  const v = DIR_VEC[e.dir];
  if (v.x === 0 && v.y === 0) return false;
  const step = e.speed * dt;
  const nx = e.x + v.x * step;
  const ny = e.y + v.y * step;
  // Collision check the tile we'd be entering
  const targetX = Math.round(nx + v.x * 0.5);
  const targetY = Math.round(ny + v.y * 0.5);
  const t = tileAt(state, targetX, targetY);
  const ok = asGhost ? ghostCanEnter(t, asGhost) : isPassable(t, false);
  if (!ok) {
    // Snap to current tile center to avoid drifting into wall
    e.x = Math.round(e.x);
    e.y = Math.round(e.y);
    return false;
  }
  e.x = nx;
  e.y = ny;
  // Tunnel wrap
  if (e.x < -0.5) e.x = COLS - 0.5;
  else if (e.x > COLS - 0.5) e.x = -0.5;
  return true;
}

function tryQueuedTurn(state: GameState, p: Pacman) {
  if (p.nextDir === "none" || p.nextDir === p.dir) return;
  // Allow opposite reversal anytime
  if (OPPOSITE[p.dir] === p.nextDir) {
    p.dir = p.nextDir;
    return;
  }
  // Otherwise only at tile centers
  if (!atTileCenter(p)) return;
  const v = DIR_VEC[p.nextDir];
  const tx = Math.round(p.x) + v.x;
  const ty = Math.round(p.y) + v.y;
  if (isPassable(tileAt(state, tx, ty), false)) {
    p.dir = p.nextDir;
    p.x = Math.round(p.x);
    p.y = Math.round(p.y);
  }
}

function eatTileUnderPacman(state: GameState) {
  const tx = Math.round(state.pacman.x);
  const ty = Math.round(state.pacman.y);
  if (ty < 0 || ty >= ROWS) return;
  const wrappedX = ((tx % COLS) + COLS) % COLS;
  const t = state.tiles[ty][wrappedX];
  if (t === "dot") {
    state.tiles[ty][wrappedX] = "empty";
    state.score += 10;
    state.dotsRemaining--;
    audio.chomp();
  } else if (t === "power") {
    state.tiles[ty][wrappedX] = "empty";
    state.score += 50;
    state.dotsRemaining--;
    state.frightenedTimer = FRIGHT_DURATION;
    state.ghostStreak = 0;
    state.ghosts.forEach((g) => {
      if (g.mode !== "eaten") {
        g.mode = "frightened";
        g.dir = OPPOSITE[g.dir] === "none" ? g.dir : OPPOSITE[g.dir];
      }
    });
    audio.eatPower();
    audio.startSiren(true);
  }
}

function manhattan(ax: number, ay: number, bx: number, by: number) {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function distSq(ax: number, ay: number, bx: number, by: number) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

function ghostTarget(state: GameState, g: Ghost): { x: number; y: number } {
  if (g.mode === "eaten") return { x: 13, y: 13 };
  if (g.mode === "scatter") return g.scatterTarget;
  if (g.mode === "frightened") {
    // pick random-ish target via current tile + random offset
    return {
      x: Math.floor(Math.random() * COLS),
      y: Math.floor(Math.random() * ROWS),
    };
  }
  // chase
  const p = state.pacman;
  const px = Math.round(p.x);
  const py = Math.round(p.y);
  switch (g.name) {
    case "blinky":
      return { x: px, y: py };
    case "pinky": {
      const v = DIR_VEC[p.dir];
      return { x: px + v.x * 4, y: py + v.y * 4 };
    }
    case "inky": {
      const v = DIR_VEC[p.dir];
      const ahead = { x: px + v.x * 2, y: py + v.y * 2 };
      const blinky = state.ghosts.find((x) => x.name === "blinky")!;
      return {
        x: ahead.x + (ahead.x - Math.round(blinky.x)),
        y: ahead.y + (ahead.y - Math.round(blinky.y)),
      };
    }
    case "clyde": {
      const d = manhattan(g.x, g.y, p.x, p.y);
      return d > 8 ? { x: px, y: py } : g.scatterTarget;
    }
  }
}

function chooseGhostDir(state: GameState, g: Ghost) {
  if (!atTileCenter(g)) return;
  const tx = Math.round(g.x);
  const ty = Math.round(g.y);
  const target = ghostTarget(state, g);
  const candidates: Dir[] = ["up", "left", "down", "right"]; // tie-break order
  let best: Dir = g.dir;
  let bestScore = Infinity;
  let foundAny = false;
  for (const d of candidates) {
    if (d === OPPOSITE[g.dir]) continue; // ghosts don't reverse mid-corridor
    const v = DIR_VEC[d];
    const nx = tx + v.x;
    const ny = ty + v.y;
    if (!ghostCanEnter(tileAt(state, nx, ny), g)) continue;
    const score = distSq(nx, ny, target.x, target.y);
    if (score < bestScore) {
      bestScore = score;
      best = d;
      foundAny = true;
    }
  }
  if (!foundAny) {
    // Dead end — allow reversal
    best = OPPOSITE[g.dir];
  }
  g.dir = best;
  g.x = tx;
  g.y = ty;
}

function updateGhost(state: GameState, g: Ghost, dt: number) {
  // House release timer
  if (g.inHouse) {
    g.releaseAt -= dt * 1000;
    if (g.releaseAt <= 0) {
      g.inHouse = false;
      g.x = 13;
      g.y = 11; // exit just above the door
      g.dir = "left";
    } else {
      // bob inside
      g.y += Math.sin(performance.now() / 200) * 0.001;
      return;
    }
  }

  // Eaten ghosts return home, then respawn as normal
  if (g.mode === "eaten") {
    g.speed = EATEN_SPEED;
    // Target the tile inside the pen below the door — once there, we
    // teleport back above the door and resume chase.
    if (Math.abs(g.x - 13) < 0.2 && Math.abs(g.y - 13) < 0.2) {
      g.mode = "chase";
      g.speed = GHOST_SPEED;
      g.x = 13;
      g.y = 11;
      g.dir = "left";
    }
  } else if (g.mode === "frightened") {
    g.speed = FRIGHT_SPEED;
  } else {
    g.speed = GHOST_SPEED;
  }

  chooseGhostDir(state, g);
  moveEntity(state, g, dt, g);
}

export function step(state: GameState, dt: number) {
  if (state.status !== "playing") {
    state.flashTimer += dt;
    return;
  }

  // Pacman
  tryQueuedTurn(state, state.pacman);
  const moved = moveEntity(state, state.pacman, dt, null);
  if (moved) {
    state.pacman.mouth = (state.pacman.mouth + dt * 8) % (Math.PI * 2);
  }
  eatTileUnderPacman(state);

  // Frightened timer
  if (state.frightenedTimer > 0) {
    state.frightenedTimer -= dt * 1000;
    if (state.frightenedTimer <= 0) {
      state.frightenedTimer = 0;
      state.ghosts.forEach((g) => {
        if (g.mode === "frightened") g.mode = "chase";
      });
      audio.startSiren(false);
    }
  }

  // Ghosts
  state.ghosts.forEach((g) => updateGhost(state, g, dt));

  // Collisions
  for (const g of state.ghosts) {
    if (g.inHouse || g.mode === "eaten") continue;
    if (Math.abs(g.x - state.pacman.x) < 0.7 && Math.abs(g.y - state.pacman.y) < 0.7) {
      if (g.mode === "frightened") {
        g.mode = "eaten";
        state.ghostStreak += 1;
        const points = 200 * Math.pow(2, state.ghostStreak - 1);
        state.score += points;
        audio.eatGhost();
      } else {
        triggerDeath(state);
        return;
      }
    }
  }

  // Win
  if (state.dotsRemaining <= 0) {
    state.status = "won";
    state.message = "YOU WIN!";
    audio.stopSiren();
    audio.win();
    if (state.score > state.highScore) {
      state.highScore = state.score;
      saveHighScore(state.highScore);
    }
  }
}

export function triggerDeath(state: GameState) {
  state.status = "dying";
  state.pacman.alive = false;
  state.flashTimer = 0;
  audio.stopSiren();
  audio.death();
}

export function finalizeDeath(state: GameState) {
  state.lives -= 1;
  if (state.lives <= 0) {
    state.status = "lost";
    state.message = "GAME OVER";
    if (state.score > state.highScore) {
      state.highScore = state.score;
      saveHighScore(state.highScore);
    }
    return;
  }
  // Reset positions
  state.pacman.x = state.maze.pacmanSpawn.x;
  state.pacman.y = state.maze.pacmanSpawn.y;
  state.pacman.dir = "left";
  state.pacman.nextDir = "left";
  state.pacman.alive = true;
  state.frightenedTimer = 0;
  state.ghosts.forEach((g, i) => {
    const def = GHOST_DEFS[i];
    const spawn = state.maze.ghostSpawns[i] ?? state.maze.ghostSpawns[0];
    g.x = spawn.x;
    g.y = spawn.y;
    g.dir = i % 2 === 0 ? "up" : "down";
    g.mode = "scatter";
    g.inHouse = def.name !== "blinky";
    g.releaseAt = def.releaseDelay;
    g.speed = GHOST_SPEED;
  });
  state.status = "ready";
  state.message = "READY!";
  state.flashTimer = 0;
}

export function setNextDir(state: GameState, dir: Dir) {
  if (state.status === "playing") {
    state.pacman.nextDir = dir;
  }
}

export function startPlaying(state: GameState) {
  if (state.status === "ready") {
    state.status = "playing";
    state.flashTimer = 0;
    audio.intro();
    setTimeout(() => audio.startSiren(false), 700);
  }
}

export function togglePause(state: GameState) {
  if (state.status === "playing") {
    state.status = "paused";
    audio.stopSiren();
  } else if (state.status === "paused") {
    state.status = "playing";
    audio.startSiren(state.frightenedTimer > 0);
  }
}

export function restart(state: GameState): GameState {
  audio.stopSiren();
  return createGameState();
}

// ------- Rendering -------

export interface RenderOpts {
  cellSize: number;
}

const WALL_COLOR = "#1f3bff";
const WALL_HIGHLIGHT = "#3b82ff";
const DOOR_COLOR = "#ffb8de";

export function render(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  opts: RenderOpts,
) {
  const { cellSize } = opts;
  const w = COLS * cellSize;
  const h = ROWS * cellSize;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, w, h);

  // Walls + dots
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const t = state.tiles[y][x];
      const px = x * cellSize;
      const py = y * cellSize;
      if (t === "wall") {
        drawWall(ctx, state.tiles, x, y, cellSize);
      } else if (t === "door") {
        ctx.fillStyle = DOOR_COLOR;
        ctx.fillRect(px, py + cellSize * 0.45, cellSize, cellSize * 0.1);
      } else if (t === "dot") {
        ctx.fillStyle = "#ffd9a8";
        ctx.beginPath();
        ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize * 0.12, 0, Math.PI * 2);
        ctx.fill();
      } else if (t === "power") {
        const pulse = 0.35 + 0.15 * Math.sin(performance.now() / 150);
        ctx.fillStyle = "#ffe6c0";
        ctx.beginPath();
        ctx.arc(px + cellSize / 2, py + cellSize / 2, cellSize * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // Ghosts (draw before/after pacman; draw before so pacman is on top)
  state.ghosts.forEach((g) => drawGhost(ctx, g, state, cellSize));

  // Pac-Man
  drawPacman(ctx, state, cellSize);

  // Overlay messages
  if (state.status === "ready" || state.status === "lost" || state.status === "won") {
    ctx.fillStyle =
      state.status === "lost" ? "#ff5555" : state.status === "won" ? "#9eff9e" : "#ffd02b";
    ctx.font = `bold ${cellSize * 1.4}px "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(state.message, w / 2, h / 2 + cellSize * 1.3);
  } else if (state.status === "paused") {
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#ffd02b";
    ctx.font = `bold ${cellSize * 1.6}px "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PAUSED", w / 2, h / 2);
  }
}

function isWall(tiles: TileKind[][], x: number, y: number): boolean {
  if (y < 0 || y >= ROWS) return false;
  if (x < 0 || x >= COLS) return false;
  const t = tiles[y][x];
  return t === "wall";
}

function drawWall(
  ctx: CanvasRenderingContext2D,
  tiles: TileKind[][],
  x: number,
  y: number,
  s: number,
) {
  const px = x * s;
  const py = y * s;
  ctx.fillStyle = WALL_COLOR;
  ctx.fillRect(px, py, s, s);
  // Inner highlight rim where adjacent is open
  ctx.fillStyle = WALL_HIGHLIGHT;
  const t = s * 0.18;
  if (!isWall(tiles, x, y - 1)) ctx.fillRect(px, py, s, t);
  if (!isWall(tiles, x, y + 1)) ctx.fillRect(px, py + s - t, s, t);
  if (!isWall(tiles, x - 1, y)) ctx.fillRect(px, py, t, s);
  if (!isWall(tiles, x + 1, y)) ctx.fillRect(px + s - t, py, t, s);
}

function drawPacman(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  s: number,
) {
  const p = state.pacman;
  const cx = p.x * s + s / 2;
  const cy = p.y * s + s / 2;
  const r = s * 0.45;
  ctx.save();
  ctx.translate(cx, cy);
  let angle = 0;
  switch (p.dir) {
    case "right":
      angle = 0;
      break;
    case "down":
      angle = Math.PI / 2;
      break;
    case "left":
      angle = Math.PI;
      break;
    case "up":
      angle = -Math.PI / 2;
      break;
  }
  ctx.rotate(angle);

  if (state.status === "dying") {
    const t = Math.min(1, state.flashTimer / 1.0);
    const open = (1 - t) * (Math.PI * 0.95) + 0.05;
    ctx.fillStyle = "#ffd02b";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, open, Math.PI * 2 - open);
    ctx.closePath();
    ctx.fill();
  } else {
    const open = (Math.sin(p.mouth) + 1) * 0.35 + 0.05; // 0.05..0.75
    ctx.fillStyle = "#ffd02b";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, open, Math.PI * 2 - open);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawGhost(
  ctx: CanvasRenderingContext2D,
  g: Ghost,
  state: GameState,
  s: number,
) {
  const cx = g.x * s + s / 2;
  const cy = g.y * s + s / 2;
  const r = s * 0.45;
  let bodyColor = g.color;
  let eyeWhite = "#fff";
  let pupil = "#1a1a8a";

  if (g.mode === "frightened") {
    const flashing = state.frightenedTimer < 1800 && Math.floor(state.frightenedTimer / 200) % 2 === 0;
    bodyColor = flashing ? "#ffffff" : "#1f3bff";
    eyeWhite = "#ffd02b";
    pupil = "#ffd02b";
  } else if (g.mode === "eaten") {
    bodyColor = "transparent";
  }

  if (bodyColor !== "transparent") {
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(cx, cy - s * 0.05, r, Math.PI, 0);
    ctx.lineTo(cx + r, cy + r * 0.7);
    // wavy bottom
    const waves = 4;
    for (let i = 0; i < waves; i++) {
      const x1 = cx + r - ((i * 2 + 1) * r) / waves;
      const x2 = cx + r - ((i * 2 + 2) * r) / waves;
      ctx.lineTo(x1, cy + r * 0.4);
      ctx.lineTo(x2, cy + r * 0.7);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Eyes
  const v = DIR_VEC[g.dir];
  const eyeOffsetY = -s * 0.1;
  const eyeR = s * 0.13;
  const pupilR = s * 0.07;
  for (const ex of [-s * 0.16, s * 0.16]) {
    ctx.fillStyle = eyeWhite;
    ctx.beginPath();
    ctx.arc(cx + ex, cy + eyeOffsetY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = pupil;
    ctx.beginPath();
    ctx.arc(
      cx + ex + v.x * eyeR * 0.4,
      cy + eyeOffsetY + v.y * eyeR * 0.4,
      pupilR,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

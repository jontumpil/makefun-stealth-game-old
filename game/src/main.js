// Shadowstep — a top-down stealth game.
//
// Slip through the Lantern Manor at night: guards patrol with
// lanterns and vision cones, deep rugs swallow your outline, and
// the exit only opens once every relic is in your bag. Move with
// the arrow keys or WASD (or click to walk), hold Shift to hurry —
// hurry is loud — and stay out of the light.
'use strict';

const TILE = 40;
const COLS = 24;
const ROWS = 15;
const W = COLS * TILE;
const H = ROWS * TILE;

// # wall · . floor · , shadow rug (cover) · D exit door
// P player start · R relic on its pedestal
const LEVELS = [
  {
    name: 'I · The Front Hall',
    map: [
      '########################',
      '#P....#........#......D#',
      '#.....#........#.......#',
      '#..R..#...,,...#...#...#',
      '#.....#...,,...#...#...#',
      '#.....###.####.#...#...#',
      '#..............#...#...#',
      '####.#####.#####...#...#',
      '#........#.....#.......#',
      '#..,,....#..R..#...R...#',
      '#..,,....#.....#.......#',
      '#........#.....####.####',
      '#........#.............#',
      '#........#.............#',
      '########################',
    ],
    guards: [
      { path: [[8, 2], [14, 2], [14, 5], [8, 5]] },
      { path: [[20, 8], [20, 12], [17, 12], [17, 8]] },
    ],
  },
  {
    name: 'II · The Gallery',
    map: [
      '########################',
      '#P.....#.......#......D#',
      '#......#.......#.......#',
      '#..##..#...R...#..##...#',
      '#..##..#.......#..##...#',
      '#......###.#####.......#',
      '#..,,..................#',
      '#..,,....##..##....R...#',
      '#........##..##........#',
      '####.##########.########',
      '#..........,,..........#',
      '#..R.......,,......#...#',
      '#..............#...#...#',
      '#..............#...R...#',
      '########################',
    ],
    guards: [
      { path: [[6, 1], [6, 5], [11, 5], [11, 1]] },
      { path: [[13, 8], [20, 8], [20, 5], [13, 5]] },
      { path: [[3, 13], [10, 13], [10, 10], [3, 10]] },
    ],
  },
  {
    name: 'III · The Vault Wing',
    map: [
      '########################',
      '#P...#......#.........D#',
      '#....#......#....##....#',
      '#.R..#..,,..#....##..R.#',
      '#....#..,,..####.......#',
      '#....###.###....#......#',
      '#...............#..#...#',
      '##.#####.####...#..#...#',
      '#......#....#...####.###',
      '#..,,..#..R.#..........#',
      '#..,,..#....#....,,....#',
      '#......######....,,..R.#',
      '#......................#',
      '#..........##..........#',
      '########################',
    ],
    guards: [
      { path: [[7, 2], [11, 2], [11, 6], [7, 6]] },
      { path: [[19, 6], [19, 11], [15, 11], [15, 6]] },
      { path: [[3, 8], [3, 12], [9, 12], [9, 8]] },
      { path: [[20, 1], [20, 4], [17, 4], [17, 1]] },
    ],
  },
];

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');

const state = {
  mode: 'title', // title | play | caught | clear | win
  level: 0,
  grid: [],
  walls: new Set(),
  shadows: new Set(),
  relics: [],
  exit: { x: 0, y: 0 },
  player: { x: 0, y: 0, r: 11, dir: 0, moving: false, sprint: false, hidden: false, stepT: 0 },
  guards: [],
  meter: 0,
  seen: 0,
  time: 0,
  keys: {},
  clickTarget: null,
  heartT: 0,
  glimpseCool: 0,
  message: '',
};

const key = (cx, cy) => cx + ',' + cy;
const tileAt = (px, py) => state.grid[Math.floor(py / TILE)]?.[Math.floor(px / TILE)];

function loadLevel(i) {
  const def = LEVELS[i];
  state.level = i;
  state.grid = def.map.map((row) => row.split(''));
  state.walls = new Set();
  state.shadows = new Set();
  state.relics = [];
  def.map.forEach((row, y) => {
    row.split('').forEach((ch, x) => {
      if (ch === '#') state.walls.add(key(x, y));
      if (ch === ',') state.shadows.add(key(x, y));
      if (ch === 'R') state.relics.push({ x: x * TILE + 20, y: y * TILE + 20, taken: false });
      if (ch === 'D') state.exit = { x: x * TILE + 20, y: y * TILE + 20 };
      if (ch === 'P') {
        state.player.x = x * TILE + 20;
        state.player.y = y * TILE + 20;
      }
    });
  });
  state.guards = def.guards.map((g) => ({
    pts: g.path.map(([x, y]) => ({ x: x * TILE + 20, y: y * TILE + 20 })),
    i: 0,
    x: g.path[0][0] * TILE + 20,
    y: g.path[0][1] * TILE + 20,
    dir: Math.PI / 2,
    wait: 0,
    mode: 'patrol',
    tx: 0,
    ty: 0,
    lookT: 0,
  }));
  state.meter = 0;
  state.clickTarget = null;
}

function isWallPx(px, py) {
  return state.walls.has(key(Math.floor(px / TILE), Math.floor(py / TILE)));
}

// Segment vs the wall grid, sampled finely — good enough for
// sight lines and cone edges at this tile size.
function lineBlocked(x0, y0, x1, y1) {
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / 6));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (isWallPx(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return true;
  }
  return false;
}

function moveCircle(e, dx, dy) {
  const r = e.r;
  if (!isWallPx(e.x + dx + Math.sign(dx) * r, e.y) &&
      !isWallPx(e.x + dx + Math.sign(dx) * r, e.y - r + 4) &&
      !isWallPx(e.x + dx + Math.sign(dx) * r, e.y + r - 4)) e.x += dx;
  if (!isWallPx(e.x, e.y + dy + Math.sign(dy) * r) &&
      !isWallPx(e.x - r + 4, e.y + dy + Math.sign(dy) * r) &&
      !isWallPx(e.x + r - 4, e.y + dy + Math.sign(dy) * r)) e.y += dy;
}

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

const GUARD_SPEED = 52;
const GUARD_RANGE = 138;
const GUARD_HALF = 0.62; // ~35 degrees each side

function updateGuard(g, dt) {
  let target = null;
  if (g.mode === 'patrol') target = g.pts[g.i];
  else if (g.mode === 'investigate' || g.mode === 'return') target = { x: g.tx, y: g.ty };

  if (g.wait > 0) {
    g.wait -= dt;
    // While paused at a waypoint, slowly sweep the lantern.
    g.dir += Math.sin(state.time * 1.4 + g.pts[0].x) * 0.35 * dt;
    return;
  }
  if (!target) return;
  const dx = target.x - g.x;
  const dy = target.y - g.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) {
    if (g.mode === 'patrol') {
      g.i = (g.i + 1) % g.pts.length;
      g.wait = 1.1;
    } else if (g.mode === 'investigate') {
      g.mode = 'look';
      g.lookT = 1.6;
    } else if (g.mode === 'return') {
      g.mode = 'patrol';
    }
    return;
  }
  if (g.mode === 'look') {
    g.lookT -= dt;
    g.dir += 0.9 * dt;
    if (g.lookT <= 0) {
      // Head back to the nearest patrol point.
      let best = g.pts[0];
      let bd = 1e9;
      for (const p of g.pts) {
        const d = Math.hypot(p.x - g.x, p.y - g.y);
        if (d < bd) { bd = d; best = p; }
      }
      g.mode = 'return';
      g.tx = best.x;
      g.ty = best.y;
    }
    return;
  }
  const want = Math.atan2(dy, dx);
  g.dir = angleLerp(g.dir, want, Math.min(1, dt * 6));
  const step = Math.min(dist, GUARD_SPEED * (g.mode === 'patrol' ? 1 : 1.35) * dt);
  g.x += Math.cos(g.dir) * step;
  g.y += Math.sin(g.dir) * step;
}

// Can this guard see the player right now?
function guardSees(g) {
  const p = state.player;
  const dx = p.x - g.x;
  const dy = p.y - g.y;
  const dist = Math.hypot(dx, dy);
  if (dist > GUARD_RANGE) return 0;
  if (p.hidden && dist > 36) return 0; // deep in the rug's shadow
  let d = Math.atan2(dy, dx) - g.dir;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) > GUARD_HALF) return 0;
  if (lineBlocked(g.x, g.y, p.x, p.y)) return 0;
  // Closer and sprinting reads stronger; edges of the cone weaker.
  const edge = 1 - Math.abs(d) / GUARD_HALF;
  const near = 1.15 - dist / GUARD_RANGE;
  return Math.max(0.05, edge * near) * (p.sprint ? 1.45 : 1);
}

function update(dt) {
  state.time += dt;
  const p = state.player;
  if (state.mode !== 'play') return;

  // --- player movement: keys, or a click target
  let mx = 0;
  let my = 0;
  if (state.keys.ArrowLeft || state.keys.a) mx -= 1;
  if (state.keys.ArrowRight || state.keys.d) mx += 1;
  if (state.keys.ArrowUp || state.keys.w) my -= 1;
  if (state.keys.ArrowDown || state.keys.s) my += 1;
  if (mx || my) state.clickTarget = null;
  if (!mx && !my && state.clickTarget) {
    const dx = state.clickTarget.x - p.x;
    const dy = state.clickTarget.y - p.y;
    if (Math.hypot(dx, dy) < 6) state.clickTarget = null;
    else { mx = dx; my = dy; }
  }
  p.sprint = !!(state.keys.Shift || state.keys.ShiftKey);
  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  if (p.moving) {
    const speed = p.sprint ? 168 : 104;
    moveCircle(p, (mx / len) * speed * dt, 0);
    moveCircle(p, 0, (my / len) * speed * dt);
    p.dir = Math.atan2(my, mx);
    p.stepT -= dt;
    if (p.stepT <= 0) {
      p.stepT = p.sprint ? 0.24 : 0.34;
      if (!SHOT) ShadowAudio.step();
    }
    // Sprinting is loud: a nearby guard comes to look.
    if (p.sprint) {
      for (const g of state.guards) {
        if (Math.hypot(g.x - p.x, g.y - p.y) < 96 && g.mode === 'patrol') {
          g.mode = 'investigate';
          g.tx = p.x;
          g.ty = p.y;
          g.wait = 0;
        }
      }
    }
  }
  p.hidden = state.shadows.has(key(Math.floor(p.x / TILE), Math.floor(p.y / TILE)));

  // --- guards and the alarm meter
  let sight = 0;
  for (const g of state.guards) {
    updateGuard(g, dt);
    sight = Math.max(sight, guardSees(g));
  }
  if (sight > 0) {
    const before = state.meter;
    state.meter = Math.min(1, state.meter + sight * dt * 1.15);
    if (before < 0.25 && state.meter >= 0.25) {
      state.seen += 1;
      if (!SHOT) ShadowAudio.glimpse();
    }
    if (state.meter >= 1) {
      state.mode = 'caught';
      if (!SHOT) ShadowAudio.caught();
    }
  } else {
    state.meter = Math.max(0, state.meter - dt * 0.45);
  }
  if (state.meter > 0.5 && !SHOT) {
    state.heartT -= dt;
    if (state.heartT <= 0) {
      state.heartT = 0.75;
      ShadowAudio.heartbeat();
    }
  }

  // --- relics and the exit
  for (const r of state.relics) {
    if (!r.taken && Math.hypot(r.x - p.x, r.y - p.y) < 24) {
      r.taken = true;
      if (!SHOT) ShadowAudio.pickup();
    }
  }
  const allTaken = state.relics.every((r) => r.taken);
  if (allTaken && Math.hypot(state.exit.x - p.x, state.exit.y - p.y) < 24) {
    if (state.level === LEVELS.length - 1) {
      state.mode = 'win';
      if (!SHOT) ShadowAudio.win();
    } else {
      state.mode = 'clear';
      if (!SHOT) ShadowAudio.door();
    }
  }
}

// ---------- rendering ----------

function conePolygon(g) {
  const rays = 26;
  const pts = [[g.x, g.y]];
  for (let i = 0; i <= rays; i++) {
    const a = g.dir - GUARD_HALF + (2 * GUARD_HALF * i) / rays;
    let d = GUARD_RANGE;
    const steps = 22;
    for (let s = 1; s <= steps; s++) {
      const t = (s / steps) * GUARD_RANGE;
      if (isWallPx(g.x + Math.cos(a) * t, g.y + Math.sin(a) * t)) { d = t; break; }
    }
    pts.push([g.x + Math.cos(a) * d, g.y + Math.sin(a) * d]);
  }
  return pts;
}

function drawManor() {
  // floor: warm boards
  ctx.fillStyle = '#241a12';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  for (let y = 0; y < ROWS; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * TILE + 0.5);
    ctx.lineTo(W, y * TILE + 0.5);
    ctx.stroke();
  }
  // shadow rugs: deep indigo with a fringe border — standing here hides you
  for (const k of state.shadows) {
    const [x, y] = k.split(',').map(Number);
    ctx.fillStyle = '#1b1e3d';
    ctx.fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
    ctx.strokeStyle = '#3a3f7a';
    ctx.strokeRect(x * TILE + 5.5, y * TILE + 5.5, TILE - 11, TILE - 11);
  }
  // exit door
  const e = state.exit;
  const open = state.relics.every((r) => r.taken);
  ctx.fillStyle = open ? '#1d5c38' : '#3d2b16';
  ctx.fillRect(e.x - 17, e.y - 19, 34, 38);
  ctx.strokeStyle = open ? '#4ade80' : '#8a6a35';
  ctx.lineWidth = 2;
  ctx.strokeRect(e.x - 17, e.y - 19, 34, 38);
  ctx.beginPath();
  ctx.moveTo(e.x, e.y - 19);
  ctx.lineTo(e.x, e.y + 19);
  ctx.stroke();
  ctx.fillStyle = open ? '#bbf7d0' : '#a8895a';
  ctx.font = 'bold 8px Georgia';
  ctx.textAlign = 'center';
  ctx.fillText('EXIT', e.x, e.y - 24);
  // relic pedestals
  for (const r of state.relics) {
    ctx.fillStyle = '#17120c';
    ctx.beginPath();
    ctx.ellipse(r.x, r.y + 10, 13, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    if (r.taken) continue;
    const bob = Math.sin(state.time * 2.2 + r.x) * 2;
    const glow = ctx.createRadialGradient(r.x, r.y + bob, 2, r.x, r.y + bob, 22);
    glow.addColorStop(0, 'rgba(250, 204, 21, 0.5)');
    glow.addColorStop(1, 'rgba(250, 204, 21, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(r.x - 22, r.y + bob - 22, 44, 44);
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); // a little chalice
    ctx.moveTo(r.x - 6, r.y - 8 + bob);
    ctx.lineTo(r.x + 6, r.y - 8 + bob);
    ctx.lineTo(r.x + 4, r.y + 1 + bob);
    ctx.lineTo(r.x - 4, r.y + 1 + bob);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(r.x - 1, r.y + 1 + bob, 2, 5);
    ctx.fillRect(r.x - 5, r.y + 6 + bob, 10, 2);
  }
  // walls: dark stone with a lit top edge
  for (const k of state.walls) {
    const [x, y] = k.split(',').map(Number);
    ctx.fillStyle = '#2e2a3f';
    ctx.fillRect(x * TILE, y * TILE, TILE, TILE);
    ctx.fillStyle = '#454064';
    ctx.fillRect(x * TILE, y * TILE, TILE, 5);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x * TILE, y * TILE + TILE - 4, TILE, 4);
  }
}

function drawFigure(x, y, dir, cloak, trim, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  // cloak: a soft triangle trailing behind the facing direction
  ctx.rotate(dir);
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-11, -8);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-11, 8);
  ctx.closePath();
  ctx.fill();
  ctx.rotate(-dir);
  // hood / helmet
  ctx.fillStyle = trim;
  ctx.beginPath();
  ctx.arc(0, 0, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = cloak;
  ctx.beginPath();
  ctx.arc(0, 0, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawManor();

  // vision cones under the figures
  for (const g of state.guards) {
    const pts = conePolygon(g);
    const grad = ctx.createRadialGradient(g.x, g.y, 8, g.x, g.y, GUARD_RANGE);
    const alert = state.meter > 0.25;
    grad.addColorStop(0, alert ? 'rgba(248, 113, 113, 0.5)' : 'rgba(251, 191, 36, 0.42)');
    grad.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
  }

  // the thief — translucent while hidden in a rug's shadow
  const p = state.player;
  drawFigure(p.x, p.y, p.dir, '#3b4a6b', '#93c5fd', p.hidden ? 0.45 : 1);
  if (p.hidden) {
    ctx.fillStyle = '#bfdbfe';
    ctx.font = '10px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('hidden', p.x, p.y - 18);
  }

  // guards, with a lantern dot and a mood mark
  for (const g of state.guards) {
    drawFigure(g.x, g.y, g.dir, '#6d1f1f', '#fca5a5');
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(g.x + Math.cos(g.dir) * 13, g.y + Math.sin(g.dir) * 13, 3, 0, Math.PI * 2);
    ctx.fill();
    const sees = guardSees(g) > 0;
    ctx.font = 'bold 15px Georgia';
    ctx.textAlign = 'center';
    if (state.meter >= 0.85) {
      ctx.fillStyle = '#ef4444';
      ctx.fillText('!', g.x, g.y - 16);
    } else if (sees || g.mode === 'investigate' || g.mode === 'look') {
      ctx.fillStyle = '#fbbf24';
      ctx.fillText('?', g.x, g.y - 16);
    }
  }

  drawHud();
  if (state.mode === 'title') drawTitle();
  if (state.mode === 'caught') drawCaught();
  if (state.mode === 'clear') drawClear();
  if (state.mode === 'win') drawWin();
}

function drawHud() {
  ctx.fillStyle = 'rgba(5, 5, 16, 0.82)';
  ctx.fillRect(0, 0, W, 34);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = '15px Georgia';
  ctx.textAlign = 'left';
  ctx.fillText(LEVELS[state.level].name, 14, 22);
  // relics pips
  const got = state.relics.filter((r) => r.taken).length;
  ctx.fillStyle = '#facc15';
  ctx.font = '14px Georgia';
  ctx.fillText('Relics ' + got + ' / ' + state.relics.length, 300, 22);
  // the eye: alarm meter
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('Eye', 520, 22);
  ctx.strokeStyle = '#64748b';
  ctx.strokeRect(556.5, 10.5, 150, 12);
  ctx.fillStyle = state.meter > 0.7 ? '#ef4444' : state.meter > 0.3 ? '#f59e0b' : '#38bdf8';
  ctx.fillRect(557, 11, 149 * state.meter, 11);
  // timer
  const t = Math.floor(state.time);
  ctx.fillStyle = '#e2e8f0';
  ctx.textAlign = 'right';
  ctx.fillText(String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'), W - 14, 22);
  ctx.textAlign = 'left';
}

function veil(alpha) {
  ctx.fillStyle = `rgba(4, 4, 12, ${alpha})`;
  ctx.fillRect(0, 0, W, H);
}

function bigText(lines, y0, gap) {
  lines.forEach(([text, font, color], i) => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, W / 2, y0 + i * gap);
  });
  ctx.textAlign = 'left';
}

function drawTitle() {
  veil(0.55);
  bigText([
    ['S H A D O W S T E P', 'bold 54px Georgia', '#e0e7ff'],
    ['Slip through the Lantern Manor. Take every relic. Reach the exit unseen.', '18px Georgia', '#cbd5e1'],
    ['Guards see by lantern light — their cones are marked in amber.', '16px Georgia', '#94a3b8'],
    ['Deep indigo rugs are shadow: stand on one and you are hidden.', '16px Georgia', '#94a3b8'],
    ['Arrows / WASD or click to move · Shift hurries, and hurry is loud', '16px Georgia', '#94a3b8'],
    ['Press Enter to begin', 'bold 19px Georgia', '#facc15'],
  ], 190, 40);
}

function drawCaught() {
  veil(0.6);
  bigText([
    ['CAUGHT IN THE LIGHT', 'bold 44px Georgia', '#f87171'],
    ['The lanterns swing toward you, and the manor wakes.', '18px Georgia', '#e2e8f0'],
    ['Press Enter to try the wing again', 'bold 18px Georgia', '#facc15'],
  ], 240, 44);
}

function drawClear() {
  veil(0.55);
  bigText([
    ['WING CLEARED', 'bold 42px Georgia', '#4ade80'],
    ['The door sighs shut behind you. Deeper wings wait.', '18px Georgia', '#e2e8f0'],
    ['Press Enter for the next wing', 'bold 18px Georgia', '#facc15'],
  ], 240, 44);
}

function drawWin() {
  veil(0.6);
  const t = Math.floor(state.time);
  bigText([
    ['THE MANOR SLEEPS ON', 'bold 44px Georgia', '#facc15'],
    ['Every relic is in your bag, and no bell ever rang for you.', '18px Georgia', '#e2e8f0'],
    [`Time ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')} · Glimpsed ${state.seen} time${state.seen === 1 ? '' : 's'}`, '17px Georgia', '#cbd5e1'],
    ['Press Enter to walk the manor again', 'bold 18px Georgia', '#4ade80'],
  ], 225, 44);
}

// ---------- input & boot ----------

addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  state.keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = true;
  if (e.key === 'Shift') state.keys.Shift = true;
  ShadowAudio.ensure();
  if (e.key === 'Enter') {
    if (state.mode === 'title') { state.mode = 'play'; state.time = 0; }
    else if (state.mode === 'caught') { loadLevel(state.level); state.mode = 'play'; }
    else if (state.mode === 'clear') { loadLevel(state.level + 1); state.mode = 'play'; }
    else if (state.mode === 'win') { loadLevel(0); state.seen = 0; state.time = 0; state.mode = 'play'; }
  }
});
addEventListener('keyup', (e) => {
  state.keys[e.key.length === 1 ? e.key.toLowerCase() : e.key] = false;
  if (e.key === 'Shift') state.keys.Shift = false;
});
canvas.addEventListener('click', (e) => {
  ShadowAudio.ensure();
  const rect = canvas.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * W;
  const y = ((e.clientY - rect.top) / rect.height) * H;
  if (state.mode === 'play') state.clickTarget = { x, y };
});

loadLevel(0);

if (SHOT === 'start') {
  state.mode = 'title';
  draw();
} else if (SHOT === 'play') {
  // A frozen mid-infiltration frame: one relic already lifted, the
  // thief edging along a rug while a guard's cone sweeps past.
  state.mode = 'play';
  state.time = 83;
  state.relics[0].taken = true;
  state.player.x = 9 * TILE + 20;
  state.player.y = 9 * TILE + 26;
  state.player.dir = 0.4;
  state.player.hidden = true;
  state.guards[0].x = 12 * TILE + 10;
  state.guards[0].y = 3 * TILE + 30;
  state.guards[0].dir = 2.4;
  state.meter = 0.42;
  draw();
} else if (SHOT === 'end') {
  state.mode = 'win';
  state.time = 214;
  state.seen = 3;
  for (const r of state.relics) r.taken = true;
  draw();
} else {
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

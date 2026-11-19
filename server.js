require('dotenv').config();
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { Worker } = require('worker_threads');
const { OAuth2Client } = require('google-auth-library');
const ranks = require('./rank');
const profiles = require('./profile');

// 큰 퍼즐(12×12)은 생성에 1초 이상 걸릴 수 있어 별도 스레드에서 만든다
function generatePuzzleAsync(size) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'puzzle.js'), { workerData: { size } });
    worker.once('message', resolve);
    worker.once('error', reject);
  });
}

const PORT = Number(process.env.PORT) || 3000;
const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const ALLOW_GUEST = !GOOGLE_CLIENT_ID || String(process.env.ALLOW_GUEST).toLowerCase() === 'true';
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const TOKEN_TTL = 1000 * 60 * 60 * 24 * 30;

const MAX_PLAYERS = 4;
const MAX_LIVES = 3;
const SIZES = [6, 7, 8, 9, 12];
const MODES = ['classic', 'item'];
const BLIND_MS = 5000;
const CHAT_KEEP = 60;
const ROOM_IDLE_MS = 1000 * 60 * 30;

// 보드 칸 값
const EMPTY = 0, MARK = 1, HAM = 2, GOLD = 3, HINT = 4;
const isHam = (v) => v >= HAM;

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// ---------- 로그인 토큰 (HMAC 서명) ----------
function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}
function signToken(user) {
  const body = b64url(JSON.stringify({ ...user, exp: Date.now() + TOKEN_TTL }));
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (data.exp < Date.now()) return null;
    return { id: data.id, name: data.name, picture: data.picture || '' };
  } catch {
    return null;
  }
}
function cleanName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 16);
}

// ---------- HTTP ----------
const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/config', (req, res) => {
  res.json({ googleClientId: GOOGLE_CLIENT_ID, allowGuest: ALLOW_GUEST });
});

app.post('/api/auth/google', async (req, res) => {
  if (!googleClient) return res.status(400).json({ error: '구글 로그인이 설정되지 않았어요.' });
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: req.body.credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const p = ticket.getPayload();
    const user = { id: `g:${p.sub}`, name: cleanName(p.given_name || p.name || '햄찌'), picture: p.picture || '' };
    res.json({ token: signToken(user), user });
  } catch (err) {
    console.error('google verify failed', err.message);
    res.status(401).json({ error: '구글 로그인 확인에 실패했어요.' });
  }
});

app.post('/api/auth/guest', (req, res) => {
  if (!ALLOW_GUEST) return res.status(403).json({ error: '게스트 입장이 꺼져 있어요.' });
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: '닉네임을 입력해 주세요.' });
  const user = { id: `guest:${crypto.randomUUID()}`, name, picture: '' };
  res.json({ token: signToken(user), user });
});

// 초대 링크 /r/ABCDEF 는 같은 SPA로 응답
app.get('/r/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true } });

// ---------- 방 ----------
/** @type {Map<string, any>} */
const rooms = new Map();
const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newRoomId() {
  let id;
  do {
    id = Array.from({ length: 6 }, () => ROOM_CHARS[crypto.randomInt(ROOM_CHARS.length)]).join('');
  } while (rooms.has(id));
  return id;
}

function defaultGolden(size) {
  return size >= 12 ? 3 : 2;
}

function pick(arr) {
  return arr[crypto.randomInt(arr.length)];
}

function createPlayer(user) {
  return {
    id: user.id,
    name: user.name,
    picture: user.picture,
    sockets: new Set(),
    board: [],
    lives: MAX_LIVES,
    found: 0,
    mistakes: 0,
    status: 'waiting', // waiting | playing | done | out | survived(혼자 남아 판이 끝남)
    finishMs: null,
    finishRank: null,
    outAt: null,
    late: false, // 판 도중에 들어와서 랭크에 반영하지 않음
    blindUntil: 0,
    placement: null,
    lpDelta: null,
    promo: null,
    coinsEarned: 0,
    wins: 0,
  };
}

function resetPlayerForRound(player, n) {
  player.board = new Array(n * n).fill(EMPTY);
  player.lives = MAX_LIVES;
  player.found = 0;
  player.mistakes = 0;
  player.status = 'playing';
  player.finishMs = null;
  player.finishRank = null;
  player.outAt = null;
  player.late = false;
  player.blindUntil = 0;
  player.placement = null;
  player.lpDelta = null;
  player.promo = null;
  player.coinsEarned = 0;
}

// 다 찾으면 남은 해바라기씨가 코인이 된다. 다 찾은 사람만 받는다
// (탈락·포기, 혼자 남아서 판이 끝난 사람은 등수 보너스도 없음)
function giveCoins(player, amount) {
  if (!amount || player.status !== 'done') return;
  player.coinsEarned += amount;
  profiles.addCoins(player.id, amount);
  sendProfile(player);
}

function sendProfile(player) {
  const data = profiles.get(player.id);
  for (const sid of player.sockets) io.to(sid).emit('profile:update', data);
}

function rankBadge(id) {
  const r = ranks.info(id);
  return { key: r.key, label: r.label, fullName: r.fullName, color: r.color, lp: r.lp, tier: r.tier };
}

function publicRoom(room) {
  return {
    id: room.id,
    hostId: room.hostId,
    state: room.state,
    size: room.size,
    mode: room.mode,
    spoiler: room.spoiler,
    round: room.round,
    roundMode: room.roundMode,
    goldenCount: room.golden.size,
    goldenSetting: room.goldenSetting,
    ranked: room.ranked,
    startedAt: room.startedAt,
    now: Date.now(),
    regions: room.puzzle ? room.puzzle.regions : null,
    maxLives: MAX_LIVES,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      picture: p.picture,
      online: p.sockets.size > 0,
      board: p.board.join(''),
      lives: p.lives,
      found: p.found,
      mistakes: p.mistakes,
      status: p.status,
      finishMs: p.finishMs,
      finishRank: p.finishRank,
      late: p.late,
      blindUntil: p.blindUntil,
      placement: p.placement,
      lpDelta: p.lpDelta,
      promo: p.promo,
      coinsEarned: p.coinsEarned,
      wins: p.wins,
      rank: rankBadge(p.id),
      avatar: profiles.equipped(p.id),
    })),
  };
}

function broadcast(room) {
  room.touchedAt = Date.now();
  io.to(room.id).emit('room:state', publicRoom(room));
}

function pushChat(room, msg) {
  msg.id = ++room.chatSeq;
  msg.at = Date.now();
  room.chat.push(msg);
  if (room.chat.length > CHAT_KEEP) room.chat.shift();
  io.to(room.id).emit('chat:message', msg);
}
function sysChat(room, text) {
  pushChat(room, { type: 'system', text });
}

function ensureHost(room) {
  const host = room.players.get(room.hostId);
  if (host && host.sockets.size > 0) return;
  const next = [...room.players.values()].find((p) => p.sockets.size > 0);
  if (next) room.hostId = next.id;
}

function removePlayer(room, player) {
  room.players.delete(player.id);
  sysChat(room, `${player.name}님이 나갔어요.`);
  ensureHost(room);
}

function checkRoundEnd(room) {
  if (room.state !== 'playing') return;
  const alive = [...room.players.values()].filter((p) => p.status === 'playing');
  // 접속이 끊긴 사람은 기다리지 않는다
  if (!alive.some((p) => p.sockets.size > 0)) return finishRound(room);
  // 여럿이 시작했는데 한 명만 남으면 기다리지 않고 바로 등수 확정
  if (room.roundSize >= 2 && alive.length === 1) finishRound(room, alive[0]);
}

function finishRound(room, lastOne = null) {
  room.state = 'ended';
  const now = Date.now();
  for (const p of room.players.values()) {
    if (p.status === 'playing') {
      // 끝까지 남아 있던 사람은 생존, 나가버린 사람은 탈락
      p.status = p.sockets.size > 0 ? 'survived' : 'out';
      p.outAt = now;
    }
    p.blindUntil = 0;
  }
  // 등수: 완료한 순서 → 생존 → 탈락 (같은 그룹 안에서는 많이 찾은 순 → 늦게 탈락한 순)
  const group = (p) => (p.finishRank ? 0 : p.status === 'survived' ? 1 : 2);
  const parts = [...room.players.values()].filter((p) => p.status !== 'waiting' && !p.late);
  parts.sort(
    (a, b) =>
      group(a) - group(b) ||
      (a.finishRank || 0) - (b.finishRank || 0) ||
      b.found - a.found ||
      (b.outAt || 0) - (a.outAt || 0),
  );
  parts.forEach((p, i) => (p.placement = i + 1));
  const top = parts[0];
  const winner = top && (top.finishRank === 1 || top.status === 'survived') ? top : null;
  if (winner) winner.wins += 1;
  if (lastOne) sysChat(room, `⏱ ${lastOne.name}님 혼자 남아서 바로 등수가 정해졌어요!`);

  room.ranked = parts.length >= 2;
  if (room.ranked) {
    const changes = ranks.applyRound(
      parts.map((p) => ({
        id: p.id,
        name: p.name,
        picture: p.picture,
        placement: p.placement,
        perfect: p.status === 'done' && p.mistakes === 0,
      })),
      room.size,
    );
    for (const p of parts) {
      p.lpDelta = changes[p.id].delta;
      p.promo = changes[p.id].promo;
      if (p.promo === 'up') sysChat(room, `🎉 ${p.name}님이 ${changes[p.id].after.fullName}(으)로 승급했어요!`);
    }
    // 랭크 게임 보너스 코인: 1등 +2, 3명 이상이면 2등 +1 (다 찾은 사람만, giveCoins에서 걸러짐)
    if (winner) giveCoins(winner, 2);
    if (parts.length >= 3 && parts[1]) giveCoins(parts[1], 1);
  }
  sysChat(room, winner ? `🏁 ${room.round}판 종료! 우승은 ${winner.name}님 🥇` : `🏁 ${room.round}판 종료! 아무도 다 찾지 못했어요`);
  io.to(room.id).emit('round:ended', { winnerId: winner ? winner.id : null, lastOneId: lastOne ? lastOne.id : null });
}

// 찾은 햄스터 주변/같은 행·열·색을 자동으로 X 처리
function autoMark(room, player, idx) {
  const n = room.size;
  const r0 = Math.floor(idx / n), c0 = idx % n;
  const reg = room.puzzle.regions[idx];
  for (let i = 0; i < n * n; i++) {
    if (player.board[i] !== EMPTY) continue;
    const r = Math.floor(i / n), c = i % n;
    const near = Math.abs(r - r0) <= 1 && Math.abs(c - c0) <= 1;
    if (near || r === r0 || c === c0 || room.puzzle.regions[i] === reg) player.board[i] = MARK;
  }
}

function placeHamster(room, player, idx, value, autoX) {
  player.board[idx] = value;
  player.found += 1;
  if (autoX) autoMark(room, player, idx);
  if (player.found === room.size) {
    player.status = 'done';
    player.finishMs = Date.now() - room.startedAt;
    room.finishedCount += 1;
    player.finishRank = room.finishedCount;
    player.blindUntil = 0;
    giveCoins(player, player.lives);
    sysChat(room, `${['🥇', '🥈', '🥉', '🎖️'][player.finishRank - 1] || '🎖️'} ${player.name}님이 ${player.finishRank}등으로 다 찾았어요!`);
  }
}

// 황금 햄스터 아이템: 다른 사람 판 위에서 햄스터 댄스(일부 가리기) / 햄스터 하나 알려주기
function useItem(room, player, autoX) {
  const now = Date.now();
  const n = room.size;
  const targets = [...room.players.values()].filter(
    (p) => p !== player && p.status === 'playing' && p.sockets.size > 0 && p.blindUntil <= now,
  );
  const hidden = [];
  if (player.status === 'playing') {
    for (let r = 0; r < n; r++) {
      const idx = r * n + room.puzzle.solution[r];
      if (!isHam(player.board[idx])) hidden.push(idx);
    }
  }
  const kinds = [];
  if (targets.length) kinds.push('blind');
  if (hidden.length) kinds.push('reveal');
  if (!kinds.length) return null;
  const kind = pick(kinds);

  if (kind === 'blind') {
    const target = pick(targets);
    target.blindUntil = now + BLIND_MS;
    sysChat(room, `✨ ${player.name}님이 황금 햄스터를 찾아 ${target.name}님의 판 위에서 햄스터들이 5초간 춤을 춰요! 💃`);
    return { kind, targetId: target.id, targetName: target.name, until: target.blindUntil };
  }
  // 황금이 아닌 햄스터를 먼저 알려준다 (연쇄 발동 방지)
  const plain = hidden.filter((i) => !room.golden.has(i));
  const idx = pick(plain.length ? plain : hidden);
  placeHamster(room, player, idx, HINT, autoX);
  sysChat(room, `✨ ${player.name}님이 황금 햄스터를 찾아 햄스터 한 마리 위치를 알아냈어요! 💡`);
  return { kind, index: idx };
}

function getRoomOf(socket) {
  const roomId = socket.data.roomId;
  const room = roomId && rooms.get(roomId);
  if (!room) return {};
  return { room, player: room.players.get(socket.data.user.id) };
}

// 햄스터 댄스 중에도 안 가려진 칸은 조작할 수 있다 (가려진 칸은 화면에서 눌리지 않음)
function canAct(room, player) {
  return room && player && room.state === 'playing' && player.status === 'playing';
}

io.use((socket, next) => {
  const user = verifyToken(socket.handshake.auth && socket.handshake.auth.token);
  if (!user) return next(new Error('unauthorized'));
  socket.data.user = user;
  socket.data.chatTimes = [];
  next();
});

io.on('connection', (socket) => {
  const user = socket.data.user;

  function leaveCurrent() {
    const { room, player } = getRoomOf(socket);
    if (!room) return;
    socket.leave(room.id);
    socket.data.roomId = null;
    if (!player) return;
    player.sockets.delete(socket.id);
    // 대기실에서는 나가면 자리 비움, 게임 중이면 기록 유지(재접속 가능)
    if (player.sockets.size === 0 && room.state !== 'playing') removePlayer(room, player);
    ensureHost(room);
    broadcast(room);
    if (player.sockets.size === 0 && room.state === 'playing') {
      setTimeout(() => {
        checkRoundEnd(room);
        broadcast(room);
      }, 20000);
    }
  }

  socket.on('room:create', (_, ack) => {
    leaveCurrent();
    const room = {
      id: newRoomId(),
      hostId: user.id,
      state: 'lobby', // lobby | playing | ended
      size: 8,
      mode: 'classic', // 다음 판 설정
      goldenSetting: defaultGolden(8), // 아이템전 황금 햄스터 수 (1 ~ 판 크기)
      goldenAuto: true, // 방장이 직접 정하기 전까지는 판 크기에 맞춰 기본값
      roundSize: 0, // 이번 판을 시작한 인원
      roundMode: 'classic', // 현재/지난 판 모드
      spoiler: 'open', // open | blur
      round: 0,
      puzzle: null,
      golden: new Set(),
      ranked: false,
      generating: false,
      startedAt: null,
      finishedCount: 0,
      players: new Map(),
      chat: [],
      chatSeq: 0,
      touchedAt: Date.now(),
    };
    rooms.set(room.id, room);
    if (typeof ack === 'function') ack({ ok: true, roomId: room.id });
  });

  socket.on('room:join', ({ roomId } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const id = String(roomId || '').toUpperCase();
    const room = rooms.get(id);
    if (!room) return reply({ ok: false, error: '방을 찾을 수 없어요. 링크를 다시 확인해 주세요.' });
    if (socket.data.roomId && socket.data.roomId !== id) leaveCurrent();

    let player = room.players.get(user.id);
    if (!player) {
      if (room.players.size >= MAX_PLAYERS) return reply({ ok: false, error: `방이 가득 찼어요 (최대 ${MAX_PLAYERS}명).` });
      player = createPlayer(user);
      room.players.set(user.id, player);
      if (room.state === 'playing') {
        resetPlayerForRound(player, room.size);
        player.late = true;
      }
      sysChat(room, `${user.name}님이 들어왔어요.`);
    }
    player.name = user.name;
    player.picture = user.picture;
    player.sockets.add(socket.id);
    socket.data.roomId = id;
    socket.join(id);
    ensureHost(room);
    reply({ ok: true, room: publicRoom(room), chat: room.chat });
    broadcast(room);
  });

  socket.on('room:leave', () => leaveCurrent());

  socket.on('room:settings', ({ size, spoiler, mode, golden } = {}) => {
    const { room } = getRoomOf(socket);
    if (!room || room.hostId !== user.id || room.state === 'playing') return;
    if (SIZES.includes(size)) {
      room.size = size;
      room.goldenSetting = room.goldenAuto ? defaultGolden(size) : Math.min(room.goldenSetting, size);
    }
    if (Number.isInteger(golden) && golden >= 1 && golden <= room.size) {
      room.goldenSetting = golden;
      room.goldenAuto = false;
    }
    if (spoiler === 'open' || spoiler === 'blur') room.spoiler = spoiler;
    if (MODES.includes(mode)) room.mode = mode;
    broadcast(room);
  });

  socket.on('game:start', async (_, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const { room } = getRoomOf(socket);
    if (!room) return reply({ ok: false });
    if (room.hostId !== user.id) return reply({ ok: false, error: '방장만 시작할 수 있어요.' });
    if (room.state === 'playing') return reply({ ok: false, error: '이미 진행 중이에요.' });
    if (room.generating) return reply({ ok: false, error: '퍼즐을 만드는 중이에요.' });
    room.generating = true;
    let puzzle;
    try {
      puzzle = await generatePuzzleAsync(room.size);
    } catch (err) {
      console.error('puzzle generation failed', err);
      return reply({ ok: false, error: '퍼즐을 만들지 못했어요. 다시 시도해 주세요.' });
    } finally {
      room.generating = false;
    }
    if (!rooms.has(room.id) || room.state === 'playing') return reply({ ok: false });
    // 오프라인 플레이어는 정리
    for (const p of [...room.players.values()]) if (p.sockets.size === 0) room.players.delete(p.id);
    const n = puzzle.size;
    room.puzzle = puzzle;
    room.state = 'playing';
    room.round += 1;
    room.roundMode = room.mode;
    room.ranked = false;
    room.golden = new Set();
    if (room.mode === 'item') {
      const rows = [...Array(n).keys()];
      for (let i = rows.length - 1; i > 0; i--) {
        const j = crypto.randomInt(i + 1);
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }
      for (const r of rows.slice(0, Math.min(room.goldenSetting, n))) room.golden.add(r * n + puzzle.solution[r]);
    }
    room.startedAt = Date.now();
    room.finishedCount = 0;
    for (const p of room.players.values()) resetPlayerForRound(p, n);
    room.roundSize = room.players.size;
    reply({ ok: true });
    const modeName = room.mode === 'item' ? `아이템전 (황금 햄스터 ${room.golden.size}마리)` : '클래식전';
    sysChat(room, `🐹 ${room.round}판 시작! ${n}×${n} · ${modeName}`);
    io.to(room.id).emit('round:started', { round: room.round });
    broadcast(room);
  });

  // X 표시 / 지우기: cells = [index...], value = 0 | 1
  socket.on('cell:set', ({ cells, value } = {}) => {
    const { room, player } = getRoomOf(socket);
    if (!canAct(room, player)) return;
    if (!Array.isArray(cells) || (value !== EMPTY && value !== MARK)) return;
    const total = room.size * room.size;
    let changed = false;
    for (const i of cells.slice(0, total)) {
      if (!Number.isInteger(i) || i < 0 || i >= total) continue;
      if (isHam(player.board[i])) continue;
      if (player.board[i] !== value) {
        player.board[i] = value;
        changed = true;
      }
    }
    if (changed) broadcast(room);
  });

  socket.on('board:clear', () => {
    const { room, player } = getRoomOf(socket);
    if (!canAct(room, player)) return;
    player.board = player.board.map((v) => (isHam(v) ? v : EMPTY));
    broadcast(room);
  });

  // 햄스터 찾기 (더블클릭)
  socket.on('cell:hamster', ({ index, autoX } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const { room, player } = getRoomOf(socket);
    if (!canAct(room, player)) return reply({ ok: false });
    const n = room.size;
    if (!Number.isInteger(index) || index < 0 || index >= n * n) return reply({ ok: false });
    if (isHam(player.board[index])) return reply({ ok: false });

    const r = Math.floor(index / n), c = index % n;
    let result;
    let item = null;
    if (room.puzzle.solution[r] === c) {
      const golden = room.golden.has(index);
      placeHamster(room, player, index, golden ? GOLD : HAM, !!autoX);
      if (golden) item = useItem(room, player, !!autoX);
      result = golden ? 'golden' : 'correct';
    } else {
      player.board[index] = MARK;
      player.lives -= 1;
      player.mistakes += 1;
      if (player.lives <= 0) {
        player.status = 'out';
        player.outAt = Date.now();
        sysChat(room, `😵 ${player.name}님이 탈락했어요.`);
      }
      result = 'wrong';
    }
    reply({
      ok: true,
      result,
      item,
      board: player.board.join(''),
      lives: player.lives,
      status: player.status,
      finishRank: player.finishRank,
    });
    socket.to(room.id).emit('player:event', { playerId: player.id, type: result, index });
    if (item) io.to(room.id).emit('item:used', { by: player.id, byName: player.name, ...item, index: undefined });
    checkRoundEnd(room);
    broadcast(room);
  });

  socket.on('player:giveup', () => {
    const { room, player } = getRoomOf(socket);
    if (!room || !player || room.state !== 'playing' || player.status !== 'playing') return;
    player.status = 'out';
    player.outAt = Date.now();
    sysChat(room, `🏳️ ${player.name}님이 포기했어요.`);
    checkRoundEnd(room);
    broadcast(room);
  });

  socket.on('chat:emote', ({ emote } = {}) => {
    const { room } = getRoomOf(socket);
    const allowed = ['👍', '😮', '😂', '🔥', '🐹', '💦'];
    if (!room || !allowed.includes(emote)) return;
    // 쿨타임은 거의 없이, 매크로 도배만 막는다 (1초에 10개)
    const now = Date.now();
    socket.data.emoteTimes = (socket.data.emoteTimes || []).filter((t) => now - t < 1000);
    if (socket.data.emoteTimes.length >= 10) return;
    socket.data.emoteTimes.push(now);
    io.to(room.id).emit('chat:emote', { playerId: user.id, emote });
  });

  socket.on('chat:send', ({ text } = {}) => {
    const { room, player } = getRoomOf(socket);
    if (!room || !player) return;
    const msg = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!msg) return;
    // 5초에 5개까지
    const now = Date.now();
    socket.data.chatTimes = socket.data.chatTimes.filter((t) => now - t < 5000);
    if (socket.data.chatTimes.length >= 5) return;
    socket.data.chatTimes.push(now);
    pushChat(room, { type: 'user', userId: user.id, name: player.name, text: msg });
  });

  socket.on('rank:me', (_, ack) => {
    if (typeof ack === 'function') ack(ranks.info(user.id));
  });

  socket.on('rank:top', (_, ack) => {
    if (typeof ack !== 'function') return;
    const list = ranks.leaderboard(30).map((r) => ({ ...r, avatar: profiles.equipped(r.id) }));
    ack({ list, guide: ranks.guide() });
  });

  // ---------- 상점 ----------
  // 아바타가 바뀌면 같은 방 사람들에게도 보이게
  function afterProfileChange() {
    const { room, player } = getRoomOf(socket);
    if (player) sendProfile(player);
    else socket.emit('profile:update', profiles.get(user.id));
    if (room) broadcast(room);
  }

  socket.on('profile:me', (_, ack) => {
    if (typeof ack === 'function') ack(profiles.get(user.id));
  });

  socket.on('shop:buy', ({ itemId } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const result = profiles.buy(user.id, String(itemId || ''));
    reply({ ...result, profile: profiles.get(user.id) });
    if (result.ok) afterProfileChange();
  });

  socket.on('shop:equip', ({ slot, itemId } = {}, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const result = profiles.equip(user.id, String(slot || ''), itemId == null ? null : String(itemId));
    reply({ ...result, profile: profiles.get(user.id) });
    if (result.ok) afterProfileChange();
  });

  socket.on('disconnect', () => {
    const { room, player } = getRoomOf(socket);
    if (!room || !player) return;
    player.sockets.delete(socket.id);
    if (player.sockets.size === 0 && room.state !== 'playing') {
      // 새로고침 대비: 잠깐 기다렸다가 대기실에서 제거
      setTimeout(() => {
        if (player.sockets.size === 0 && room.state !== 'playing' && room.players.get(player.id) === player) {
          removePlayer(room, player);
          broadcast(room);
        }
      }, 15000);
    }
    if (player.sockets.size === 0 && room.state === 'playing') {
      // 새로고침이면 금방 돌아오니 잠시 뒤에 판 종료 여부 확인
      setTimeout(() => {
        checkRoundEnd(room);
        broadcast(room);
      }, 20000);
    }
    ensureHost(room);
    broadcast(room);
  });
});

// 오래 비어 있는 방 정리
setInterval(() => {
  const now = Date.now();
  for (const [id, room] of rooms) {
    const online = [...room.players.values()].some((p) => p.sockets.size > 0);
    if (!online && now - room.touchedAt > ROOM_IDLE_MS) rooms.delete(id);
  }
}, 60000);

server.listen(PORT, () => {
  console.log(`🐹 햄스터 퍼즐 서버: http://localhost:${PORT}`);
  console.log(`   구글 로그인: ${GOOGLE_CLIENT_ID ? '켜짐' : '꺼짐 (GOOGLE_CLIENT_ID 미설정)'} / 게스트 입장: ${ALLOW_GUEST ? '허용' : '차단'}`);
});

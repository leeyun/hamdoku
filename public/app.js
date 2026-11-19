// 영역 색 (최대 12개 영역)
const PALETTE = [
  '#5cc3b5', '#f3c95b', '#b5d56a', '#b38ae0', '#7b8fe3', '#f4a9c6',
  '#f39b87', '#f5ab5c', '#e488c8', '#8ccdf0', '#c8a27c', '#97a3b6',
];
const SIZES = [6, 7, 8, 9, 12];
const NEUTRAL = '#ecdcc6';
const EMOTES = ['👍', '😮', '😂', '🔥', '🐹', '💦'];
const DOUBLE_TAP_MS = 350;

const $ = (s) => document.querySelector(s);
const boardEl = $('#board');

const state = {
  config: null,
  token: null,
  user: null,
  socket: null,
  roomId: null,
  pendingRoomId: null, // 초대 링크로 들어왔을 때 로그인 후 입장할 방
  room: null,
  me: null,
  clockOffset: 0,
  boardKey: null,
  myBoard: [],
  cells: [],
  pending: new Map(),
  flushTimer: null,
  drag: null,
  lastTap: null,
  busy: new Set(),
  shownLives: null,
  livesKey: null,
  autoX: false,
  others: new Map(),
  lastEmote: 0,
  googleReady: false,
  chatRoomId: null,
  chatIds: new Set(),
  blindShown: false,
};

// 보드 칸 값: 0 빈칸, 1 X, 2 햄스터, 3 황금 햄스터, 4 힌트로 찾은 햄스터
const isHam = (v) => v >= 2;

try { state.autoX = localStorage.getItem('hamAutoX') === '1'; } catch {}

// ---------- 유틸 ----------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '요청에 실패했어요.');
  return data;
}

let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function show(name) {
  for (const s of document.querySelectorAll('.screen')) s.classList.toggle('hidden', s.id !== `screen-${name}`);
}

function fillHamsters(root = document) {
  for (const el of root.querySelectorAll('[data-hamster]')) if (!el.innerHTML.trim()) el.innerHTML = Art.hamster();
}

// 모든 목록에서 쓰는 작은 햄스터 아바타 (착용 아이템 포함)
function avatarHTML(p) {
  return Avatar.html(p && p.avatar, 'avatar');
}

function tierHTML(rank, { full = false, lp = false } = {}) {
  if (!rank) return '';
  const text = full ? rank.fullName : rank.label;
  return `<span class="tier-badge tier-${rank.key}" style="--tc:${rank.color}">${Art.tier(rank.key, rank.color)}<span>${esc(text)}${lp ? ` · ${rank.lp} LP` : ''}</span></span>`;
}

function hamHTML(v, isNew = false) {
  const cls = `hamster-wrap${isNew ? ' new' : ''}${v === 3 ? ' golden' : ''}${v === 4 ? ' hinted' : ''}`;
  return `<div class="${cls}">${Art.hamster({ golden: v === 3 })}${v === 4 ? '<span class="hint-badge">💡</span>' : ''}</div>`;
}

function blindLeft(p) {
  return p ? Math.max(0, p.blindUntil - (Date.now() + state.clockOffset)) : 0;
}

function fmtTime(ms) {
  if (ms == null || ms < 0) return '--:--';
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function inviteLink() {
  return `${location.origin}/r/${state.roomId}`;
}

async function copyInvite() {
  const link = inviteLink();
  try {
    await navigator.clipboard.writeText(link);
    toast('초대 링크를 복사했어요! 친구에게 보내주세요 🐹');
  } catch {
    window.prompt('아래 링크를 복사해서 친구에게 보내주세요', link);
  }
}

// 이웃한 영역끼리 최대한 다른 색이 되도록 팔레트 색을 배정 (모든 사람에게 같은 결과)
function regionColors(n, regions) {
  const count = Math.max(...regions) + 1;
  const adj = Array.from({ length: count }, () => new Set());
  for (let i = 0; i < n * n; i++) {
    const right = i % n < n - 1 ? i + 1 : -1;
    const down = i + n < n * n ? i + n : -1;
    for (const j of [right, down]) {
      if (j < 0 || regions[i] === regions[j]) continue;
      adj[regions[i]].add(regions[j]);
      adj[regions[j]].add(regions[i]);
    }
  }
  const rgb = PALETTE.map((h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16)));
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  const colorOf = new Array(count).fill(-1);
  const used = new Set();
  const order = [...Array(count).keys()].sort((a, b) => adj[b].size - adj[a].size || a - b);
  for (const r of order) {
    let best = -1;
    let bestScore = -1;
    for (let k = 0; k < PALETTE.length; k++) {
      if (used.has(k)) continue;
      let score = Infinity;
      for (const nb of adj[r]) if (colorOf[nb] >= 0) score = Math.min(score, dist(rgb[k], rgb[colorOf[nb]]));
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    }
    colorOf[r] = best;
    used.add(best);
  }
  return colorOf.map((k) => PALETTE[k]);
}

function cellColor(i) {
  const room = state.room;
  return room.regions && room.state !== 'lobby' ? state.colors[room.regions[i]] : NEUTRAL;
}

function parseBoard(str, n) {
  return Array.from({ length: n * n }, (_, i) => Number(str[i] || 0));
}

function roomFromPath() {
  const m = location.pathname.match(/^\/r\/([A-Za-z0-9]{6})\/?$/);
  return m ? m[1].toUpperCase() : null;
}

// ---------- 로그인 ----------
function showLogin() {
  show('login');
  $('#login-error').textContent = '';
  $('#guest-form').classList.toggle('hidden', !state.config.allowGuest);
  if (!state.config.googleClientId) {
    $('#google-off').classList.remove('hidden');
    return;
  }
  const init = () => {
    if (!window.google || !google.accounts || !google.accounts.id) return setTimeout(init, 150);
    if (!state.googleReady) {
      google.accounts.id.initialize({
        client_id: state.config.googleClientId,
        callback: async (resp) => {
          try {
            onLogin(await api('/api/auth/google', { credential: resp.credential }));
          } catch (e) {
            $('#login-error').textContent = e.message;
          }
        },
      });
      state.googleReady = true;
    }
    $('#google-btn').innerHTML = '';
    google.accounts.id.renderButton($('#google-btn'), {
      theme: 'outline', size: 'large', shape: 'pill', text: 'signin_with', locale: 'ko', width: 260,
    });
  };
  init();
}

$('#guest-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    onLogin(await api('/api/auth/guest', { name: $('#guest-name').value }));
  } catch (err) {
    $('#login-error').textContent = err.message;
  }
});

function onLogin({ token, user }) {
  state.token = token;
  state.user = user;
  try {
    localStorage.setItem('hamToken', token);
    localStorage.setItem('hamUser', JSON.stringify(user));
  } catch {}
  connect();
}

function logout() {
  try {
    localStorage.removeItem('hamToken');
    localStorage.removeItem('hamUser');
  } catch {}
  if (state.socket) state.socket.disconnect();
  state.socket = null;
  state.token = null;
  state.user = null;
  state.roomId = null;
  if (window.google && google.accounts && google.accounts.id) google.accounts.id.disableAutoSelect();
  showLogin();
}

// ---------- 소켓 ----------
function connect() {
  if (state.socket) state.socket.disconnect();
  const socket = io({ auth: { token: state.token }, extraHeaders: { 'ngrok-skip-browser-warning': '1' } });
  state.socket = socket;

  socket.on('connect', () => {
    const target = state.roomId || state.pendingRoomId;
    state.pendingRoomId = null;
    if (target) joinRoom(target);
    else showHome();
  });
  socket.on('connect_error', (err) => {
    if (err.message === 'unauthorized') {
      toast('다시 로그인해 주세요');
      logout();
    }
  });
  socket.on('disconnect', () => {
    if (state.roomId) toast('연결이 끊겼어요. 다시 연결하는 중…');
  });
  socket.on('room:state', onRoomState);
  socket.on('player:event', onPlayerEvent);
  socket.on('round:started', () => Sound.click());
  socket.on('round:ended', ({ winnerId }) => {
    if (!state.user) return;
    if (winnerId === state.user.id) return; // 내 우승 효과음은 이미 재생됨
    setTimeout(() => (state.me && state.me.status === 'done' ? Sound.win() : Sound.lose()), 300);
  });
  socket.on('chat:emote', showEmote);
  socket.on('chat:message', (msg) => {
    addChat(msg);
    if (msg.type === 'user' && msg.userId !== state.user.id) Sound.chat();
  });
  socket.on('item:used', onItemUsed);
  socket.on('profile:update', setProfile);
  socket.emit('profile:me', {}, setProfile);
}

// ---------- 홈 ----------
function showHome() {
  state.roomId = null;
  state.room = null;
  state.boardKey = null;
  if (location.pathname !== '/') history.replaceState(null, '', '/');
  $('#home-name').textContent = state.user.name;
  renderProfileBits();
  show('home');
  renderHomeRank();
}

// ---------- 프로필 / 코인 / 내 아바타 ----------
function myEquipped() {
  return (state.profile && state.profile.equipped) || {};
}

function setProfile(profile) {
  if (!profile) return;
  const before = state.profile ? state.profile.coins : null;
  state.profile = profile;
  renderProfileBits();
  if (before != null && profile.coins > before && state.roomId) coinPop(profile.coins - before);
  if (!$('#shop-modal').classList.contains('hidden')) renderShop();
}

function renderProfileBits() {
  const coins = state.profile ? state.profile.coins : 0;
  for (const el of document.querySelectorAll('.coin-chip')) el.innerHTML = `${Art.seed()}${coins}`;
  const key = JSON.stringify(myEquipped());
  if (state.myAvatarKey !== key) {
    state.myAvatarKey = key;
    $('#my-avatar').innerHTML = Avatar.svg(myEquipped());
    $('#home-avatar').innerHTML = Avatar.svg(myEquipped());
  }
}

// 코인을 받으면 내 아바타 위로 +N
function coinPop(amount) {
  const box = $('#my-avatar-box');
  const el = document.createElement('div');
  el.className = 'coin-pop';
  el.innerHTML = `+${amount} ${Art.seed()}`;
  box.appendChild(el);
  setTimeout(() => el.remove(), 1600);
  Sound.hint();
}

// ---------- 상점 ----------
function openShop() {
  if (!state.profile) return;
  Sound.click();
  state.tryOn = { ...myEquipped() };
  state.shopTab = state.shopTab || 'hat';
  renderShop();
  $('#shop-modal').classList.remove('hidden');
}

function renderShop() {
  const profile = state.profile;
  const tab = state.shopTab;
  $('#shop-seed').innerHTML = Art.seed();
  $('#shop-coins').textContent = profile.coins;
  $('#shop-avatar').innerHTML = Avatar.svg(state.tryOn);
  $('#shop-tabs').innerHTML = CATALOG.slots
    .map((s) => `<button data-shop-tab="${s.key}" class="${s.key === tab ? 'on' : ''}">${s.icon} ${s.name}</button>`)
    .join('');
  const worn = profile.equipped[tab];
  const cards = [
    `<div class="shop-item${!worn ? ' worn' : ''}" data-try="">
       <div class="shop-thumb">${Avatar.svg({ ...state.tryOn, [tab]: null })}</div>
       <div class="shop-name">기본 (안 씀)</div>
       ${worn ? `<button class="btn btn-sub btn-sm" data-equip="">벗기</button>` : '<span class="shop-state">착용 중</span>'}
     </div>`,
  ];
  for (const item of CATALOG.items.filter((i) => i.slot === tab)) {
    const owned = profile.owned.includes(item.id);
    const isWorn = worn === item.id;
    let action;
    if (isWorn) action = '<span class="shop-state">착용 중</span>';
    else if (owned) action = `<button class="btn btn-sub btn-sm" data-equip="${item.id}">착용</button>`;
    else {
      const poor = profile.coins < item.price;
      action = `<button class="btn btn-main btn-sm" data-buy="${item.id}" ${poor ? 'disabled' : ''}>${Art.seed()} ${item.price}</button>`;
    }
    cards.push(`
      <div class="shop-item${isWorn ? ' worn' : ''}${state.tryOn[tab] === item.id ? ' trying' : ''}" data-try="${item.id}">
        <div class="shop-thumb">${Avatar.svg({ ...state.tryOn, [tab]: item.id })}</div>
        <div class="shop-name">${esc(item.name)}</div>
        ${action}
      </div>`);
  }
  $('#shop-grid').innerHTML = cards.join('');
}

$('#shop-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-shop-tab]');
  if (!b) return;
  Sound.click();
  state.shopTab = b.dataset.shopTab;
  renderShop();
});

$('#shop-grid').addEventListener('click', (e) => {
  const buy = e.target.closest('[data-buy]');
  const equip = e.target.closest('[data-equip]');
  const tab = state.shopTab;
  if (buy) {
    if (buy.disabled) return;
    state.socket.emit('shop:buy', { itemId: buy.dataset.buy }, (res) => {
      if (!res.ok) return toast(res.error);
      state.tryOn[tab] = buy.dataset.buy;
      setProfile(res.profile);
      Sound.promote();
      Avatar.react($('#shop-avatar'), 'cheer', '새 옷이다!');
      toast('구매 완료! 바로 입었어요 🐹');
    });
    return;
  }
  if (equip) {
    const itemId = equip.dataset.equip || null;
    state.socket.emit('shop:equip', { slot: tab, itemId }, (res) => {
      if (!res.ok) return toast(res.error);
      state.tryOn[tab] = itemId;
      setProfile(res.profile);
      Sound.click();
      Avatar.react($('#shop-avatar'), 'cheer', itemId ? '어때?' : '홀가분!');
    });
    return;
  }
  const card = e.target.closest('[data-try]');
  if (!card) return;
  // 카드를 누르면 입어보기만
  state.tryOn[tab] = card.dataset.try || null;
  renderShop();
  Avatar.react($('#shop-avatar'), 'cheer', '어울려?');
});

$('#shop-reset').addEventListener('click', () => {
  state.tryOn = { ...myEquipped() };
  renderShop();
});
$('#btn-shop').addEventListener('click', openShop);
$('#btn-shop-home').addEventListener('click', openShop);
$('#my-avatar-box').addEventListener('click', () => {
  Avatar.react($('#my-avatar'), 'cheer', '안녕!');
});

function renderHomeRank() {
  const card = $('#home-rank');
  state.socket.emit('rank:me', {}, (r) => {
    if (!r) return;
    const progress = r.division ? r.lp : Math.min(100, (r.lp % 100));
    card.style.setProperty('--tc', r.color);
    card.innerHTML = `
      <div class="rank-icon">${Art.tier(r.key, r.color)}</div>
      <div class="rank-info">
        <div class="rank-name">${esc(r.fullName)}</div>
        <div class="rank-lp">${r.lp} LP <span class="muted">· ${r.games}판 ${r.wins}승</span></div>
        <div class="rank-bar"><i style="width:${progress}%"></i></div>
      </div>
      <span class="rank-more">랭킹 ›</span>`;
  });
}

$('#btn-logout').addEventListener('click', logout);
$('#home-rank').addEventListener('click', openLeaderboard);
$('#btn-leaderboard').addEventListener('click', openLeaderboard);

// ---------- 랭킹 ----------
function openLeaderboard() {
  Sound.click();
  $('#modal').classList.remove('hidden');
  $('#leaderboard').innerHTML = '<p class="muted">불러오는 중…</p>';
  state.socket.emit('rank:top', {}, ({ list, guide }) => {
    $('#leaderboard').innerHTML = list.length
      ? list
          .map(
            (r, i) => `
          <div class="lb-row${r.id === state.user.id ? ' me' : ''}">
            <span class="lb-pos">${i + 1}</span>
            ${avatarHTML(r)}
            <div class="lb-info"><div class="nm">${esc(r.name)}${r.guest ? ' <span class="muted small">게스트</span>' : ''}</div>
              <div class="meta">${r.games}판 ${r.wins}승</div></div>
            <div class="lb-tier">${tierHTML(r)}<div class="meta">${r.lp} LP</div></div>
          </div>`,
          )
          .join('')
      : '<p class="muted">아직 랭크 게임 기록이 없어요. 친구와 한 판 해보세요!</p>';
    const tiers = guide.tiers
      .map((t) => `<div class="guide-tier">${Art.tier(t.key, t.color)}<span>${t.name} 해바라기씨</span><span class="muted">${t.from}점~</span></div>`)
      .join('');
    const place = Object.entries(guide.placeLp)
      .map(([n, arr]) => `<li>${n}명: ${arr.map((v, i) => `${i + 1}등 ${v > 0 ? '+' : ''}${v}`).join(' / ')}</li>`)
      .join('');
    const sizes = Object.entries(guide.sizeMult).map(([s, m]) => `${s}×${s} ×${m}`).join(', ');
    $('#rank-guide').innerHTML = `
      <div class="guide-tiers">${tiers}</div>
      <ul>
        <li>브론즈~다이아는 IV → I 4단계, 단계마다 100 LP</li>
        <li>마스터 2400점, 챌린저 3000점부터</li>
        ${place}
        <li>판 크기 배율: ${sizes}</li>
        <li>실수 없이 다 찾으면 +${guide.perfectBonus} 보너스</li>
        <li>낮은 티어는 더 많이 오르고 덜 떨어져요</li>
        <li>혼자 한 판, 도중에 들어온 판은 반영되지 않아요</li>
      </ul>`;
  });
}

// 팝업 닫기: 바깥 클릭, ✕, Esc
for (const m of document.querySelectorAll('.modal')) {
  m.addEventListener('click', (e) => {
    if (e.target === m || e.target.closest('[data-close]')) m.classList.add('hidden');
  });
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') for (const m of document.querySelectorAll('.modal')) m.classList.add('hidden');
});

// ---------- 규칙 설명 팝업 ----------
// 4×4 예시판: 영역 A~D, 칸 표시 . 빈칸 / x X / X 강조된 X / h 햄스터 / H 강조된 햄스터 / r 틀린 햄스터 / g 황금 햄스터
const EX_REGIONS = ['AABB', 'ACBB', 'DCCB', 'DDCC'];
const EX_COLORS = { A: '#f5ab5c', B: '#8ccdf0', C: '#b5d56a', D: '#e488c8' };

function exGrid(marks) {
  let html = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const m = marks[r][c];
      const cls = `ex-cell${m === 'X' || m === 'H' ? ' hl' : ''}${m === 'r' ? ' bad' : ''}`;
      let inner = '';
      if (m === 'x' || m === 'X') inner = Art.X;
      else if (m === 'h' || m === 'H' || m === 'r') inner = Art.hamster();
      else if (m === 'g') inner = Art.hamster({ golden: true });
      html += `<div class="${cls}" style="background:${EX_COLORS[EX_REGIONS[r][c]]}">${inner}</div>`;
    }
  }
  return `<div class="ex-grid">${html}</div>`;
}

const RULES = {
  color: {
    tab: '🎨 색깔',
    title: '🎨 색깔당 햄스터 1마리',
    lead: '같은 색으로 칠해진 영역마다 햄스터가 <b>정확히 한 마리</b> 숨어 있어요. 영역이 크든 작든 딱 한 마리예요.',
    ok: { marks: ['.h..', '...h', 'h...', '..h.'], caption: '색깔마다 한 마리씩' },
    bad: { marks: ['..r.', '....', '...r', '....'], caption: '하늘색에 두 마리' },
    tips: [
      '한 칸짜리 영역이 있다면 그 칸이 바로 햄스터예요!',
      '어떤 색이 한 줄(행이나 열) 안에만 있다면 그 색의 햄스터는 그 줄에 있어요. 그 줄의 <b>다른 색 칸은 전부 X</b>.',
      '색깔 수 = 행 수 = 열 수 = 햄스터 수예요.',
    ],
  },
  line: {
    tab: '➕ 행·열',
    title: '➕ 행과 열마다 햄스터 1마리',
    lead: '가로줄(행)과 세로줄(열)마다 햄스터가 <b>정확히 한 마리</b>씩 있어요.',
    ok: { marks: ['...X', 'XXXH', '...X', '...X'], caption: '찾으면 같은 행·열은 모두 X' },
    bad: { marks: ['r..r', '....', '....', '....'], caption: '한 줄에 두 마리' },
    tips: [
      '햄스터를 찾으면 같은 행과 열의 나머지 칸은 모두 X 해도 돼요. <b>자동 X</b>를 켜면 알아서 해줘요.',
      'X가 아닌 칸이 하나만 남은 줄이 있다면 거기가 햄스터예요.',
      '두 가지 색이 같은 두 줄 안에만 들어 있다면, 그 두 줄의 다른 칸은 전부 X예요. (고급 팁)',
    ],
  },
  touch: {
    tab: '🚫 접촉',
    title: '🚫 햄스터끼리 접촉 불가',
    lead: '햄스터는 서로 닿는 걸 싫어해요. 위·아래·옆은 물론 <b>대각선으로도</b> 붙어 있을 수 없어요.',
    ok: { marks: ['XXX.', 'XHX.', 'XXX.', '....'], caption: '둘러싼 8칸은 모두 X' },
    bad: { marks: ['....', '.r..', '..r.', '....'], caption: '대각선으로 닿음' },
    tips: [
      '햄스터를 찾으면 둘러싼 8칸을 X 해두세요.',
      '어떤 칸에 햄스터를 놓았을 때 다른 색 영역의 칸이 전부 막혀버린다면, 그 칸은 햄스터가 아니에요.',
    ],
  },
  gold: {
    tab: '✨ 황금',
    title: '✨ 황금 햄스터 (아이템전)',
    lead: '아이템전에서는 정답 햄스터 중 일부가 <b>황금 햄스터</b>예요. 12×12는 3마리, 나머지 크기는 2마리. 찾기 전까지는 어느 게 황금인지 몰라요!',
    ok: { marks: ['.g..', '...h', 'h...', '..h.'], caption: '찾으면 아이템 발동!' },
    items: [
      ['🙈', '화면 가리기', '아직 풀고 있는 상대 한 명의 화면을 5초간 덮어요. 그동안 상대는 아무것도 못 해요.'],
      ['💡', '햄스터 알려주기', '아직 못 찾은 햄스터 한 마리를 자동으로 찾아줘요.'],
    ],
    tips: ['둘 중 무엇이 나올지는 무작위예요.', '황금 햄스터도 다른 햄스터와 똑같이 세 가지 규칙을 지켜요.'],
  },
};

function openRule(key) {
  Sound.click();
  const tabs = $('#rule-tabs');
  tabs.innerHTML = Object.entries(RULES)
    .map(([k, r]) => `<button data-rule-tab="${k}" class="${k === key ? 'on' : ''}">${r.tab}</button>`)
    .join('');
  const r = RULES[key];
  const figures = [`<figure>${exGrid(r.ok.marks)}<figcaption class="ok">✔ ${r.ok.caption}</figcaption></figure>`];
  if (r.bad) figures.push(`<figure>${exGrid(r.bad.marks)}<figcaption class="bad">✘ ${r.bad.caption}</figcaption></figure>`);
  const items = r.items
    ? `<div class="item-cards">${r.items.map(([ico, name, desc]) => `<div class="item-card"><span class="item-ico">${ico}</span><b>${name}</b><span>${desc}</span></div>`).join('')}</div>`
    : '';
  $('#rule-body').innerHTML = `
    <h2>${r.title}</h2>
    <p class="rule-lead">${r.lead}</p>
    <div class="ex-row">${figures.join('')}</div>
    ${items}
    <ul class="rule-tips">${r.tips.map((t) => `<li>${t}</li>`).join('')}</ul>`;
  $('#rule-modal').classList.remove('hidden');
}

$('.rules').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rule]');
  if (b) openRule(b.dataset.rule);
});
$('#rule-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rule-tab]');
  if (b) openRule(b.dataset.ruleTab);
});

$('#btn-create').addEventListener('click', () => {
  Sound.unlock();
  Sound.click();
  state.socket.emit('room:create', {}, (res) => {
    if (res && res.ok) joinRoom(res.roomId);
  });
});

$('#join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  Sound.unlock();
  const code = $('#join-code').value.trim().toUpperCase();
  if (code.length !== 6) return toast('방 코드 6자리를 입력해 주세요');
  joinRoom(code);
});

function joinRoom(roomId) {
  state.socket.emit('room:join', { roomId }, (res) => {
    if (!res || !res.ok) {
      toast((res && res.error) || '방에 들어갈 수 없어요');
      state.roomId = null;
      showHome();
      return;
    }
    const changed = state.roomId !== roomId;
    state.roomId = roomId;
    if (changed) state.boardKey = null;
    if (location.pathname !== `/r/${roomId}`) history.replaceState(null, '', `/r/${roomId}`);
    $('#room-code').textContent = roomId;
    if (state.chatRoomId !== roomId) {
      state.chatRoomId = roomId;
      state.chatIds.clear();
      $('#chat-log').innerHTML = '';
    }
    for (const msg of res.chat || []) addChat(msg);
    show('room');
    onRoomState(res.room);
  });
}

$('#btn-leave').addEventListener('click', () => {
  if (state.room && state.room.state === 'playing' && state.me && state.me.status === 'playing') {
    if (!confirm('게임 중이에요. 정말 나갈까요?')) return;
  }
  state.socket.emit('room:leave');
  for (const o of state.others.values()) o.el.remove();
  state.others.clear();
  showHome();
});

$('#btn-invite').addEventListener('click', copyInvite);

function renderSoundBtn() {
  $('#btn-sound').textContent = Sound.muted ? '🔇' : '🔊';
}
$('#btn-sound').addEventListener('click', () => {
  Sound.toggle();
  renderSoundBtn();
  Sound.click();
});

// ---------- 방 상태 ----------
function onRoomState(room) {
  if (!state.roomId || room.id !== state.roomId) return;
  state.clockOffset = room.now - Date.now();
  state.room = room;
  state.me = room.players.find((p) => p.id === state.user.id) || null;
  if (!state.me) return;

  const playable = room.regions && room.state !== 'lobby';
  const key = playable ? `round:${room.round}` : `lobby:${room.size}`;
  if (key !== state.boardKey) {
    state.boardKey = key;
    state.colors = playable ? regionColors(room.size, room.regions) : null;
    state.myBoard = parseBoard(playable ? state.me.board : '', room.size);
    state.pending.clear();
    state.lastTap = null;
    state.drag = null;
    buildBoard();
  } else if (state.me.status !== 'playing' && playable) {
    // 더 이상 조작할 수 없으면 서버 상태를 그대로 따른다
    state.myBoard = parseBoard(state.me.board, room.size);
    paintAll();
  }

  boardEl.classList.toggle('locked', !canPlay());
  boardEl.classList.toggle('lobby', !playable);
  const gold = room.roundMode === 'item' && playable;
  $('#rule-gold').classList.toggle('hidden', !gold);
  if (gold) $('#rule-gold-text').innerHTML = `황금 햄스터<br />${room.goldenCount}마리 숨음`;
  renderHud();
  renderOverlay();
  renderOthers();
  renderBlind();
}

function canPlay() {
  return !!(state.room && state.room.state === 'playing' && state.me && state.me.status === 'playing' && !blindLeft(state.me));
}

// ---------- 내 보드 ----------
function buildBoard() {
  const room = state.room;
  const n = room.size;
  boardEl.style.setProperty('--n', n);
  boardEl.closest('.play-col').classList.toggle('big', n >= 10);
  boardEl.innerHTML = '';
  state.cells = [];
  for (let i = 0; i < n * n; i++) {
    const el = document.createElement('div');
    el.className = 'cell';
    el.dataset.i = i;
    el.style.background = cellColor(i);
    boardEl.appendChild(el);
    state.cells.push(el);
  }
  paintAll();
}

function paintCell(i, isNew = false) {
  const el = state.cells[i];
  if (!el) return;
  const v = state.myBoard[i];
  if (el.dataset.v === String(v)) return;
  el.dataset.v = v;
  if (v === 0) el.innerHTML = '';
  else if (v === 1) el.innerHTML = Art.X;
  else el.innerHTML = hamHTML(v, isNew);
}

function paintAll(newIdx = -1) {
  for (let i = 0; i < state.cells.length; i++) paintCell(i, i === newIdx);
}

function setCell(i, v) {
  if (state.myBoard[i] === v || isHam(state.myBoard[i])) return;
  state.myBoard[i] = v;
  paintCell(i);
  state.pending.set(i, v);
  if (!state.flushTimer) state.flushTimer = setTimeout(flush, 60);
}

function flush() {
  clearTimeout(state.flushTimer);
  state.flushTimer = null;
  if (!state.pending.size || !state.socket) return;
  const byValue = { 0: [], 1: [] };
  for (const [i, v] of state.pending) byValue[v].push(i);
  state.pending.clear();
  for (const v of [0, 1]) if (byValue[v].length) state.socket.emit('cell:set', { cells: byValue[v], value: v });
}

function cellAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const cell = el && el.closest('#board .cell');
  return cell ? Number(cell.dataset.i) : -1;
}

// 클릭/드래그: X 표시, 더블클릭(더블탭): 햄스터
boardEl.addEventListener('pointerdown', (e) => {
  if (!canPlay() || e.button > 0) return;
  const i = cellAt(e.clientX, e.clientY);
  if (i < 0) return;
  e.preventDefault();
  Sound.unlock();
  const now = performance.now();
  const lt = state.lastTap;
  if (lt && lt.i === i && now - lt.t < DOUBLE_TAP_MS) {
    // 첫 번째 클릭으로 바뀐 X를 원래대로 돌리고 햄스터 시도
    state.lastTap = null;
    state.drag = null;
    setCell(i, lt.prev);
    tryHamster(i);
    return;
  }
  if (isHam(state.myBoard[i])) {
    state.lastTap = null;
    return;
  }
  const prev = state.myBoard[i];
  const mode = prev === 1 ? 0 : 1;
  state.drag = { mode, pointerId: e.pointerId, last: i };
  state.lastTap = { i, t: now, prev };
  setCell(i, mode);
  mode ? Sound.mark() : Sound.unmark();
  boardEl.setPointerCapture(e.pointerId);
});

boardEl.addEventListener('pointermove', (e) => {
  const d = state.drag;
  if (!d || e.pointerId !== d.pointerId || !canPlay()) return;
  const i = cellAt(e.clientX, e.clientY);
  if (i < 0 || i === d.last) return;
  d.last = i;
  state.lastTap = null;
  if (isHam(state.myBoard[i]) || state.myBoard[i] === d.mode) return;
  setCell(i, d.mode);
  d.mode ? Sound.mark() : Sound.unmark();
});

function endDrag(e) {
  if (state.drag && e.pointerId === state.drag.pointerId) {
    state.drag = null;
    flush();
  }
}
boardEl.addEventListener('pointerup', endDrag);
boardEl.addEventListener('pointercancel', endDrag);
boardEl.addEventListener('contextmenu', (e) => e.preventDefault());
boardEl.addEventListener('dblclick', (e) => e.preventDefault());

function tryHamster(i) {
  if (state.busy.has(i) || isHam(state.myBoard[i])) return;
  flush();
  state.busy.add(i);
  state.socket.emit('cell:hamster', { index: i, autoX: state.autoX }, (res) => {
    state.busy.delete(i);
    if (!res || !res.ok) return;
    state.myBoard = parseBoard(res.board, state.room.size);
    if (state.me) {
      state.me.lives = res.lives;
      state.me.status = res.status;
      state.me.finishRank = res.finishRank;
    }
    const found = res.result === 'correct' || res.result === 'golden';
    const hintIdx = res.item && res.item.kind === 'reveal' ? res.item.index : -1;
    for (let k = 0; k < state.cells.length; k++) paintCell(k, (found && k === i) || k === hintIdx);
    const cell = state.cells[i];
    const myAv = $('#my-avatar');
    if (found) {
      res.result === 'golden' ? Sound.golden() : Sound.found();
      sparkle(cell, res.result === 'golden');
      Avatar.react(myAv, res.status === 'done' ? 'done' : res.result === 'golden' ? 'gold' : 'cheer');
      if (res.item) showMyItem(res.item);
      if (res.status === 'done') {
        setTimeout(() => Sound.win(), 450);
        confetti();
      }
    } else {
      Sound.wrong();
      Avatar.react(myAv, 'sad');
      cell.classList.remove('wrong');
      void cell.offsetWidth;
      cell.classList.add('wrong');
      setTimeout(() => cell.classList.remove('wrong'), 650);
      if (res.status === 'out') setTimeout(() => Sound.lose(), 400);
    }
    boardEl.classList.toggle('locked', !canPlay());
    renderHud();
  });
}

// ---------- 아이템 ----------
function showMyItem(item) {
  if (item.kind === 'blind') {
    toast(`✨ 황금 햄스터! ${item.targetName}님의 화면을 5초간 가렸어요 🙈`);
    return;
  }
  toast('✨ 황금 햄스터! 숨은 햄스터 한 마리를 알려줬어요 💡');
  const cell = state.cells[item.index];
  setTimeout(() => {
    Sound.hint();
    if (cell) sparkle(cell);
    Avatar.react($('#my-avatar'), 'cheer', '힌트 냠!');
  }, 450);
}

function onItemUsed(ev) {
  if (ev.by !== state.user.id) {
    const o = state.others.get(ev.by);
    if (o) {
      o.el.classList.remove('gold-flash');
      void o.el.offsetWidth;
      o.el.classList.add('gold-flash');
    }
  }
  if (ev.kind === 'blind' && ev.targetId === state.user.id) {
    Sound.blinded();
    Avatar.react($('#my-avatar'), 'sad', '으앗! 안 보여!');
    if (state.me) state.me.blindUntil = ev.until;
    state.drag = null;
    state.lastTap = null;
    flush();
    renderBlind(ev.byName);
  }
}

// 내 화면 가리기 (5초)
function renderBlind(byName) {
  const el = $('#blind');
  const left = blindLeft(state.me);
  if (!left || !state.room || state.room.state !== 'playing') {
    if (state.blindShown) {
      el.classList.add('hidden');
      el.innerHTML = '';
      state.blindShown = false;
      boardEl.classList.toggle('locked', !canPlay());
    }
    return;
  }
  if (!state.blindShown) {
    state.blindShown = true;
    let seeds = '';
    for (let k = 0; k < 18; k++) {
      seeds += `<i style="left:${Math.random() * 100}%;animation-delay:${(Math.random() * 1.2).toFixed(2)}s;animation-duration:${(1.4 + Math.random()).toFixed(2)}s">${Art.seed()}</i>`;
    }
    el.innerHTML = `
      <div class="blind-seeds">${seeds}</div>
      <div class="blind-card">
        <div class="blind-ham">${Art.hamster({ sad: true })}</div>
        <div class="blind-title">해바라기씨 폭탄! 🙈</div>
        <div class="blind-sub">${byName ? `${esc(byName)}님의 황금 햄스터 공격` : '앞이 안 보여요'}</div>
        <div class="blind-count"></div>
      </div>`;
    el.classList.remove('hidden');
    boardEl.classList.add('locked');
  }
  el.querySelector('.blind-count').textContent = Math.ceil(left / 1000);
}

// ---------- 효과 ----------
function sparkle(el, golden = false) {
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  const colors = golden ? ['#ffd34e', '#fff3a6', '#ffb800', '#ffffff'] : ['#ffd34e', '#ff9db5', '#8fd3ff', '#ffffff', '#b8f08a'];
  const count = golden ? 22 : 12;
  for (let k = 0; k < count; k++) {
    const s = document.createElement('div');
    s.className = 'spark';
    const a = (Math.PI * 2 * k) / count + Math.random() * 0.4;
    const dist = r.width * (golden ? 1 + Math.random() * 1.2 : 0.7 + Math.random() * 0.6);
    s.style.left = `${cx}px`;
    s.style.top = `${cy}px`;
    s.style.setProperty('--dx', `${Math.cos(a) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * dist}px`);
    s.style.setProperty('--c', colors[k % colors.length]);
    $('#fx').appendChild(s);
    setTimeout(() => s.remove(), 800);
  }
}

function confetti() {
  for (let k = 0; k < 70; k++) {
    const c = document.createElement('div');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}vw`;
    c.style.background = PALETTE[k % PALETTE.length];
    c.style.animationDuration = `${1.6 + Math.random() * 1.8}s`;
    c.style.animationDelay = `${Math.random() * 0.4}s`;
    $('#fx').appendChild(c);
    setTimeout(() => c.remove(), 4000);
  }
}

// ---------- HUD ----------
function renderHud() {
  const room = state.room;
  const me = state.me;
  if (!room || !me) return;
  $('#hud-found').textContent = room.state === 'lobby' ? 0 : me.found;
  $('#hud-total').textContent = room.size;

  const livesKey = `${state.roomId}:${room.round}`;
  const prevLives = state.livesKey === livesKey ? state.shownLives : null;
  let html = '';
  for (let k = 0; k < room.maxLives; k++) html += Art.seed(k < me.lives);
  const livesEl = $('#hud-lives');
  livesEl.innerHTML = html;
  if (prevLives != null && me.lives < prevLives) {
    const seeds = livesEl.querySelectorAll('.seed');
    for (let k = me.lives; k < prevLives; k++) seeds[k] && seeds[k].classList.add('breaking');
  }
  state.livesKey = livesKey;
  state.shownLives = me.lives;

  $('#btn-clear').disabled = !canPlay();
  $('#btn-giveup').disabled = !canPlay();
  $('#btn-auto').classList.toggle('on', state.autoX);
  $('#auto-state').textContent = state.autoX ? 'ON' : 'OFF';

  const banner = $('#banner');
  if (room.state === 'playing' && me.status === 'done') {
    banner.textContent = `🎉 ${me.finishRank}등으로 다 찾았어요! 친구들을 기다리는 중…`;
    banner.classList.remove('hidden');
  } else if (room.state === 'playing' && me.status === 'out') {
    banner.textContent = '😢 탈락! 친구들 화면을 구경해요';
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
  tickTimer();
}

function tickTimer() {
  const room = state.room;
  const me = state.me;
  const el = $('#hud-timer');
  if (!room || !me || !room.startedAt || room.state === 'lobby') return void (el.textContent = '00:00');
  if (me.finishMs != null) return void (el.textContent = fmtTime(me.finishMs));
  if (room.state === 'playing' && me.status === 'playing') {
    return void (el.textContent = fmtTime(Date.now() + state.clockOffset - room.startedAt));
  }
  if (me.status === 'out') el.textContent = '탈락';
}
setInterval(() => {
  tickTimer();
  if (!state.room) return;
  renderBlind();
  for (const p of state.room.players) {
    const o = state.others.get(p.id);
    if (!o) continue;
    const left = state.room.state === 'playing' ? blindLeft(p) : 0;
    o.el.classList.toggle('blinded', left > 0);
    o.blindEl.textContent = left > 0 ? `🙈 ${Math.ceil(left / 1000)}` : '';
  }
}, 250);

$('#btn-auto').addEventListener('click', () => {
  state.autoX = !state.autoX;
  try { localStorage.setItem('hamAutoX', state.autoX ? '1' : '0'); } catch {}
  Sound.click();
  renderHud();
  toast(state.autoX ? '햄스터를 찾으면 주변·같은 줄·같은 색을 자동으로 X 해요' : '자동 X를 껐어요');
});

$('#btn-clear').addEventListener('click', () => {
  if (!canPlay()) return;
  state.pending.clear();
  state.myBoard = state.myBoard.map((v) => (isHam(v) ? v : 0));
  paintAll();
  state.socket.emit('board:clear');
  Sound.unmark();
});

$('#btn-giveup').addEventListener('click', () => {
  if (!canPlay() || !confirm('이번 판을 포기할까요?')) return;
  state.socket.emit('player:giveup');
});

// ---------- 오버레이 (대기실 / 결과) ----------
function settingsHTML(room, isHost) {
  const dis = isHost ? '' : 'disabled';
  const sizes = SIZES
    .map((s) => `<button data-size="${s}" class="${room.size === s ? 'on' : ''}" ${dis}>${s}×${s}</button>`)
    .join('');
  return `
    <div class="label">게임 모드</div>
    <div class="seg">
      <button data-mode="classic" class="${room.mode === 'classic' ? 'on' : ''}" ${dis}>🐹 클래식전</button>
      <button data-mode="item" class="${room.mode === 'item' ? 'on' : ''}" ${dis}>✨ 아이템전</button>
    </div>
    ${room.mode === 'item'
      ? `<p class="mode-desc">황금 햄스터 ${room.size >= 12 ? 3 : 2}마리가 숨어 있어요. 찾으면 무작위로<br />🙈 상대 한 명 화면 5초 가리기 / 💡 햄스터 하나 알려주기</p>`
      : ''}
    <div class="label">퍼즐 크기</div>
    <div class="seg">${sizes}</div>
    <div class="label">친구 화면 (게임 중)</div>
    <div class="seg">
      <button data-spoiler="open" class="${room.spoiler === 'open' ? 'on' : ''}" ${dis}>모두 공개</button>
      <button data-spoiler="blur" class="${room.spoiler === 'blur' ? 'on' : ''}" ${dis}>흐리게 (스포 방지)</button>
    </div>`;
}

function renderOverlay() {
  const room = state.room;
  const me = state.me;
  const overlay = $('#overlay');
  const isHost = room.hostId === me.id;

  if (room.state === 'playing') {
    overlay.classList.add('hidden');
    overlay.innerHTML = '';
    fitOverlay();
    return;
  }
  overlay.classList.remove('hidden');
  requestAnimationFrame(fitOverlay);

  if (room.state === 'lobby') {
    let slots = '';
    for (let k = 0; k < 4; k++) {
      const p = room.players[k];
      slots += p
        ? `<div class="slot">${avatarHTML(p)}<div class="slot-info"><span class="nm">${room.hostId === p.id ? '👑 ' : ''}${esc(p.name)}</span>${tierHTML(p.rank)}</div></div>`
        : `<div class="slot empty">빈 자리</div>`;
    }
    overlay.innerHTML = `
      <div class="panel">
        <h2>대기실 <span class="muted small">${room.players.length}/4</span></h2>
        <div class="slots">${slots}</div>
        <button class="btn btn-sub" data-action="invite">🔗 초대 링크 복사</button>
        ${settingsHTML(room, isHost)}
        <p class="rank-note">${room.players.length >= 2 ? '🏆 랭크 게임: 등수에 따라 LP가 반영돼요' : '혼자 하는 판은 랭크에 반영되지 않아요'}</p>
        ${isHost
          ? `<button class="btn btn-main wide" data-action="start">게임 시작!</button>`
          : `<p class="muted">방장이 시작하기를 기다리는 중…</p>`}
      </div>`;
    return;
  }

  // 결과
  const ordered = [...room.players].sort((a, b) => (a.placement || 99) - (b.placement || 99));
  const medals = ['🥇', '🥈', '🥉', '4️⃣'];
  const rows = ordered
    .map((p) => {
      const medal = p.placement ? (p.finishRank ? medals[p.placement - 1] : '😵') : '👀';
      const meta = p.finishRank
        ? `${fmtTime(p.finishMs)} · 실수 ${p.mistakes}번`
        : p.status === 'waiting' ? '구경' : `${p.found}/${room.size} 찾음 · 탈락`;
      let lp = '<span class="muted small">랭크 미반영</span>';
      if (p.lpDelta != null) {
        const cls = p.lpDelta > 0 ? 'up' : p.lpDelta < 0 ? 'down' : '';
        lp = `<span class="lp ${cls}">${p.lpDelta > 0 ? '+' : ''}${p.lpDelta} LP</span>`;
      }
      const promo = p.promo === 'up' ? '<div class="promo up">⬆ 승급!</div>' : p.promo === 'down' ? '<div class="promo down">⬇ 강등</div>' : '';
      return `
        <div class="result-row${p.id === me.id ? ' me' : ''}">
          <span class="medal">${medal}</span>
          ${avatarHTML(p)}
          <div class="info"><div class="nm">${esc(p.name)}${p.id === me.id ? ' (나)' : ''}</div><div class="meta">${meta}</div>${tierHTML(p.rank)}</div>
          <div class="pts">${lp}${promo}${p.coinsEarned ? `<div class="coin-earn">+${p.coinsEarned}${Art.seed()}</div>` : ''}<div class="meta">🏆 ${p.wins}승</div></div>
        </div>`;
    })
    .join('');
  if (state.promoShownFor !== `${room.id}:${room.round}` && me.promo === 'up') {
    state.promoShownFor = `${room.id}:${room.round}`;
    setTimeout(() => {
      Sound.promote();
      confetti();
      toast(`⬆ 승급! ${me.rank.fullName}`);
    }, 900);
  }
  overlay.innerHTML = `
    <div class="panel">
      <h2>${room.round}판 결과 <span class="muted small">${room.roundMode === 'item' ? '아이템전' : '클래식전'}</span></h2>
      <div class="results">${rows}</div>
      ${room.ranked ? '' : '<p class="rank-note">혼자 한 판이라 랭크에 반영되지 않았어요</p>'}
      ${settingsHTML(room, isHost)}
      ${isHost
        ? `<button class="btn btn-main wide" data-action="start">다음 판 시작!</button>`
        : `<p class="muted">방장이 다음 판을 준비 중…</p>`}
      <button class="btn-text" data-action="peek">퍼즐 다시 보기</button>
    </div>`;
}

// 대기실/결과 패널이 판보다 길면 판 영역을 늘려서 잘리지 않게
function fitOverlay() {
  const overlay = $('#overlay');
  const panel = overlay.firstElementChild;
  const wrap = overlay.parentElement;
  wrap.style.minHeight = !overlay.classList.contains('hidden') && panel ? `${panel.scrollHeight + 36}px` : '';
}
window.addEventListener('resize', fitOverlay);

$('#overlay').addEventListener('click', (e) => {
  const t = e.target.closest('button');
  if (!t || t.disabled) return;
  Sound.unlock();
  if (t.dataset.size) {
    Sound.click();
    state.socket.emit('room:settings', { size: Number(t.dataset.size) });
  } else if (t.dataset.spoiler) {
    Sound.click();
    state.socket.emit('room:settings', { spoiler: t.dataset.spoiler });
  } else if (t.dataset.mode) {
    Sound.click();
    state.socket.emit('room:settings', { mode: t.dataset.mode });
  } else if (t.dataset.action === 'invite') {
    copyInvite();
  } else if (t.dataset.action === 'peek') {
    $('#overlay').classList.add('hidden');
    fitOverlay();
    toast('다시 결과를 보려면 판 아무 곳이나 누르세요');
    boardEl.addEventListener('click', () => state.room && state.room.state === 'ended' && renderOverlay(), { once: true });
  } else if (t.dataset.action === 'start') {
    t.disabled = true;
    t.textContent = '퍼즐 만드는 중… 🐹';
    state.socket.emit('game:start', {}, (res) => {
      if (!res || !res.ok) {
        toast((res && res.error) || '시작할 수 없어요');
        renderOverlay();
      }
    });
  }
});

// ---------- 친구들 화면 ----------
function renderOthers() {
  const room = state.room;
  const me = state.me;
  const container = $('#others');
  const others = room.players.filter((p) => p.id !== me.id);
  const playable = room.regions && room.state !== 'lobby';
  const key = playable ? `round:${room.round}` : `lobby:${room.size}`;

  // 나간 사람 정리
  for (const [id, o] of state.others) {
    if (!others.some((p) => p.id === id)) {
      o.el.remove();
      state.others.delete(id);
    }
  }

  for (const p of others) {
    let o = state.others.get(p.id);
    if (!o) {
      const el = document.createElement('div');
      el.className = 'other';
      el.innerHTML = `
        <div class="other-head"><div class="oh-avatar"></div><div class="oh-info"></div></div>
        <div class="mini-wrap"><div class="mini"></div><div class="mini-avatar ham-avatar talk"></div><div class="mini-blind"></div></div>`;
      o = {
        el,
        key: null,
        cells: [],
        board: '',
        avatarKey: null,
        blindEl: el.querySelector('.mini-blind'),
        headAv: el.querySelector('.oh-avatar'),
        miniAv: el.querySelector('.mini-avatar'),
      };
      state.others.set(p.id, o);
    }
    container.appendChild(o.el); // 순서 유지

    let badge;
    if (!p.online) badge = '<span class="badge">오프라인</span>';
    else if (room.state === 'lobby') badge = '<span class="badge">대기 중</span>';
    else if (p.status === 'done') badge = `<span class="badge done">${p.finishRank}등 완료</span>`;
    else if (p.status === 'out') badge = '<span class="badge out">탈락</span>';
    else badge = '';
    let seeds = '';
    for (let k = 0; k < room.maxLives; k++) seeds += Art.seed(k < p.lives);
    // 아바타는 바뀔 때만 다시 그린다 (몸짓 애니메이션이 끊기지 않게)
    const avKey = JSON.stringify(p.avatar || {});
    if (o.avatarKey !== avKey) {
      o.avatarKey = avKey;
      o.headAv.innerHTML = avatarHTML(p);
      o.miniAv.innerHTML = Avatar.svg(p.avatar);
    }
    o.el.querySelector('.oh-info').innerHTML = `
      <div class="other-who">
        <span class="other-name">${room.hostId === p.id ? '👑 ' : ''}${esc(p.name)}</span>
        ${tierHTML(p.rank)}
      </div>
      <span class="other-stat">🐹 ${playable ? p.found : 0}/${room.size} ${seeds}</span>
      ${badge}`;
    o.el.classList.toggle('offline', !p.online);

    const mini = o.el.querySelector('.mini');
    const n = room.size;
    if (o.key !== key) {
      o.key = key;
      o.board = '';
      mini.style.setProperty('--n', n);
      mini.innerHTML = '';
      o.cells = [];
      for (let i = 0; i < n * n; i++) {
        const c = document.createElement('div');
        c.className = 'cell';
        c.style.background = cellColor(i);
        mini.appendChild(c);
        o.cells.push(c);
      }
    }
    const board = playable ? p.board : '';
    for (let i = 0; i < o.cells.length; i++) {
      const v = board[i] || '0';
      if (o.board[i] === v) continue;
      o.cells[i].innerHTML = v === '1' ? Art.X : v >= '2' ? Art.hamster({ golden: v === '3' }) : '';
      o.cells[i].classList.toggle('gold-cell', v === '3');
    }
    o.board = board;
  }

  let empty = container.querySelector('.others-empty');
  if (others.length < 3) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'others-empty';
      empty.innerHTML = `빈 자리 <b class="cnt"></b><br><button class="btn btn-sub btn-sm">🔗 친구 초대하기</button>`;
      empty.querySelector('button').addEventListener('click', copyInvite);
    }
    empty.querySelector('.cnt').textContent = `${3 - others.length}개`;
    container.appendChild(empty);
  } else if (empty) {
    empty.remove();
  }

  const blur = room.spoiler === 'blur' && room.state === 'playing' && me.status === 'playing';
  container.classList.toggle('blur', blur);
  let note = $('#blur-note');
  if (blur && !note) {
    note = document.createElement('p');
    note.id = 'blur-note';
    note.className = 'blur-note';
    note.textContent = '스포 방지 모드: 다 찾거나 판이 끝나면 선명하게 보여요';
    container.after(note);
  } else if (!blur && note) {
    note.remove();
  }
}

function onPlayerEvent({ playerId, type, index }) {
  const o = state.others.get(playerId);
  if (!o || !o.cells[index]) return;
  const c = o.cells[index];
  c.classList.remove('pulse');
  void c.offsetWidth;
  c.classList.add('pulse');
  if (type === 'correct' || type === 'golden') Sound.other();
  // 친구 아바타도 같이 몸짓
  const kind = type === 'golden' ? 'gold' : type === 'correct' ? 'cheer' : 'sad';
  Avatar.react(o.miniAv, kind);
  Avatar.react(o.headAv.firstElementChild, kind);
}

// ---------- 채팅 ----------
function addChat(msg) {
  if (state.chatIds.has(msg.id)) return;
  state.chatIds.add(msg.id);
  const log = $('#chat-log');
  const nearBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
  const el = document.createElement('div');
  const time = new Date(msg.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  if (msg.type === 'system') {
    el.className = 'chat-sys';
    el.textContent = msg.text;
  } else {
    const mine = state.user && msg.userId === state.user.id;
    el.className = `chat-msg${mine ? ' mine' : ''}`;
    el.innerHTML = `<b class="chat-name">${esc(msg.name)}</b><span class="chat-text">${esc(msg.text)}</span><span class="chat-time">${time}</span>`;
  }
  log.appendChild(el);
  while (log.children.length > 80) log.firstChild.remove();
  if (nearBottom || (state.user && msg.userId === state.user.id)) log.scrollTop = log.scrollHeight;
}

$('#chat-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text || !state.socket) return;
  state.socket.emit('chat:send', { text });
  input.value = '';
});

// ---------- 이모트 ----------
$('#emotes').innerHTML = EMOTES.map((e) => `<button data-emote="${e}">${e}</button>`).join('');
$('#emotes').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !state.socket) return;
  const now = Date.now();
  if (now - state.lastEmote < 700) return;
  state.lastEmote = now;
  state.socket.emit('chat:emote', { emote: b.dataset.emote });
});

function showEmote({ playerId, emote }) {
  const host = playerId === state.user.id ? $('.board-wrap') : state.others.get(playerId) && state.others.get(playerId).el;
  if (!host) return;
  const b = document.createElement('div');
  b.className = 'emote-bubble';
  b.textContent = emote;
  host.appendChild(b);
  setTimeout(() => b.remove(), 1900);
  if (playerId !== state.user.id) Sound.other();
}

// ---------- 시작 ----------
async function boot() {
  fillHamsters();
  renderSoundBtn();
  state.pendingRoomId = roomFromPath();
  try {
    state.config = await api('/api/config');
  } catch {
    state.config = { googleClientId: '', allowGuest: true };
  }
  try {
    state.token = localStorage.getItem('hamToken');
    state.user = JSON.parse(localStorage.getItem('hamUser') || 'null');
  } catch {}
  if (state.token && state.user) connect();
  else showLogin();
}

boot();

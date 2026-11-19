// 랭크 (롤토체스식 LP)
// 브론즈 ~ 다이아: 티어마다 IV → I 4단계, 단계당 100 LP (티어당 400점)
// 마스터: 2400점 이상, 챌린저: 3000점 이상
const fs = require('fs');
const path = require('path');

const FILE = process.env.RANK_FILE || path.join(__dirname, 'data', 'ranks.json');

const TIERS = [
  { key: 'bronze', name: '브론즈', color: '#c8865a' },
  { key: 'silver', name: '실버', color: '#9fadbd' },
  { key: 'gold', name: '골드', color: '#f2b92e' },
  { key: 'platinum', name: '플래티넘', color: '#3fbfb0' },
  { key: 'emerald', name: '에메랄드', color: '#26a865' },
  { key: 'diamond', name: '다이아', color: '#4c8dff' },
  { key: 'master', name: '마스터', color: '#a35fe0' },
  { key: 'challenger', name: '챌린저', color: '#ff6a3d' },
];
const DIVISIONS = ['IV', 'III', 'II', 'I'];
const MASTER_AT = 2400;
const CHALLENGER_AT = 3000;

// 등수별 기본 LP (참가 인원별)
const PLACE_LP = {
  2: [25, -15],
  3: [30, 5, -15],
  4: [35, 15, -5, -20],
};
// 판 크기가 클수록 걸린 점수가 크다
const SIZE_MULT = { 6: 0.6, 7: 0.8, 8: 1, 9: 1.2, 12: 1.5 };
// 낮은 티어는 빨리 오르고 덜 떨어지며, 높은 티어는 반대
const GAIN_MULT = [1.5, 1.3, 1.15, 1, 1, 1, 0.9, 0.8];
const LOSS_MULT = [0.5, 0.7, 0.85, 1, 1, 1.1, 1.2, 1.3];
const PERFECT_BONUS = 5;

let db = {};
try {
  db = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  db = {};
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(FILE), { recursive: true });
      fs.writeFileSync(`${FILE}.tmp`, JSON.stringify(db, null, 1));
      fs.renameSync(`${FILE}.tmp`, FILE);
    } catch (err) {
      console.error('rank save failed', err.message);
    }
  }, 300);
}

function tierOf(rating) {
  let tier;
  let division = null;
  let lp;
  if (rating >= CHALLENGER_AT) {
    tier = 7;
    lp = rating - MASTER_AT;
  } else if (rating >= MASTER_AT) {
    tier = 6;
    lp = rating - MASTER_AT;
  } else {
    tier = Math.floor(rating / 400);
    division = DIVISIONS[Math.floor((rating % 400) / 100)];
    lp = rating % 100;
  }
  const t = TIERS[tier];
  return {
    tier,
    key: t.key,
    color: t.color,
    division,
    lp,
    rating,
    label: division ? `${t.name} ${division}` : t.name,
    fullName: `${t.name} 해바라기씨${division ? ` ${division}` : ''}`,
  };
}

// 승급/강등 판정용 단계 번호
function step(rating) {
  if (rating >= CHALLENGER_AT) return 25;
  if (rating >= MASTER_AT) return 24;
  return Math.floor(rating / 100);
}

function record(id) {
  return db[id] || { rating: 0, games: 0, wins: 0, peak: 0 };
}

function info(id) {
  const r = record(id);
  return { ...tierOf(r.rating), games: r.games, wins: r.wins, peak: r.peak };
}

// entries: [{ id, name, picture, placement, perfect }]
function applyRound(entries, size) {
  const table = PLACE_LP[Math.min(entries.length, 4)];
  const sizeMult = SIZE_MULT[size] || 1;
  const result = {};
  for (const e of entries) {
    const rec = (db[e.id] = record(e.id));
    const before = rec.rating;
    const tier = tierOf(before).tier;
    const base = table[Math.min(e.placement, table.length) - 1];
    let delta = base * sizeMult * (base >= 0 ? GAIN_MULT[tier] : LOSS_MULT[tier]);
    if (e.perfect) delta += PERFECT_BONUS;
    rec.rating = Math.max(0, before + Math.round(delta));
    rec.games += 1;
    if (e.placement === 1) rec.wins += 1;
    rec.peak = Math.max(rec.peak, rec.rating);
    rec.name = e.name;
    rec.picture = e.picture;
    rec.guest = e.id.startsWith('guest:');
    rec.updatedAt = Date.now();
    const promo = step(rec.rating) > step(before) ? 'up' : step(rec.rating) < step(before) ? 'down' : null;
    result[e.id] = { delta: rec.rating - before, promo, after: tierOf(rec.rating) };
  }
  save();
  return result;
}

function leaderboard(limit = 30) {
  return Object.entries(db)
    .filter(([, r]) => r.games > 0)
    .sort((a, b) => b[1].rating - a[1].rating || b[1].wins - a[1].wins)
    .slice(0, limit)
    .map(([id, r]) => ({
      id,
      name: r.name,
      picture: r.picture,
      guest: !!r.guest,
      games: r.games,
      wins: r.wins,
      ...tierOf(r.rating),
    }));
}

function guide() {
  return {
    tiers: TIERS.map((t, i) => ({
      ...t,
      from: i < 6 ? i * 400 : i === 6 ? MASTER_AT : CHALLENGER_AT,
    })),
    placeLp: PLACE_LP,
    sizeMult: SIZE_MULT,
    perfectBonus: PERFECT_BONUS,
  };
}

module.exports = { info, applyRound, leaderboard, guide, tierOf };

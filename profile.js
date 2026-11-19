// 유저 프로필: 해바라기씨 코인, 산 아이템, 착용 중인 아이템
const fs = require('fs');
const path = require('path');
const CATALOG = require('./public/catalog');

const FILE = process.env.PROFILE_FILE || path.join(__dirname, 'data', 'profiles.json');
const ITEMS = new Map(CATALOG.items.map((item) => [item.id, item]));
const SLOTS = CATALOG.slots.map((s) => s.key);
const STARTER_COINS = 5;

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
      console.error('profile save failed', err.message);
    }
  }, 300);
}

function emptyEquipped() {
  return Object.fromEntries(SLOTS.map((s) => [s, null]));
}

// 읽기만 할 때는 기록을 만들지 않는다
function record(id) {
  return db[id] || { coins: STARTER_COINS, owned: [], equipped: emptyEquipped() };
}
function writable(id) {
  if (!db[id]) db[id] = record(id);
  return db[id];
}

function get(id) {
  const r = record(id);
  return { coins: r.coins, owned: [...r.owned], equipped: { ...emptyEquipped(), ...r.equipped } };
}

function equipped(id) {
  return { ...emptyEquipped(), ...record(id).equipped };
}

function addCoins(id, amount) {
  if (!amount) return;
  const r = writable(id);
  r.coins = Math.max(0, r.coins + amount);
  save();
}

function buy(id, itemId) {
  const item = ITEMS.get(itemId);
  if (!item) return { ok: false, error: '없는 아이템이에요.' };
  const r = writable(id);
  if (r.owned.includes(itemId)) return { ok: false, error: '이미 가지고 있어요.' };
  if (r.coins < item.price) return { ok: false, error: `해바라기씨가 ${item.price - r.coins}개 모자라요.` };
  r.coins -= item.price;
  r.owned.push(itemId);
  r.equipped = { ...emptyEquipped(), ...r.equipped, [item.slot]: itemId };
  save();
  return { ok: true };
}

function equip(id, slot, itemId) {
  if (!SLOTS.includes(slot)) return { ok: false, error: '잘못된 부위예요.' };
  if (itemId != null) {
    const item = ITEMS.get(itemId);
    if (!item || item.slot !== slot) return { ok: false, error: '잘못된 아이템이에요.' };
    if (!record(id).owned.includes(itemId)) return { ok: false, error: '아직 사지 않은 아이템이에요.' };
  }
  const r = writable(id);
  r.equipped = { ...emptyEquipped(), ...r.equipped, [slot]: itemId || null };
  save();
  return { ok: true };
}

module.exports = { get, equipped, addCoins, buy, equip };

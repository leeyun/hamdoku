// 햄스터 퍼즐 생성기
// 규칙: 색깔 영역마다 1마리, 행/열마다 1마리, 햄스터끼리 (대각선 포함) 접촉 불가.
// 정답이 유일한 퍼즐만 반환한다.

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 행마다 한 칸씩, 열 중복 없이, 위아래 행과 인접하지 않게 배치
function randomPlacement(n, rng) {
  const sol = new Array(n);
  const used = new Array(n).fill(false);
  function place(r) {
    if (r === n) return true;
    const cols = shuffle([...Array(n).keys()], rng);
    for (const c of cols) {
      if (used[c]) continue;
      if (r > 0 && Math.abs(sol[r - 1] - c) <= 1) continue;
      used[c] = true;
      sol[r] = c;
      if (place(r + 1)) return true;
      used[c] = false;
    }
    return false;
  }
  return place(0) ? sol : null;
}

// 각 햄스터 위치를 씨앗으로 영역을 랜덤하게 키운다
function growRegions(n, sol, rng) {
  const regions = new Array(n * n).fill(-1);
  const weights = [];
  for (let r = 0; r < n; r++) {
    regions[r * n + sol[r]] = r;
    weights.push(0.25 + rng() * 3);
  }
  let remaining = n * n - n;
  while (remaining > 0) {
    const edges = [];
    let total = 0;
    for (let i = 0; i < n * n; i++) {
      if (regions[i] !== -1) continue;
      const r = Math.floor(i / n), c = i % n;
      const seen = new Set();
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        const reg = regions[nr * n + nc];
        if (reg === -1 || seen.has(reg)) continue;
        seen.add(reg);
        edges.push([i, reg]);
        total += weights[reg];
      }
    }
    let pick = rng() * total;
    let chosen = edges[edges.length - 1];
    for (const e of edges) {
      pick -= weights[e[1]];
      if (pick <= 0) { chosen = e; break; }
    }
    regions[chosen[0]] = chosen[1];
    remaining--;
  }
  return regions;
}

// limit 개수까지만 해를 찾는다 (각 해는 행별 열 번호 배열)
function findSolutions(n, regions, limit = 2) {
  const found = [];
  const sol = new Array(n);
  const usedCol = new Array(n).fill(false);
  const usedReg = new Array(n).fill(false);
  function solve(r, prevC) {
    if (r === n) { found.push(sol.slice()); return; }
    for (let c = 0; c < n; c++) {
      if (usedCol[c]) continue;
      if (prevC >= 0 && Math.abs(prevC - c) <= 1) continue;
      const reg = regions[r * n + c];
      if (usedReg[reg]) continue;
      usedCol[c] = usedReg[reg] = true;
      sol[r] = c;
      solve(r + 1, c);
      usedCol[c] = usedReg[reg] = false;
      if (found.length >= limit) return;
    }
  }
  solve(0, -1);
  return found;
}

function countSolutions(n, regions, limit = 2) {
  return findSolutions(n, regions, limit).length;
}

// 영역 reg에서 cell을 빼도 나머지가 이어져 있는지
function staysConnected(n, regions, reg, cell) {
  const cells = [];
  for (let i = 0; i < n * n; i++) if (regions[i] === reg && i !== cell) cells.push(i);
  if (cells.length === 0) return false;
  const seen = new Set([cells[0]]);
  const stack = [cells[0]];
  while (stack.length) {
    const i = stack.pop();
    const r = Math.floor(i / n), c = i % n;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nr = r + dr, nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
      const j = nr * n + nc;
      if (j === cell || seen.has(j) || regions[j] !== reg) continue;
      seen.add(j);
      stack.push(j);
    }
  }
  return seen.size === cells.length;
}

// 다른 해가 있으면, 그 해의 햄스터 칸 하나를 이웃 영역으로 옮겨 그 해를 깨뜨린다.
// 진짜 정답 칸은 건드리지 않으므로 정답은 계속 유효하다.
function repairRegions(n, regions, sol, rng, maxSteps) {
  const answer = new Set(sol.map((c, r) => r * n + c));
  for (let step = 0; step < maxSteps; step++) {
    const sols = findSolutions(n, regions, 2);
    const alt = sols.find((s) => s.some((c, r) => c !== sol[r]));
    if (!alt) return true;
    const moves = [];
    for (let r = 0; r < n; r++) {
      const cell = r * n + alt[r];
      if (answer.has(cell)) continue;
      const from = regions[cell];
      const c = alt[r];
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nc < 0 || nr >= n || nc >= n) continue;
        const to = regions[nr * n + nc];
        if (to !== from) moves.push([cell, from, to]);
      }
    }
    shuffle(moves, rng);
    const move = moves.find(([cell, from]) => staysConnected(n, regions, from, cell));
    if (!move) return false;
    regions[move[0]] = move[2];
  }
  return false;
}

// 영역 번호를 왼쪽 위부터 등장 순서대로 다시 매겨 색이 고르게 섞이도록 한다
function relabel(n, regions, sol) {
  const map = new Map();
  const out = regions.map((reg) => {
    if (!map.has(reg)) map.set(reg, map.size);
    return map.get(reg);
  });
  return { regions: out, solution: sol };
}

function generatePuzzle(n, rng = Math.random) {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const sol = randomPlacement(n, rng);
    if (!sol) continue;
    const regions = growRegions(n, sol, rng);
    if (repairRegions(n, regions, sol, rng, n * 6)) {
      return { size: n, ...relabel(n, regions, sol), attempts: attempt + 1 };
    }
  }
  throw new Error('퍼즐 생성 실패');
}

module.exports = { generatePuzzle, countSolutions, findSolutions };

// 서버가 워커 스레드로 실행하면 퍼즐 하나를 만들어 돌려준다
const { isMainThread, parentPort, workerData } = require('worker_threads');
if (!isMainThread && workerData && workerData.size) {
  parentPort.postMessage(generatePuzzle(workerData.size));
}

// 직접 그린 햄스터 / 해바라기씨 SVG
const Art = (() => {
  let uid = 0;

  const FUR = {
    normal: { light: '#ffcf9e', dark: '#eea56a', ear: '#e7955a', stripe: '#e08c52', whisker: '#c98a62' },
    golden: { light: '#fff3a6', dark: '#f2b705', ear: '#e0a800', stripe: '#d99a00', whisker: '#b98a00' },
  };

  function hamster({ sad = false, golden = false } = {}) {
    const id = `h${++uid}`;
    const f = golden ? FUR.golden : FUR.normal;
    const eyes = sad
      ? `<path d="M30 54 q6 -5 12 0" class="eye-line"/><path d="M58 54 q6 -5 12 0" class="eye-line"/>`
      : `<g class="eyes">
           <ellipse cx="36" cy="54" rx="5.2" ry="6" fill="#3b2a22"/>
           <ellipse cx="64" cy="54" rx="5.2" ry="6" fill="#3b2a22"/>
           <circle cx="37.8" cy="51.6" r="1.9" fill="#fff"/>
           <circle cx="65.8" cy="51.6" r="1.9" fill="#fff"/>
         </g>`;
    const shine = golden
      ? `<path class="gold-shine" d="M84 14 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z" fill="#fff"/>
         <path class="gold-shine s2" d="M12 76 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8z" fill="#fff"/>`
      : '';
    return `
<svg class="hamster-svg${golden ? ' golden' : ''}" viewBox="0 0 100 100" aria-hidden="true">
  <defs>
    <radialGradient id="${id}f" cx="50%" cy="40%" r="65%">
      <stop offset="0" stop-color="${f.light}"/>
      <stop offset="1" stop-color="${f.dark}"/>
    </radialGradient>
  </defs>
  <g class="ears">
    <ellipse cx="22" cy="30" rx="13" ry="12" fill="${f.ear}"/>
    <ellipse cx="22" cy="31" rx="7.5" ry="7" fill="#f6b8a8"/>
    <ellipse cx="78" cy="30" rx="13" ry="12" fill="${f.ear}"/>
    <ellipse cx="78" cy="31" rx="7.5" ry="7" fill="#f6b8a8"/>
  </g>
  <ellipse cx="50" cy="58" rx="41" ry="35" fill="url(#${id}f)"/>
  <path d="M50 24 q-4 8 0 14 q4 -6 0 -14z" fill="${f.stripe}" opacity=".7"/>
  <ellipse cx="50" cy="72" rx="27" ry="19" fill="#fff6ea"/>
  ${eyes}
  <ellipse cx="25" cy="67" rx="7" ry="4.5" fill="#ff8f8f" opacity=".55"/>
  <ellipse cx="75" cy="67" rx="7" ry="4.5" fill="#ff8f8f" opacity=".55"/>
  <ellipse cx="50" cy="63.5" rx="3.6" ry="2.6" fill="#e9737a"/>
  <path d="M43.5 68 q3.2 3.6 6.5 0 q3.3 3.6 6.5 0" fill="none" stroke="#7a4a3a" stroke-width="2" stroke-linecap="round"/>
  <path d="M14 60 l-9 -2 M14 64 l-9 2 M86 60 l9 -2 M86 64 l9 2" stroke="${f.whisker}" stroke-width="1.5" stroke-linecap="round" opacity=".7"/>
  ${shine}
</svg>`;
  }

  function seed(on = true) {
    return `
<svg class="seed ${on ? '' : 'lost'}" viewBox="0 0 24 34" aria-hidden="true">
  <path d="M12 1.5 C21 9 22 23 12 32.5 C2 23 3 9 12 1.5Z" fill="#4e3b2f"/>
  <path d="M12 4.5 C17 11 17 23 12 29" stroke="#efe3cf" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M12 4.5 C7 11 7 23 12 29" stroke="#efe3cf" stroke-width="2.2" fill="none" stroke-linecap="round"/>
</svg>`;
  }

  // 랭크 티어 아이콘: 티어 색 해바라기씨 (마스터는 별, 챌린저는 왕관)
  function tier(key, color) {
    const id = `t${++uid}`;
    const top =
      key === 'challenger'
        ? `<path d="M5 9 L8 3 L12 7 L16 3 L19 9 Z" fill="#ffd34e" stroke="#c98a00" stroke-width="1"/>`
        : key === 'master'
          ? `<path d="M12 1 l1.6 3.4 3.6 .5 -2.6 2.5 .6 3.6 -3.2 -1.7 -3.2 1.7 .6 -3.6 -2.6 -2.5 3.6 -.5z" fill="#fff3a6" stroke="#b98a00" stroke-width=".8"/>`
          : '';
    return `
<svg class="tier-icon" viewBox="0 0 24 36" aria-hidden="true">
  <defs>
    <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
      <stop offset=".5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <path d="M12 6 C21 12 22 25 12 34.5 C2 25 3 12 12 6Z" fill="${color}" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
  <path d="M12 6 C21 12 22 25 12 34.5 C2 25 3 12 12 6Z" fill="url(#${id})"/>
  <path d="M12 9.5 C16 15 16 25 12 31 M12 9.5 C8 15 8 25 12 31" stroke="rgba(255,255,255,.75)" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  ${top}
</svg>`;
  }

  const X = `<svg class="x-mark" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5 L15 15 M15 5 L5 15" stroke="#fff" stroke-width="3.4" stroke-linecap="round"/></svg>`;

  return { hamster, seed, tier, X };
})();

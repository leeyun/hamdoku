// 유저 아바타: 전신 햄스터 + 모자/옷/등날개 (viewBox 0 0 120 120)
// 레이어 순서: 날개 → 발 → 몸 → 옷 → 머리 → 목장식 → 팔 → 모자
const Avatar = (() => {
  let uid = 0;

  // 왼쪽 날개를 그리고 오른쪽은 거울처럼 뒤집는다
  function pair(left) {
    return `<g class="av-wing-l">${left}</g><g class="av-wing-r"><g transform="translate(120 0) scale(-1 1)">${left}</g></g>`;
  }

  const WINGS = {
    wings_bee: () =>
      pair(`<ellipse cx="30" cy="62" rx="20" ry="11" transform="rotate(-28 30 62)" fill="#e3f6ff" fill-opacity=".85" stroke="#8ccbe8" stroke-width="1.5"/>
            <ellipse cx="32" cy="80" rx="14" ry="8" transform="rotate(12 32 80)" fill="#e3f6ff" fill-opacity=".85" stroke="#8ccbe8" stroke-width="1.5"/>`),
    wings_butterfly: () =>
      pair(`<path d="M52 76 C34 38 4 44 8 68 C11 84 34 88 52 82 Z" fill="#ff8fb1" stroke="#e0607f" stroke-width="1.5"/>
            <path d="M52 86 C38 92 18 106 28 112 C38 116 48 102 52 90 Z" fill="#c8a2ff" stroke="#9a6ee0" stroke-width="1.5"/>
            <circle cx="24" cy="62" r="5" fill="#fff" fill-opacity=".7"/><circle cx="36" cy="72" r="3" fill="#fff" fill-opacity=".7"/>`),
    wings_bat: () =>
      pair(`<path d="M50 74 L12 52 L16 66 L4 68 L12 80 L2 90 L20 90 L28 100 L50 86 Z" fill="#5c4d7d" stroke="#3e3358" stroke-width="1.5" stroke-linejoin="round"/>
            <path d="M48 76 L16 62 M46 82 L14 82 M46 86 L26 96" stroke="#7e6ca6" stroke-width="1.2"/>`),
    wings_angel: () =>
      pair(`<path d="M52 72 C34 48 8 48 4 62 C12 62 8 72 16 74 C10 80 16 88 26 86 C24 94 38 96 52 86 Z" fill="#fff" stroke="#c9d8ee" stroke-width="1.8"/>
            <path d="M44 74 C34 66 22 64 14 66 M44 80 C34 76 26 78 20 80" stroke="#dbe5f4" stroke-width="1.5" fill="none"/>`),
    wings_phoenix: (id) =>
      pair(`<defs><linearGradient id="${id}ph" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffd23f"/><stop offset=".55" stop-color="#ff8a00"/><stop offset="1" stop-color="#ff3d00"/></linearGradient></defs>
            <path d="M52 74 C38 50 18 36 2 40 C12 48 6 54 14 60 C4 64 8 72 18 74 C10 82 20 90 32 86 C32 96 46 94 52 84 Z" fill="url(#${id}ph)" stroke="#e05200" stroke-width="1.2"/>
            <path d="M46 76 C36 62 24 54 14 50" stroke="#ffe27a" stroke-width="2" fill="none" stroke-linecap="round"/>`),
  };

  // under: 몸 위(머리 아래), over: 머리 위(목장식)
  const OUTFITS = {
    outfit_scarf: () => ({
      over: `<path d="M32 74 Q60 88 88 74 L89 82 Q60 97 31 82 Z" fill="#e63946"/>
             <path d="M38 79 L40 86 M50 83 L51 90 M60 85 L60 92 M70 83 L69 90 M82 79 L80 86" stroke="#fff" stroke-width="2" opacity=".7"/>
             <path d="M70 86 L80 106 L71 108 L63 88 Z" fill="#d62839"/>
             <path d="M72 102 L80 106 M69 98 L77 102" stroke="#fff" stroke-width="1.5" opacity=".7"/>`,
    }),
    outfit_stripe: (id) => ({
      under: `<defs><clipPath id="${id}st"><path d="M31 76 Q29 100 36 109 L84 109 Q91 100 89 76 Q60 68 31 76 Z"/></clipPath></defs>
              <path d="M31 76 Q29 100 36 109 L84 109 Q91 100 89 76 Q60 68 31 76 Z" fill="#fff"/>
              <g clip-path="url(#${id}st)" fill="#4a90d9"><rect x="20" y="82" width="80" height="4.5"/><rect x="20" y="92" width="80" height="4.5"/><rect x="20" y="102" width="80" height="4.5"/></g>`,
    }),
    outfit_overalls: () => ({
      under: `<path d="M33 92 Q33 110 45 110 L75 110 Q87 110 87 92 Z" fill="#3d6fb6"/>
              <path d="M45 78 L75 78 L77 95 L43 95 Z" fill="#3d6fb6"/>
              <path d="M46 79 L40 70 M74 79 L80 70" stroke="#3d6fb6" stroke-width="5" stroke-linecap="round"/>
              <circle cx="48" cy="83" r="2.6" fill="#ffd34e"/><circle cx="72" cy="83" r="2.6" fill="#ffd34e"/>
              <rect x="54" y="84" width="12" height="8" rx="2" fill="#2f5a99"/>`,
    }),
    outfit_raincoat: () => ({
      under: `<path d="M30 76 Q27 104 37 111 L83 111 Q93 104 90 76 Q60 67 30 76 Z" fill="#ffd23f" stroke="#e8b400" stroke-width="1.5"/>
              <path d="M60 78 L60 110" stroke="#e8b400" stroke-width="2"/>
              <circle cx="65" cy="86" r="2.3" fill="#3b82c4"/><circle cx="65" cy="96" r="2.3" fill="#3b82c4"/><circle cx="65" cy="106" r="2.3" fill="#3b82c4"/>
              <path d="M38 98 L50 98 L50 104 L38 104 Z" fill="#f5c400"/>`,
      over: `<path d="M34 74 Q60 86 86 74 L84 80 Q60 92 36 80 Z" fill="#f5c400"/>`,
    }),
    outfit_tux: () => ({
      under: `<path d="M30 76 Q27 104 37 111 L83 111 Q93 104 90 76 Q60 67 30 76 Z" fill="#2b2d42"/>
              <path d="M49 76 L60 106 L71 76 Z" fill="#fff"/>
              <path d="M49 76 L56 90 L50 92 Z M71 76 L64 90 L70 92 Z" fill="#3d405b"/>
              <circle cx="60" cy="94" r="1.6" fill="#2b2d42"/><circle cx="60" cy="100" r="1.6" fill="#2b2d42"/>`,
      over: `<path d="M60 80 L49 74 L49 86 Z M60 80 L71 74 L71 86 Z" fill="#d62839"/><circle cx="60" cy="80" r="3" fill="#a81d2d"/>`,
    }),
  };

  function sunflower(cx, cy, r) {
    let petals = '';
    for (let k = 0; k < 10; k++) {
      petals += `<ellipse cx="${cx}" cy="${cy - r}" rx="${r * 0.42}" ry="${r * 0.75}" fill="#ffcf2e" transform="rotate(${k * 36} ${cx} ${cy})"/>`;
    }
    return `${petals}<circle cx="${cx}" cy="${cy}" r="${r * 0.62}" fill="#7a4a2a"/><circle cx="${cx - 1}" cy="${cy - 1}" r="${r * 0.25}" fill="#9a6a44"/>`;
  }

  const HATS = {
    hat_ribbon: () => `<path d="M76 20 L63 11 Q58 21 63 30 Z" fill="#ff5f7e"/><path d="M76 20 L89 11 Q94 21 89 30 Z" fill="#ff5f7e"/>
                       <path d="M76 20 L66 16 M76 20 L86 16" stroke="#e0405f" stroke-width="1.5"/><circle cx="76" cy="20" r="4.2" fill="#e0405f"/>`,
    hat_sunflower: () => `<path d="M40 30 L36 20" stroke="#4f9a3a" stroke-width="3" stroke-linecap="round"/>${sunflower(38, 18, 8)}`,
    hat_beanie: () => `<path d="M27 34 Q28 5 60 5 Q92 5 93 34 Z" fill="#6fa8dc"/>
                       <path d="M40 10 L40 32 M50 6 L50 32 M60 5 L60 32 M70 6 L70 32 M80 10 L80 32" stroke="#5b94c8" stroke-width="2"/>
                       <path d="M25 30 Q60 41 95 30 L95 38 Q60 49 25 38 Z" fill="#4f86c0"/>
                       <circle cx="60" cy="5" r="7" fill="#fff" stroke="#dfe8f2" stroke-width="1.5"/>`,
    hat_straw: () => `<ellipse cx="60" cy="27" rx="46" ry="9" fill="#e9c46a" stroke="#c9a24a" stroke-width="1.5"/>
                      <path d="M37 27 Q37 7 60 7 Q83 7 83 27 Z" fill="#f2d48a" stroke="#c9a24a" stroke-width="1.5"/>
                      <path d="M37 21 Q60 26 83 21 L83 26 Q60 31 37 26 Z" fill="#e76f51"/>`,
    hat_crown: () => `<path d="M40 26 L42 6 L51 15 L60 2 L69 15 L78 6 L80 26 Z" fill="#ffd34e" stroke="#c99700" stroke-width="1.8" stroke-linejoin="round"/>
                      <rect x="39" y="22" width="42" height="7" rx="2" fill="#f2b705" stroke="#c99700" stroke-width="1.5"/>
                      <circle cx="60" cy="14" r="3" fill="#e63946"/><circle cx="48" cy="18" r="2.2" fill="#4c8dff"/><circle cx="72" cy="18" r="2.2" fill="#26a865"/>
                      <circle cx="42" cy="6" r="2" fill="#fff3a6"/><circle cx="60" cy="2" r="2" fill="#fff3a6"/><circle cx="78" cy="6" r="2" fill="#fff3a6"/>`,
  };

  function svg(equipped = {}) {
    const id = `av${++uid}`;
    const wings = equipped.wings && WINGS[equipped.wings] ? WINGS[equipped.wings](id) : '';
    const outfit = equipped.outfit && OUTFITS[equipped.outfit] ? OUTFITS[equipped.outfit](id) : {};
    const hat = equipped.hat && HATS[equipped.hat] ? HATS[equipped.hat](id) : '';
    return `
<svg class="avatar-svg" viewBox="0 0 120 120" aria-hidden="true">
  <defs>
    <radialGradient id="${id}f" cx="50%" cy="35%" r="70%"><stop offset="0" stop-color="#ffcf9e"/><stop offset="1" stop-color="#eea56a"/></radialGradient>
  </defs>
  <g class="av-all">
    <g class="av-wings">${wings}</g>
    <ellipse cx="47" cy="110" rx="8" ry="4.5" fill="#e0905a"/>
    <ellipse cx="73" cy="110" rx="8" ry="4.5" fill="#e0905a"/>
    <ellipse cx="60" cy="86" rx="30" ry="25" fill="url(#${id}f)"/>
    <ellipse cx="60" cy="92" rx="18" ry="15" fill="#fff6ea"/>
    ${outfit.under || ''}
    <g class="av-head">
      <circle cx="34" cy="27" r="10" fill="#e7955a"/><circle cx="34" cy="28" r="5.5" fill="#f6b8a8"/>
      <circle cx="86" cy="27" r="10" fill="#e7955a"/><circle cx="86" cy="28" r="5.5" fill="#f6b8a8"/>
      <ellipse cx="60" cy="50" rx="34" ry="28" fill="url(#${id}f)"/>
      <path d="M60 22 q-3 7 0 12 q3 -5 0 -12z" fill="#e08c52" opacity=".7"/>
      <ellipse cx="60" cy="61" rx="20" ry="13" fill="#fff6ea"/>
      <g class="av-eyes">
        <ellipse cx="48" cy="49" rx="4" ry="4.6" fill="#3b2a22"/><ellipse cx="72" cy="49" rx="4" ry="4.6" fill="#3b2a22"/>
        <circle cx="49.4" cy="47.2" r="1.5" fill="#fff"/><circle cx="73.4" cy="47.2" r="1.5" fill="#fff"/>
      </g>
      <ellipse cx="37" cy="58" rx="6" ry="3.8" fill="#ff8f8f" opacity=".55"/><ellipse cx="83" cy="58" rx="6" ry="3.8" fill="#ff8f8f" opacity=".55"/>
      <ellipse cx="60" cy="56" rx="2.8" ry="2" fill="#e9737a"/>
      <path class="av-mouth" d="M55 59.5 q2.5 3 5 0 q2.5 3 5 0" fill="none" stroke="#7a4a3a" stroke-width="1.6" stroke-linecap="round"/>
    </g>
    ${outfit.over || ''}
    <g class="av-arm-l"><ellipse cx="36" cy="86" rx="6.5" ry="9" transform="rotate(25 36 86)" fill="#e7955a"/></g>
    <g class="av-arm-r"><ellipse cx="84" cy="86" rx="6.5" ry="9" transform="rotate(-25 84 86)" fill="#e7955a"/></g>
    <g class="av-hat">${hat}</g>
  </g>
</svg>`;
  }

  // 작은 원형 아바타 (목록용)
  function html(equipped, cls = '') {
    return `<div class="ham-avatar ${cls}">${svg(equipped || {})}</div>`;
  }

  const CHEERS = ['앗싸!', '찾았다!', '히힛', '럭키!', '최고!', '냠냠!'];
  const SADS = ['앗…', '힝', '으앙'];

  // 귀여운 몸짓: kind = cheer | sad | gold | done
  function react(el, kind = 'cheer', text) {
    if (!el) return;
    const anim = kind === 'sad' ? 'sad' : 'cheer';
    el.classList.remove('cheer', 'sad');
    void el.offsetWidth;
    el.classList.add(anim);
    clearTimeout(el._avTimer);
    el._avTimer = setTimeout(() => el.classList.remove(anim), 1000);
    const say =
      text ||
      (kind === 'gold' ? '황금이다!!' : kind === 'done' ? '다 찾았다!' : kind === 'sad' ? SADS[Math.floor(Math.random() * SADS.length)] : CHEERS[Math.floor(Math.random() * CHEERS.length)]);
    if (!el.classList.contains('talk')) return;
    const old = el.querySelector('.av-bubble');
    if (old) old.remove();
    const b = document.createElement('div');
    b.className = `av-bubble${kind === 'sad' ? ' sad' : ''}${kind === 'gold' ? ' gold' : ''}`;
    b.textContent = say;
    el.appendChild(b);
    setTimeout(() => b.remove(), 1300);
  }

  return { svg, html, react };
})();

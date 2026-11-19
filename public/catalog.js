// 상점 아이템 목록 (서버와 브라우저가 같이 씀)
(function (root) {
  const CATALOG = {
    slots: [
      { key: 'hat', name: '모자', icon: '🎩' },
      { key: 'outfit', name: '옷', icon: '👕' },
      { key: 'wings', name: '등날개', icon: '🪽' },
    ],
    items: [
      { id: 'hat_ribbon', slot: 'hat', name: '빨간 리본', price: 3 },
      { id: 'hat_sunflower', slot: 'hat', name: '해바라기 핀', price: 5 },
      { id: 'hat_beanie', slot: 'hat', name: '방울 비니', price: 8 },
      { id: 'hat_straw', slot: 'hat', name: '밀짚모자', price: 12 },
      { id: 'hat_crown', slot: 'hat', name: '황금 왕관', price: 20 },

      { id: 'outfit_scarf', slot: 'outfit', name: '빨간 목도리', price: 3 },
      { id: 'outfit_stripe', slot: 'outfit', name: '줄무늬 티셔츠', price: 5 },
      { id: 'outfit_overalls', slot: 'outfit', name: '멜빵바지', price: 8 },
      { id: 'outfit_raincoat', slot: 'outfit', name: '노란 우비', price: 12 },
      { id: 'outfit_tux', slot: 'outfit', name: '턱시도', price: 20 },

      { id: 'wings_bee', slot: 'wings', name: '꿀벌 날개', price: 3 },
      { id: 'wings_butterfly', slot: 'wings', name: '나비 날개', price: 5 },
      { id: 'wings_bat', slot: 'wings', name: '박쥐 날개', price: 8 },
      { id: 'wings_angel', slot: 'wings', name: '천사 날개', price: 12 },
      { id: 'wings_phoenix', slot: 'wings', name: '불사조 날개', price: 20 },
    ],
  };
  if (typeof module === 'object' && module.exports) module.exports = CATALOG;
  else root.CATALOG = CATALOG;
})(this);

// Web Audio로 직접 합성하는 효과음 (파일 없음)
const Sound = (() => {
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem('hamMuted') === '1'; } catch {}

  function ac() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone({ freq, to, dur = 0.1, type = 'sine', vol = 0.15, delay = 0, vibrato = 0 }) {
    if (muted) return;
    const c = ac();
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    if (vibrato) {
      const lfo = c.createOscillator();
      const lg = c.createGain();
      lfo.frequency.value = 28;
      lg.gain.value = vibrato;
      lfo.connect(lg).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  return {
    get muted() { return muted; },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('hamMuted', muted ? '1' : '0'); } catch {}
      return muted;
    },
    unlock() { if (!muted) ac(); },
    // 햄스터 발견: "뀨잇뀨!"
    found() {
      tone({ freq: 1150, to: 1750, dur: 0.1, vol: 0.16, vibrato: 40 });
      tone({ freq: 1350, to: 2100, dur: 0.13, vol: 0.16, delay: 0.12, vibrato: 50 });
      tone({ freq: 2600, to: 3200, dur: 0.09, type: 'triangle', vol: 0.05, delay: 0.27 });
    },
    wrong() {
      tone({ freq: 330, to: 170, dur: 0.28, type: 'triangle', vol: 0.18 });
      tone({ freq: 250, to: 140, dur: 0.22, type: 'sine', vol: 0.08, delay: 0.05 });
    },
    mark() { tone({ freq: 760, to: 620, dur: 0.045, vol: 0.04 }); },
    unmark() { tone({ freq: 560, to: 680, dur: 0.045, vol: 0.035 }); },
    other() { tone({ freq: 1500, to: 1950, dur: 0.07, vol: 0.035, vibrato: 30 }); },
    click() { tone({ freq: 900, to: 1100, dur: 0.05, type: 'triangle', vol: 0.06 }); },
    win() {
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', vol: 0.12, delay: i * 0.11 }));
      tone({ freq: 1400, to: 2200, dur: 0.14, vol: 0.12, delay: 0.5, vibrato: 50 });
      tone({ freq: 1600, to: 2400, dur: 0.16, vol: 0.12, delay: 0.66, vibrato: 60 });
    },
    lose() {
      [440, 392, 330, 262].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'triangle', vol: 0.1, delay: i * 0.15 }));
    },
    // 황금 햄스터: 반짝이는 글리산도
    golden() {
      [1047, 1319, 1568, 2093, 2637].forEach((f, i) => tone({ freq: f, dur: 0.12, type: 'triangle', vol: 0.09, delay: i * 0.06 }));
      tone({ freq: 1300, to: 2100, dur: 0.12, vol: 0.14, delay: 0.34, vibrato: 50 });
    },
    // 햄스터 댄스: 통통 튀는 짧은 멜로디
    dance() {
      [659, 784, 659, 988, 880, 784, 1047].forEach((f, i) =>
        tone({ freq: f, dur: 0.11, type: i % 2 ? 'triangle' : 'square', vol: i % 2 ? 0.09 : 0.04, delay: i * 0.12 }),
      );
    },
    hint() {
      tone({ freq: 880, dur: 0.1, type: 'sine', vol: 0.1 });
      tone({ freq: 1320, dur: 0.16, type: 'sine', vol: 0.1, delay: 0.1 });
    },
    chat() { tone({ freq: 1200, to: 1400, dur: 0.05, type: 'sine', vol: 0.04 }); },
    promote() {
      [523, 784, 1047, 1568].forEach((f, i) => tone({ freq: f, dur: 0.22, type: 'triangle', vol: 0.11, delay: i * 0.13 }));
    },
  };
})();

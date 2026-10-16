// Fizzy battery liquid for the earbud cards on the dashboard.
// Styles: 'soda', 'sparkle', 'goo' (Bubble Pop) and 'classic' (the original blurred liquid).
// The chosen style is stored as data-battery on .buds-container; the CSS lives in style.css.

const WAVE = (cls) =>
  `<svg class="wave ${cls}" viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">` +
  `<path d="M0 7 Q12.5 0 25 7 T50 7 T75 7 T100 7 T125 7 T150 7 T175 7 T200 7 V14 H0 Z"/></svg>`;

// every = ms between bubbles, size/dur = random ranges, wob = side-to-side wobble in px
const STYLES = {
  soda:    { every: 260, size: [3, 9],   dur: [2.4, 4.2], cls: 'b-soda',  wob: 6 },
  sparkle: { every: 100, size: [1.5, 3], dur: [1.2, 2.0], cls: 'b-spark', wob: 1.5, streams: [0.25, 0.48, 0.72] },
  goo:     { every: 480, size: [14, 30], dur: [2.8, 4.4], cls: 'b-goo',   wob: 9, overshoot: [16, 40] },
  classic: null
};

export const BATTERY_STYLES = Object.keys(STYLES);

const rnd = (a, b) => a + Math.random() * (b - a);

export class FizzBattery {
  constructor(container) {
    this.container = container;
    this.style = 'classic';
    this.reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.buds = {};
    if (!container) return;

    container.querySelectorAll('.bud-card').forEach(card => {
      const liquid = card.querySelector('.bud-liquid');
      if (!liquid) return;

      // Wrap the liquid in a layer that the Bubble Pop "goo" filter can be applied to
      const layer = document.createElement('div');
      layer.className = 'liquid-layer';
      liquid.parentNode.insertBefore(layer, liquid);
      layer.appendChild(liquid);

      liquid.insertAdjacentHTML('beforeend', WAVE('back') + WAVE('front') + '<div class="bubbles"></div>');

      const shade = document.createElement('div');
      shade.className = 'liquid-shade';
      layer.after(shade);

      card.classList.add('empty'); // no reading yet: hide waves/surface effects
      const bud = { card, liquid, host: liquid.querySelector('.bubbles'), level: 0, charging: false };
      this.buds[card.dataset.side] = bud;
      setTimeout(() => this.spawn(bud), rnd(0, 600));
    });
  }

  setStyle(style) {
    this.style = style in STYLES ? style : 'soda';
    if (this.container) this.container.dataset.battery = this.style;
    Object.values(this.buds).forEach(b => b.host.replaceChildren());
  }

  // side: 'left' | 'right', level: 0-100, charging: boolean
  set(side, level, charging) {
    const bud = this.buds[side];
    if (!bud) return;
    const lvl = Math.max(0, Math.min(100, Number(level) || 0));
    if (lvl !== bud.level) bud.host.replaceChildren(); // bubbles in flight would aim for the old surface
    bud.level = lvl;
    bud.charging = !!charging;
    bud.card.style.setProperty('--level', lvl);
    bud.card.classList.toggle('charging', bud.charging);
    bud.card.classList.toggle('empty', lvl === 0);
  }

  spawn(bud) {
    const cfg = STYLES[this.style];
    let wait = 400;

    if (cfg) {
      if (bud.level > 2 && !document.hidden) this.addBubble(bud, cfg);
      wait = cfg.every * (bud.charging ? 0.33 : 1) * (this.reduceMotion ? 4 : 1);
    }
    setTimeout(() => this.spawn(bud), rnd(wait * 0.5, wait * 1.5));
  }

  addBubble(bud, cfg) {
    const cardH = bud.card.clientHeight;
    const liquidH = cardH * bud.level / 100;
    if (liquidH < 10) return;

    const size = rnd(cfg.size[0], cfg.size[1]) * (cfg.overshoot ? Math.min(1, 0.45 + bud.level / 100) : 1);
    const x = cfg.streams
      ? cfg.streams[Math.floor(Math.random() * cfg.streams.length)] * 100 + rnd(-2, 2)
      : rnd(12, 88);
    const rise = cfg.overshoot ? liquidH + rnd(cfg.overshoot[0], cfg.overshoot[1]) : liquidH - size;
    const dur = rnd(cfg.dur[0], cfg.dur[1]) * (bud.charging ? 0.65 : 1) * Math.min(1, 0.45 + liquidH / 320);

    const b = document.createElement('span');
    b.className = 'bubble ' + cfg.cls;
    b.style.cssText =
      `width:${size}px;height:${size}px;left:calc(${x}% - ${size / 2}px);` +
      `--h:${rise}px;--dur:${dur}s;--wob:${rnd(-cfg.wob, cfg.wob)}px`;
    b.addEventListener('animationend', () => b.remove());
    bud.host.appendChild(b);
  }
}

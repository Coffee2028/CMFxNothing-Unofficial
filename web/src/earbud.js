// See-through earbud drawing used on the gestures screen.
// Drawn as the right earbud; the left one is the same drawing mirrored.
// Parts with a class are animated from main.js (fingers, contact glow, hold ring).

export const PINCH_Y = 131; // middle of the pinch area on the stem

export function earbudSVG(side) {
  const id = `eb-${side}`;
  const mirror = side === 'left' ? 'transform="translate(160 0) scale(-1 1)"' : '';
  const dot = side === 'right' ? 'var(--accent)' : '#f2f2f2';

  return `
<svg class="earbud-svg" viewBox="0 0 160 300" aria-hidden="true">
  <defs>
    <linearGradient id="${id}-glass" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0.04"/>
      <stop offset="0.18" stop-color="#fff" stop-opacity="0.22"/>
      <stop offset="0.32" stop-color="#fff" stop-opacity="0.05"/>
      <stop offset="0.8" stop-color="#fff" stop-opacity="0.03"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0.12"/>
    </linearGradient>
    <radialGradient id="${id}-shell" cx="0.38" cy="0.32" r="0.75">
      <stop offset="0" stop-color="#fff" stop-opacity="0.2"/>
      <stop offset="0.55" stop-color="#fff" stop-opacity="0.05"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0.1"/>
    </radialGradient>
    <radialGradient id="${id}-driver" cx="0.4" cy="0.35" r="0.7">
      <stop offset="0" stop-color="#3a3a3a"/>
      <stop offset="1" stop-color="#0c0c0c"/>
    </radialGradient>
    <linearGradient id="${id}-tip" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#3b3b3b"/>
      <stop offset="0.5" stop-color="#1a1a1a"/>
      <stop offset="1" stop-color="#0d0d0d"/>
    </linearGradient>
    <linearGradient id="${id}-cell" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#151515"/>
      <stop offset="0.35" stop-color="#3a3a3a"/>
      <stop offset="1" stop-color="#101010"/>
    </linearGradient>
    <radialGradient id="${id}-glow">
      <stop offset="0" stop-color="var(--accent)" stop-opacity="0.95"/>
      <stop offset="0.45" stop-color="var(--accent)" stop-opacity="0.35"/>
      <stop offset="1" stop-color="var(--accent)" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <g ${mirror}>
    <!-- ear tip -->
    <path d="M44 58 C26 56 16 70 18 84 C20 98 34 104 46 96 L56 88 L54 64 Z" fill="url(#${id}-tip)"/>
    <path d="M28 66 C24 72 24 82 28 88" fill="none" stroke="#fff" stroke-opacity="0.12" stroke-width="2" stroke-linecap="round"/>
    <rect x="48" y="66" width="14" height="22" rx="5" fill="#161616"/>

    <!-- head -->
    <ellipse cx="88" cy="70" rx="42" ry="38" fill="url(#${id}-shell)" stroke="#fff" stroke-opacity="0.22" stroke-width="1.2"/>
    <circle cx="90" cy="68" r="24" fill="url(#${id}-driver)" stroke="#fff" stroke-opacity="0.08"/>
    <circle cx="90" cy="68" r="15" fill="none" stroke="#fff" stroke-opacity="0.1"/>
    <circle cx="90" cy="68" r="6" fill="#222" stroke="#fff" stroke-opacity="0.15"/>
    <circle cx="86" cy="64" r="1.6" fill="#fff" fill-opacity="0.5"/>
    <path d="M60 50 C68 38 84 33 98 35" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2" stroke-linecap="round"/>

    <!-- stem: clear shell with the parts visible inside -->
    <rect x="80" y="90" width="34" height="192" rx="17" fill="url(#${id}-glass)" stroke="#fff" stroke-opacity="0.24" stroke-width="1.2"/>
    <rect class="eb-zone" x="86" y="104" width="22" height="54" rx="11" fill="#fff" fill-opacity="0.05" stroke="#fff" stroke-opacity="0.14"/>
    <g stroke="#fff" stroke-opacity="0.18" stroke-width="1" stroke-linecap="round">
      <line x1="91" y1="118" x2="103" y2="118"/>
      <line x1="91" y1="126" x2="103" y2="126"/>
      <line x1="91" y1="134" x2="103" y2="134"/>
      <line x1="91" y1="142" x2="103" y2="142"/>
    </g>
    <rect x="94" y="160" width="6" height="86" rx="2" fill="#242424"/>
    <g fill="#9a9a9a" fill-opacity="0.55">
      <circle cx="97" cy="164" r="0.9"/><circle cx="97" cy="238" r="0.9"/><circle cx="97" cy="242" r="0.9"/>
    </g>
    <rect x="87" y="168" width="20" height="62" rx="10" fill="url(#${id}-cell)" stroke="#fff" stroke-opacity="0.08"/>
    <line x1="92" y1="176" x2="92" y2="222" stroke="#fff" stroke-opacity="0.18" stroke-linecap="round"/>
    <circle cx="97" cy="250" r="3.6" fill="${dot}"/>
    <circle cx="97" cy="266" r="6" fill="#0d0d0d" stroke="#fff" stroke-opacity="0.12"/>
    <g fill="#fff" fill-opacity="0.35">
      <circle cx="95" cy="264.5" r="0.8"/><circle cx="99" cy="264.5" r="0.8"/>
      <circle cx="95" cy="268" r="0.8"/><circle cx="99" cy="268" r="0.8"/>
    </g>
    <path d="M86 98 L86 274" stroke="#fff" stroke-opacity="0.28" stroke-width="1.6" stroke-linecap="round"/>

    <!-- pinch animation parts -->
    <circle class="eb-ring" cx="97" cy="${PINCH_Y}" r="20" fill="none" stroke="var(--accent)" stroke-width="1.5" opacity="0"/>
    <circle class="eb-glow" cx="97" cy="${PINCH_Y}" r="26" fill="url(#${id}-glow)" opacity="0"/>
    <ellipse class="eb-finger eb-finger-a" cx="62" cy="${PINCH_Y}" rx="11" ry="15" fill="#fff" fill-opacity="0.07" stroke="#fff" stroke-opacity="0.55" opacity="0"/>
    <ellipse class="eb-finger eb-finger-b" cx="132" cy="${PINCH_Y}" rx="11" ry="15" fill="#fff" fill-opacity="0.07" stroke="#fff" stroke-opacity="0.55" opacity="0"/>
  </g>
</svg>`;
}

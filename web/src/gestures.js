// Gesture layout for Nothing Ear (a), using the codes ear (web) verified for this model.
// Single pinch is fixed by the earbuds (play / pause, answer calls), so it isn't listed.
//
// Sent with 0xF003 as [0x01, side (2 = left, 3 = right), 0x01, type, action]
// and read back with 0xC018 (answer 0x4018).

// "Noise control" is one choice in the app, but the earbuds store it as one of four
// codes depending on which modes it cycles through: [transparency, noise cancellation, off]
export const NOISE_CYCLES = {
  10: [1, 1, 1],
  20: [0, 1, 1],
  21: [1, 0, 1],
  22: [1, 1, 0]
};
export const NOISE_MODES = ['TRANSPARENCY', 'NOISE CANCELLATION', 'OFF'];

export function noiseCode(cycle) {
  const key = cycle.join('');
  const hit = Object.entries(NOISE_CYCLES).find(([, c]) => c.join('') === key);
  return hit ? Number(hit[0]) : 10;
}

// What a stored action code means in the app: one of the ACTIONS keys
export function actionKey(code) {
  return NOISE_CYCLES[code] ? 'noise' : String(code);
}

const ICON = {
  next: '<path d="M6 6l8 6-8 6z"/><path d="M17.5 6v12"/>',
  prev: '<path d="M18 6l-8 6 8 6z"/><path d="M6.5 6v12"/>',
  voice: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>',
  volUp: '<path d="M3.5 10v4h3.5l5 4V6l-5 4z"/><path d="M15.5 12h5M18 9.5v5"/>',
  volDown: '<path d="M3.5 10v4h3.5l5 4V6l-5 4z"/><path d="M15.5 12h5"/>',
  noise: '<path d="M4 12a8 8 0 0 1 16 0"/><path d="M7 12a5 5 0 0 1 10 0"/><circle cx="12" cy="12" r="1.6"/>',
  none: '<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>'
};

// key -> how the action looks, and the code sent for it ('noise' is worked out from the cycle)
export const ACTIONS = {
  '9': { label: 'SKIP FORWARD', short: 'NEXT', icon: ICON.next },
  '8': { label: 'SKIP BACK', short: 'BACK', icon: ICON.prev },
  '11': { label: 'VOICE ASSISTANT', short: 'ASSISTANT', icon: ICON.voice },
  'noise': { label: 'NOISE CONTROL', short: 'NOISE', icon: ICON.noise },
  '18': { label: 'VOLUME UP', short: 'VOL +', icon: ICON.volUp },
  '19': { label: 'VOLUME DOWN', short: 'VOL −', icon: ICON.volDown },
  '1': { label: 'NO ACTION', short: 'NONE', icon: ICON.none }
};

// pattern: what the finger does — 'p' = pinch, 'h' = pinch and hold
export const GESTURES = [
  { type: 2, key: 'double', name: 'DOUBLE PINCH', pattern: ['p', 'p'], actions: ['9', '8', '11'],
    hint: 'Pinch the stem twice, quickly.' },
  { type: 3, key: 'triple', name: 'TRIPLE PINCH', pattern: ['p', 'p', 'p'], actions: ['9', '8', '11'],
    hint: 'Pinch the stem three times, quickly.' },
  { type: 7, key: 'hold', name: 'PINCH & HOLD', pattern: ['h'], actions: ['noise', '18', '19', '11'],
    hint: 'Pinch the stem and keep holding.' },
  { type: 9, key: 'doublehold', name: 'DOUBLE PINCH & HOLD', pattern: ['p', 'h'], actions: ['noise', '18', '19', '11', '1'],
    hint: 'Pinch once, then pinch again and hold.' }
];

// Shown in preview mode and before the earbuds have reported their own settings
export const DEMO_GESTURES = {
  left: { 2: 9, 3: 8, 7: 10, 9: 19 },
  right: { 2: 9, 3: 8, 7: 10, 9: 18 }
};

export function svgIcon(paths, cls = 'gx-icon') {
  return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

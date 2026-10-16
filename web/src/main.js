import { ConnectionManager } from './connection.js'
import { gsap } from 'gsap' // Bundled locally (was loaded from a CDN, which broke offline)
import { FizzBattery, BATTERY_STYLES } from './fizz.js'

const app = {
  ear: new ConnectionManager(),
  el: {},

  // STATE
  savedGestures: {},
  currentSide: 'left',
  settings: {
    ancMode: 5, // Off
    eqId: 1, // Balanced
    eqMode: 'simple', // 'simple' or 'advanced'
    eqCustom: { bass: 50, mid: 50, treble: 50 },
    bass: { enabled: false, level: 3 },
    lowLatency: false,
    inEar: true,
    theme: 'default',
    batteryStyle: 'soda' // 'soda' | 'sparkle' | 'goo' | 'classic'
  },

  init() {
    this.cacheDOM();
    this.fizz = new FizzBattery(document.querySelector('.buds-container'));
    this.loadState(); // Restore previous session
    this.setBatteryStyle(this.settings.batteryStyle, false);

    // 10. Dropdowns (Theme + Battery Style)
    this.setupDropdown('theme-dropdown', (val) => this.setTheme(val));
    this.setupDropdown('battery-dropdown', (val) => this.setBatteryStyle(val));

    // 0. Demo mode (no earbuds needed) — button on the start screen, or open the app with ?demo in the URL
    document.getElementById('demoBtn')?.addEventListener('click', () => this.startDemo());
    if (new URLSearchParams(location.search).has('demo')) setTimeout(() => this.startDemo(), 300);

    // 1. Connect (start screen button + the status pill's "reconnect")
    this.el.connectBtn?.addEventListener('click', () => this.connect());
    document.getElementById('link-status')?.addEventListener('click', () => {
      if (this.linkState === 'offline') this.connect();
    });
    this.ear.onDisconnect = () => {
      this.setLinkState('offline');
      this.toast('Earbuds disconnected · tap OFFLINE to reconnect');
    };

    // 2. Battery Update Hook
    this.ear.onBatteryUpdate = (d) => this.updateBattery(d);

    // 3. Firmware Hook (Ensure ID matches HTML)
    this.ear.onFirmware = (ver) => {
      console.log("FW VER:", ver);
      if (!ver || ver.length < 3) return; // Ignore junk

      const el = document.getElementById('fw-ver') || document.getElementById('fw-version'); // Try both
      const clean = ver.replace(/[^\x20-\x7E]/g, '');
      if (el) el.innerText = clean;
    };

    // 4. Sync Callbacks (ANC, EQ, Bass)
    // 4. Sync Callbacks (ANC, EQ, Bass)
    this.ear.onANCUpdate = (mode) => {
      console.log("Sync ANC:", mode);

      this.settings.ancMode = mode;
      this.saveState();

      document.querySelectorAll('#anc-group .btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.anc) === mode);
      });

      const wrapper = document.getElementById('anc-wrapper');
      const intensityBtns = document.querySelectorAll('.btn-group-mini .btn-mini');

      if (mode >= 1 && mode <= 4) {
        wrapper.classList.remove('collapsed');
        intensityBtns.forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.anc) === mode);
        });
      } else {
        wrapper.classList.add('collapsed');
      }
    };

    this.ear.onEQUpdate = (eqId) => {
      console.log("Sync EQ:", eqId);

      this.settings.eqId = eqId;
      this.saveState();

      const btn = document.querySelector(`.btn[data-eq="${eqId}"]`);
      if (btn) {
        const group = btn.closest('.btn-group');
        if (group) this.setActive(group, btn);
      }
      this.updateEQViz(eqId);
    };

    this.ear.onBassUpdate = (enabled, level) => {
      console.log(`Sync Bass: ${enabled} Lvl:${level}`);

      this.settings.bass.enabled = (enabled === 1);
      this.settings.bass.level = level;
      this.currentBassLevel = level; // Keep for drag logic if needed
      this.saveState();

      const toggle = document.getElementById('sw-bass');
      if (toggle) {
        toggle.classList.toggle('active', enabled === 1);
        const wrap = document.getElementById('bass-wrapper');
        if (wrap) wrap.classList.toggle('collapsed', enabled !== 1);
      }
      this.updateBassSteps((enabled === 1) ? level : 0);
    };

    // 5. Gesture Sync Hook
    this.ear.onGestureUpdate = (payload) => {
      console.log("Syncing Gestures...", payload);
      // Existing logic...
      // Map payload to savedGestures if it is array of objects
      if (Array.isArray(payload)) {
        this.savedGestures = {};
        payload.forEach(g => {
          if (!this.savedGestures[g.side]) this.savedGestures[g.side] = {};
          this.savedGestures[g.side][g.type] = g.action;
        });
        this.saveState();
      }
    };

    // 5. Navigation
    this.el.navBtns.forEach(btn => {
      btn.addEventListener('click', () => this.setPage(btn.dataset.target));
    });

    // 4. Button Groups (ANC, EQ)
    document.querySelectorAll('.btn-group, .btn-group-mini, .grid-buttons').forEach(group => {
      group.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn');
        if (!btn) return;

        // Intensity Buttons (Inline onclicks don't work in module)
        // We detect them via text or existing onclick attribute logic if we wanted, 
        // but let's assume they are the ones inside #anc-wrapper
        if (group.classList.contains('btn-group-mini')) {
          const text = btn.innerText.trim();
          let mode = 1;
          if (text === 'HIGH') mode = 1;
          else if (text === 'MID') mode = 2;
          else if (text === 'LOW') mode = 3;
          else if (text === 'ADAPTIVE') mode = 4;

          this.ear.setANC(mode);
          this.settings.ancMode = mode; // Save
          this.saveState();

          // Visual Active State for Mini Group
          group.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          return;
        }

        // ANC Main Buttons
        if (btn.dataset.anc) {
          const mode = parseInt(btn.dataset.anc);
          this.ear.setANC(mode);
          this.settings.ancMode = mode; // Save
          this.saveState();

          this.setActive(group, btn);

          // Collapse/Expand logic
          const wrap = document.getElementById('anc-wrapper');
          if (wrap) {
            // Hide for OFF (5) and TRANSPARENCY (7)
            if (mode === 5 || mode === 7) wrap.classList.add('collapsed');
            else {
              wrap.classList.remove('collapsed');
              // Default to "HIGH" if opening info and nothing selected
              const highBtn = wrap.querySelector('.btn-group-mini .btn:first-child');
              const anyActive = wrap.querySelector('.btn-group-mini .btn.active');
              if (!anyActive && highBtn) highBtn.classList.add('active');
            }
          }
        }
        // EQ
        if (btn.dataset.eq) {
          const eqId = parseInt(btn.dataset.eq);
          this.ear.setEQ(eqId);
          this.settings.eqId = eqId; // Save
          this.saveState();

          this.setActive(group, btn);
          this.updateEQViz(eqId);
        }
      });
    });

    // 5. Switches (Bass, Game Mode, In-Ear)
    const bindSwitch = (id, callback) => {
      const sw = document.getElementById(id);
      if (!sw) return;
      sw.addEventListener('click', () => {
        sw.classList.toggle('active');
        const isActive = sw.classList.contains('active');
        callback(isActive);
        this.saveState();
      });
    };

    bindSwitch('sw-bass', (v) => {
      // Update Settings
      this.settings.bass.enabled = v;
      this.saveState();

      // Toggle Wrapper
      const wrap = document.getElementById('bass-wrapper');
      if (wrap) wrap.classList.toggle('collapsed', !v);

      // Pop Out Animation
      if (v) {
        // "Pop out from flat slabs"
        gsap.fromTo(".step",
          { height: "4px", opacity: 0.3 },
          { height: "32px", opacity: 1, duration: 0.5, stagger: 0.06, ease: "elastic.out(1, 0.5)" }
        );
        // Verify current value
        this.updateBassSteps(this.settings.bass.level || 3);
        this.ear.setBass(true, this.settings.bass.level || 3);
      } else {
        // Flatten to slabs
        gsap.to(".step", { height: "4px", opacity: 0.3, duration: 0.3, ease: "power2.in" });
        this.ear.setBass(false, 0); // Disable
      }
    });

    bindSwitch('sw-game', (v) => {
      this.ear.setLowLatency(v);
      this.settings.lowLatency = v;
      this.saveState();
    });

    bindSwitch('sw-inear', (v) => {
      this.ear.setInEar(v);
      this.settings.inEar = v;
      this.saveState();
    });

    // 6. Bass Steps Interaction (Slide/Drag)
    const bassContainer = document.querySelector('.bass-steps');
    let isDraggingBass = false;

    // GLOBAL MOUSE UP (Fixes getting stuck in drag mode)
    document.addEventListener('mouseup', () => {
      if (typeof isDraggingBass === 'undefined') return;
      if (isDraggingBass) {
        isDraggingBass = false;
        this.ear.setBass(true, this.currentBassLevel);
        this.settings.bass.level = this.currentBassLevel;
        this.settings.bass.enabled = true;
        this.saveState();
      }
    });

    const updateBassFromEvent = (e) => {
      const rect = bassContainer.getBoundingClientRect();
      const x = e.clientX - rect.left; // X within container
      const width = rect.width;

      // Map X to 1-5
      let lvl = Math.ceil((x / width) * 5);
      if (lvl < 1) lvl = 1;
      if (lvl > 5) lvl = 5;

      // Visual Update Only (Instant)
      if (this.currentBassLevel !== lvl) {
        this.currentBassLevel = lvl;
        this.updateBassSteps(lvl);
      }
    };

    if (bassContainer) {
      // MOUSE DOWN: Start Drag + Initial Click
      bassContainer.addEventListener('mousedown', (e) => {
        isDraggingBass = true;
        updateBassFromEvent(e);

        // Auto-enable if off
        const sw = document.getElementById('sw-bass');
        if (sw && !sw.classList.contains('active')) {
          sw.click();
        }
      });

      // MOUSE MOVE: Slide
      document.addEventListener('mousemove', (e) => {
        if (!isDraggingBass) return;
        e.preventDefault(); // Prevent selection
        updateBassFromEvent(e);
      });

      // MOUSE UP: Commit Change
      document.addEventListener('mouseup', () => {
        if (isDraggingBass) {
          isDraggingBass = false;
          // Commit to Device
          this.ear.setBass(true, this.currentBassLevel);
          // Save State
          this.settings.bass.level = this.currentBassLevel;
          this.settings.bass.enabled = true; // Implicitly enabled if dragging
          this.saveState();
        }
      });
    }

    // 7. GESTURE MODAL INTERACTION
    this.el.budCards.forEach(card => {
      card.addEventListener('click', () => {
        const side = card.dataset.side;
        this.openGestureModal(side);
      });
    });

    document.getElementById('close-modal').addEventListener('click', () => this.closeGestureModal());
    document.getElementById('save-gestures').addEventListener('click', () => this.applyGestures());

    // 8. Advanced EQ
    const simpleDiv = document.getElementById('eq-simple');
    const advDiv = document.getElementById('eq-advanced');
    const modeSimple = document.getElementById('mode-simple');
    const modeAdv = document.getElementById('mode-advanced');

    const switchEQMode = (mode) => {
      this.settings.eqMode = mode;
      this.saveState();

      if (mode === 'simple') {
        simpleDiv.style.display = 'grid';
        advDiv.style.display = 'none';
        modeSimple.classList.add('active');
        modeAdv.classList.remove('active');
        // Send Preset Command
        this.ear.setEQ(this.settings.eqId);
        this.updateEQViz(this.settings.eqId);
      } else {
        simpleDiv.style.display = 'none';
        advDiv.style.display = 'flex';
        modeAdv.classList.add('active');
        modeSimple.classList.remove('active');
        // Send Custom Command (TODO)
        this.updateEQParametric(
          this.settings.eqCustom.bass,
          this.settings.eqCustom.mid,
          this.settings.eqCustom.treble
        );
      }
    };

    if (modeSimple && modeAdv) {
      modeSimple.addEventListener('click', () => switchEQMode('simple'));
      modeAdv.addEventListener('click', () => switchEQMode('advanced'));
    }

    // 9. Parametric Sliders
    ['adv-bass', 'adv-mid', 'adv-treble'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => {
          const b = parseInt(document.getElementById('adv-bass').value);
          const m = parseInt(document.getElementById('adv-mid').value);
          const t = parseInt(document.getElementById('adv-treble').value);

          this.settings.eqCustom = { bass: b, mid: m, treble: t };
          this.saveState();

          this.updateEQParametric(b, m, t);
        });
      }
    });

    this.loadState();
    console.log("App Initialized.");

    // Quick tiles, fit test, status pill, nav indicator
    this.setupTiles();
    this.setupFitTest();
    this.setupUpdates();
    this.updateTiles();
    this.setLinkState('offline');
    this.setConnectUI('idle');
    requestAnimationFrame(() => this.moveNavIndicator());
    document.fonts?.ready.then(() => this.moveNavIndicator());
    window.addEventListener('resize', () => this.moveNavIndicator());

    // Intro: the title "boots up" letter by letter like a dot-matrix display
    const title = document.querySelector('#overlay h1');
    if (title && !title.dataset.split) {
      title.dataset.split = '1';
      title.setAttribute('aria-label', title.textContent);
      title.innerHTML = [...title.textContent].map(ch => `<span aria-hidden="true">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
      gsap.from('#overlay h1 span', { opacity: 0, duration: 0.08, stagger: { each: 0.07, from: 'random' }, ease: 'none' });
    }
    gsap.from(['#connectBtn', '#demoBtn'], { opacity: 0, y: 16, duration: 0.9, delay: 0.5, stagger: 0.12, ease: 'expo.out', clearProps: 'all' });
  },

  cacheDOM() {
    this.el = {
      overlay: document.getElementById('overlay'),
      connectBtn: document.getElementById('connectBtn'),
      pages: document.querySelectorAll('.page'),
      navBtns: document.querySelectorAll('.nav-btn'),
      budCards: document.querySelectorAll('.bud-card'),
    };
  },

  // Fake battery readings so the dashboard can be previewed without earbuds.
  // Commands sent from Controls/EQ are ignored safely because no device is connected.
  startDemo() {
    this.el.overlay.classList.add('hidden'); // CSS fade (GSAP + the CSS transition fought each other and crawled)
    this.setPage('dashboard');
    this.setLinkState('demo');
    const fw = document.getElementById('fw-ver');
    if (fw) fw.innerText = 'DEMO MODE';

    const d = { l: 72, r: 38, c: 90, l_c: false, r_c: true };
    this.updateBattery({ ...d });

    clearInterval(this.demoTimer);
    this.demoTimer = setInterval(() => {
      if (d.r_c) d.r = Math.min(100, d.r + 1); // right earbud slowly charges
      if (d.r >= 100) d.r_c = false;
      this.updateBattery({ ...d });
    }, 3000);
  },

  startSession() {
    clearInterval(this.demoTimer); // a real connection replaces demo data
    this.el.overlay.classList.add('hidden'); // CSS fade (GSAP + the CSS transition fought each other and crawled)
    this.ear.startPolling();
    this.ear.syncAll(); // Request full device state
    this.setPage('dashboard');
  },

  // --- CONNECTING ---
  async connect() {
    if (this.connecting) return;
    this.connecting = true;
    const fromStartScreen = !this.el.overlay.classList.contains('hidden');
    this.setConnectUI('connecting', 'Looking for your earbuds…');
    this.setLinkState('connecting');

    try {
      await this.ear.connect();
      this.setConnectUI('connected', 'Connected');
      this.setLinkState('live');
      if (fromStartScreen) setTimeout(() => this.startSession(), 700); // let the "connected" moment land
      else { this.startSession(); this.toast('Reconnected'); }
    } catch (e) {
      console.error(e);
      // Closing the picker / pressing cancel is not an error worth shouting about
      const cancelled = e?.name === 'NotFoundError' || /no port selected/i.test(e?.message || '');
      this.setConnectUI(cancelled ? 'idle' : 'error',
        cancelled ? 'No earbuds selected' : 'Couldn’t connect. Take the earbuds out of the case and check they’re paired.');
      this.setLinkState(this.ear.isConnected ? 'live' : 'offline');
      if (!fromStartScreen && !cancelled) this.toast('Couldn’t reconnect');
    } finally {
      this.connecting = false;
    }
  },

  setConnectUI(state, message = '') {
    this.el.overlay.dataset.state = state; // idle | connecting | connected | error
    const label = this.el.connectBtn?.querySelector('.btn-label');
    if (label) label.textContent = { idle: 'INITIALIZE LINK', connecting: 'CONNECTING', connected: 'CONNECTED', error: 'TRY AGAIN' }[state];
    const status = document.getElementById('connect-status');
    if (status) status.textContent = message;
  },

  // Status pill on the dashboard: offline | connecting | live | demo
  setLinkState(state) {
    this.linkState = state;
    const pill = document.getElementById('link-status');
    if (pill) {
      pill.dataset.state = state;
      pill.querySelector('.ls-text').textContent =
        { offline: 'OFFLINE · RECONNECT', connecting: 'CONNECTING', live: 'LIVE', demo: 'DEMO' }[state];
      pill.disabled = state !== 'offline';
    }
    // Old readings fade out while disconnected
    document.querySelector('.buds-container')?.classList.toggle('stale', state === 'offline');
  },

  toast(message) {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  },

  // --- QUICK TILES (dashboard shortcuts that drive the real controls) ---
  setupTiles() {
    const press = (id, fn) => document.getElementById(id)?.addEventListener('click', () => {
      fn();
      this.updateTiles();
      const tile = document.getElementById(id);
      tile.classList.remove('bump'); void tile.offsetWidth; tile.classList.add('bump');
    });

    // Noise: cancelling -> transparency -> off -> cancelling
    press('tile-anc', () => {
      const cur = this.settings.ancMode;
      const next = (cur >= 1 && cur <= 4) ? 7 : cur === 7 ? 5 : 1;
      document.querySelector(`#anc-group .btn[data-anc="${next}"]`)?.click();
    });

    // EQ: step through the four presets
    press('tile-eq', () => {
      if (this.settings.eqMode === 'advanced') document.getElementById('mode-simple')?.click();
      const next = (this.settings.eqId % 4) + 1;
      document.querySelector(`#eq-simple .btn[data-eq="${next}"]`)?.click();
    });

    press('tile-game', () => document.getElementById('sw-game')?.click());
  },

  updateTiles() {
    const set = (id, value, on) => {
      const tile = document.getElementById(id);
      if (!tile) return;
      tile.querySelector('.tile-value').textContent = value;
      tile.classList.toggle('on', on);
    };
    const anc = this.settings.ancMode;
    set('tile-anc', (anc >= 1 && anc <= 4) ? 'CANCELLING' : anc === 7 ? 'TRANSPARENT' : 'OFF', anc !== 5);
    const EQ = { 1: 'BALANCED', 2: 'MORE BASS', 3: 'MORE TREBLE', 4: 'VOICE' };
    const customEQ = this.settings.eqMode === 'advanced';
    set('tile-eq', customEQ ? 'CUSTOM' : (EQ[this.settings.eqId] || 'BALANCED'), customEQ || this.settings.eqId !== 1);
    set('tile-game', this.settings.lowLatency ? 'ON' : 'OFF', !!this.settings.lowLatency);
  },

  // --- APP UPDATES (desktop app only; window.desktop comes from electron/main-preload.js) ---
  setupUpdates() {
    const desktop = window.desktop;
    if (!desktop) return; // running in a normal browser: nothing to update
    document.getElementById('update-row').hidden = false;
    document.getElementById('update-btn').addEventListener('click', () => this.updateAction());
    document.getElementById('update-banner-action').addEventListener('click', () => this.updateAction());
    document.getElementById('update-banner-close').addEventListener('click', () => {
      this.updateDismissed = this.update?.version;
      document.getElementById('update-banner').hidden = true;
    });
    desktop.onUpdate((status) => this.renderUpdate(status));
    desktop.getUpdate().then((status) => this.renderUpdate(status));
  },

  updateAction() {
    const s = this.update?.state;
    if (s === 'ready') window.desktop.installUpdate();
    else if (s === 'available') window.desktop.openDownload();
    else { this.updateCheckedByHand = true; window.desktop.checkForUpdates(); }
  },

  // state: idle | checking | latest | downloading | ready | available | error | dev
  renderUpdate(s) {
    if (!s) return;
    const previous = this.update?.state;
    this.update = s;
    document.getElementById('app-version').textContent = s.current || '--';

    const status = {
      checking: 'CHECKING…',
      latest: 'UP TO DATE',
      downloading: `DOWNLOADING ${s.version || ''} · ${s.percent || 0}%`,
      ready: `${s.version} READY`,
      available: `${s.version} AVAILABLE`,
      error: 'COULDN’T CHECK',
      dev: 'DEV BUILD'
    }[s.state] || '';
    const text = document.getElementById('update-text');
    text.textContent = status ? `· ${status}` : '';
    text.dataset.state = s.state;

    const btn = document.getElementById('update-btn');
    btn.textContent = s.state === 'ready' ? 'RESTART' : s.state === 'available' ? 'DOWNLOAD' : 'CHECK';
    btn.disabled = s.state === 'checking' || s.state === 'downloading' || s.state === 'dev';
    btn.classList.toggle('active', s.state === 'ready' || s.state === 'available');

    // Banner when something is ready / available (once per version, unless dismissed)
    const banner = document.getElementById('update-banner');
    const show = (s.state === 'ready' || s.state === 'available') && this.updateDismissed !== s.version;
    if (show) {
      document.getElementById('update-banner-text').textContent =
        s.state === 'ready' ? `CMFxNothing ${s.version} is ready` : `CMFxNothing ${s.version} is available`;
      document.getElementById('update-banner-action').textContent = s.state === 'ready' ? 'RESTART' : 'DOWNLOAD';
    }
    banner.hidden = !show;

    // After a hand-started check finishes, say so if there's nothing new
    if (s.state !== 'checking') {
      if (s.state === 'latest' && previous === 'checking' && this.updateCheckedByHand) this.toast('You’re on the latest version');
      if (s.state === 'error' && this.updateCheckedByHand) this.toast('Couldn’t check for updates. Are you online?');
      this.updateCheckedByHand = false;
    }
  },

  // --- EAR TIP FIT TEST ---
  setupFitTest() {
    const modal = document.getElementById('fit-modal');
    if (!modal) return;
    document.getElementById('fit-open')?.addEventListener('click', () => this.openFitTest());
    document.getElementById('fit-close')?.addEventListener('click', () => this.closeFitTest());
    document.getElementById('fit-start')?.addEventListener('click', () => this.runFitTest());
    modal.addEventListener('click', (e) => { if (e.target === modal) this.closeFitTest(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) this.closeFitTest();
    });
    this.ear.onFitTest = (left, right) => this.showFitResult(left, right);
  },

  openFitTest() {
    this.setFitState('idle');
    document.getElementById('fit-modal').classList.remove('hidden');
  },

  closeFitTest() {
    clearTimeout(this.fitTimer);
    this.fitRunning = false;
    document.getElementById('fit-modal').classList.add('hidden');
  },

  runFitTest() {
    clearTimeout(this.fitTimer);
    if (this.ear.isConnected) {
      this.setFitState('testing');
      this.fitRunning = true;
      this.ear.startFitTest();
      // The earbuds play a short tone and answer within a few seconds
      this.fitTimer = setTimeout(() => this.setFitState('timeout'), 20000);
    } else if (this.linkState === 'demo') {
      this.setFitState('testing');
      this.fitRunning = true;
      const pick = () => (Math.random() < 0.7 ? 0 : 1);
      this.fitTimer = setTimeout(() => this.showFitResult(pick(), pick()), 3500);
    } else {
      this.setFitState('offline');
    }
  },

  // state: idle | testing | timeout | offline
  setFitState(state) {
    const text = {
      idle: 'Put both earbuds in your ears, then start the test. You’ll hear a short sound.',
      testing: 'Testing… keep still for a few seconds.',
      timeout: 'No result from the earbuds. Make sure both are in your ears and connected. Some models don’t support this test.',
      offline: 'Connect your earbuds first, then run the test.'
    }[state];
    const budState = state === 'testing' ? 'testing' : 'idle';
    const budLabel = state === 'testing' ? 'TESTING' : 'READY';
    this.setFitBud('fit-l', budState, budLabel);
    this.setFitBud('fit-r', budState, budLabel);
    document.getElementById('fit-msg').textContent = text;
    const btn = document.getElementById('fit-start');
    btn.disabled = state === 'testing';
    btn.textContent = state === 'testing' ? 'TESTING…' : state === 'idle' ? 'START TEST' : 'TRY AGAIN';
  },

  setFitBud(id, state, label) {
    const bud = document.getElementById(id);
    if (!bud) return;
    bud.dataset.state = state;
    bud.querySelector('.fit-status').textContent = label;
  },

  // Results per side: 0 = good seal, 1 = poor fit, 2 = not in ear / not connected
  showFitResult(left, right) {
    if (!this.fitRunning) return; // ignore stray results when the window isn't testing
    this.fitRunning = false;
    clearTimeout(this.fitTimer);

    const look = (v) => v === 0 ? ['good', 'GOOD SEAL'] : v === 1 ? ['adjust', 'ADJUST'] : ['missing', 'NOT DETECTED'];
    this.setFitBud('fit-l', ...look(left));
    this.setFitBud('fit-r', ...look(right));

    let msg;
    if (left === 2 || right === 2) msg = 'Make sure both earbuds are connected and in your ears, then try again.';
    else if (left === 0 && right === 0) msg = 'Perfect seal on both sides. You’re ready!';
    else if (left === 1 && right === 1) msg = 'Adjust both earbuds or try another tip size, then test again.';
    else if (left === 1) msg = 'Adjust the left earbud or try another tip size, then test again.';
    else msg = 'Adjust the right earbud or try another tip size, then test again.';

    document.getElementById('fit-msg').textContent = msg;
    const btn = document.getElementById('fit-start');
    btn.disabled = false;
    btn.textContent = 'TEST AGAIN';
  },

  // Sliding highlight behind the active nav tab
  moveNavIndicator() {
    const menu = document.querySelector('.menu');
    const active = document.querySelector('.nav-btn.active');
    if (!menu || !active) return;
    menu.style.setProperty('--ind-top', active.offsetTop + 'px');
    menu.style.setProperty('--ind-height', active.offsetHeight + 'px');
    menu.style.setProperty('--ind-left', active.offsetLeft + 'px');
    menu.style.setProperty('--ind-width', active.offsetWidth + 'px');
  },

  updateBattery(d) {
    const BOLT = '<svg class="pct-bolt" viewBox="0 0 9 12" aria-label="charging"><path d="M5.5 0 0 7h3.5L3 12l6-7.5H5.5z"/></svg>';
    const set = (side, pctId, val, chg) => {
      this.fizz.set(side, val, chg); // liquid height + bubbles (fizzes faster while charging)
      const pct = document.getElementById(pctId);
      if (pct) pct.innerHTML = `<span class="pct-num">${val}</span><span class="pct-unit">%</span>${chg ? BOLT : ''}`;
    };

    set('left', 'pct-l', d.l, d.l_c);
    set('right', 'pct-r', d.r, d.r_c);

    const cPct = document.getElementById('case-pct');
    if (cPct) cPct.innerText = d.c + "%";
  },

  updateEQViz(mode) {
    // Smoother Blob System
    const paths = {
      1: "M100,25 Q160,25 175,100 Q160,175 100,175 Q40,175 25,100 Q40,25 100,25 Z",
      2: "M100,40 Q150,55 160,100 Q145,160 100,165 Q30,195 15,130 Q15,70 100,40 Z",
      3: "M100,40 Q185,70 185,130 Q170,195 100,165 Q55,160 40,100 Q50,55 100,40 Z",
      4: "M100,10 Q160,40 165,110 Q145,160 100,150 Q55,160 35,110 Q40,40 100,10 Z"
    };

    const targetPath = paths[mode] || paths[1];

    gsap.to("#eq-blob", {
      attr: { d: targetPath },
      duration: 1.0,
      ease: "power2.inOut"
    });

    const fx = { 1: "50%", 2: "30%", 3: "70%", 4: "50%" };
    const fy = { 1: "50%", 2: "70%", 3: "70%", 4: "30%" };

    gsap.to("#blobGradient", {
      attr: { fx: fx[mode] || "50%", fy: fy[mode] || "50%" },
      duration: 1.0,
      ease: "power2.inOut"
    });
  },

  updateEQParametric(bass, mid, treble) {
    const bFac = (bass - 50) * 1.5;
    const mFac = (mid - 50) * 1.5;
    const tFac = (treble - 50) * 1.5;

    const pTop = `100,${25 - mFac}`;
    const pBotLeft = `${30 - bFac},${170 + bFac}`;
    const pBotRight = `${170 + tFac},${170 + tFac}`;

    const path = `M${pTop} Q180,50 ${pBotRight} Q100,180 ${pBotLeft} Q20,50 ${pTop} Z`;

    gsap.to("#eq-blob", { attr: { d: path }, duration: 0.2, ease: "power1.out" });

    // Shift Gradient Center
    const gx = 50 + (tFac / 2) - (bFac / 2);
    const gy = 50 - (mFac / 2) + (bFac / 3) + (tFac / 3);

    gsap.to("#blobGradient", {
      attr: { fx: `${gx}%`, fy: `${gy}%` },
      duration: 0.2,
      ease: "power1.out"
    });
  },

  setPage(id) {
    this.el.navBtns.forEach(b => b.classList.toggle('active', b.dataset.target === id));
    this.el.pages.forEach(p => p.classList.toggle('active', p.id === id));
    this.moveNavIndicator();
    document.querySelector('main')?.scrollTo({ top: 0 });

    // Explicitly animate ONLY .card (Controls/EQ), .bud-card and .tile (Dashboard)
    // Excludes .case-pill to prevent snapping
    const animatedElements = document.querySelectorAll(`#${id} .card, #${id} .bud-card, #${id} .tile`);
    gsap.fromTo(animatedElements, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, stagger: 0.05, ease: "power2.out", clearProps: 'transform' });
  },

  setActive(group, target) {
    if (!group) return;
    group.querySelectorAll('.btn').forEach(b => b.classList.remove('active'));
    target.classList.add('active');
    this.saveState();
  },

  updateBassSteps(level) {
    document.querySelectorAll('.step').forEach(s => {
      const l = parseInt(s.dataset.lvl);
      s.classList.toggle('active', l <= level);

      // Active: Tall Pop-out. Inactive: Low Slab.
      if (l <= level) gsap.to(s, { height: (15 + (l * 5)) + "px", duration: 0.3, ease: "back.out(1.2)" });
      else gsap.to(s, { height: "4px", duration: 0.3 }); // Return to flat slab
    });
  },

  loadState() {
    const saved = localStorage.getItem('nothing_ear_settings'); // key must match saveState
    if (!saved) return;
    try {
      const s = JSON.parse(saved);
      // Merge into settings
      this.settings = { ...this.settings, ...s };
      this.savedGestures = this.settings.gestures || {};

      console.log("State Loaded:", this.settings);

      // Apply to UI (Visuals Only)
      // 1. ANC
      const ancMode = this.settings.ancMode;
      document.querySelectorAll('#anc-group .btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.anc) === ancMode);
      });
      // Handle Mini Group (Intensity)
      if (ancMode >= 1 && ancMode <= 4) {
        document.getElementById('anc-wrapper')?.classList.remove('collapsed');
        document.querySelectorAll('.btn-group-mini .btn-mini').forEach(b => {
          b.classList.toggle('active', parseInt(b.dataset.anc) === ancMode);
        });
      } else {
        document.getElementById('anc-wrapper')?.classList.add('collapsed');
      }

      // 2. EQ
      const eqId = this.settings.eqId;
      const eqBtn = document.querySelector(`.btn[data-eq="${eqId}"]`);
      if (eqBtn) this.setActive(eqBtn.parentElement, eqBtn);

      // Restore Custom Values
      if (this.settings.eqCustom) {
        const { bass, mid, treble } = this.settings.eqCustom;
        const setSl = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
        setSl('adv-bass', bass);
        setSl('adv-mid', mid);
        setSl('adv-treble', treble);
      }

      // Restore Mode View
      if (this.settings.eqMode === 'advanced') {
        document.getElementById('mode-advanced')?.click();
      } else {
        document.getElementById('mode-simple')?.click();
      }

      // If we are in simple mode, this click() above triggered updateEQViz(id).
      // If advanced, it triggered updateEQParametric().


      // 3. Bass
      if (this.settings.bass) {
        const enabled = this.settings.bass.enabled;
        const level = this.settings.bass.level;
        const swBass = document.getElementById('sw-bass');
        if (swBass) swBass.classList.toggle('active', enabled);
        document.getElementById('bass-wrapper')?.classList.toggle('collapsed', !enabled);
        this.currentBassLevel = level;
        this.updateBassSteps(enabled ? level : 0);

        // Ensure elements are popped out if enabled
        if (enabled && gsap) {
          gsap.set(".step", { height: "4px", opacity: 0.3 }); // reset
          const activeSteps = document.querySelectorAll(`.step`);
          activeSteps.forEach(step => {
            if (parseInt(step.dataset.lvl) <= level) {
              gsap.set(step, { height: (15 + (parseInt(step.dataset.lvl) * 5)) + "px", opacity: 1 });
            }
          });
        }
      }

      // 4. Switches
      const setSw = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle('active', !!val);
      };
      setSw('sw-game', this.settings.lowLatency);
      setSw('sw-inear', this.settings.inEar);

      // 5. Theme
      if (this.settings.theme) {
        // Find option by value
        const targetOption = document.querySelector(`#theme-options .dropdown-option[data-value="${this.settings.theme}"]`);
        if (targetOption) {
            // Simulate click to update UI safely
            const evt = new MouseEvent('click', { bubbles: false, cancelable: true });
            targetOption.dispatchEvent(evt);
        } else {
            this.setTheme(this.settings.theme, false);
        }
      }

    } catch (e) { console.error("Load Error:", e); }
  },

  saveState() {
    // Source of Truth is this.settings
    // Ensure gestures are synced
    this.settings.gestures = this.savedGestures;

    // Save
    localStorage.setItem('nothing_ear_settings', JSON.stringify(this.settings));
    console.log("State Saved:", this.settings);
    this.updateTiles(); // every control change passes through here, so the tiles stay in sync
  },

  applyPendingSettings() {
    // Apply Persistence to Device
    this.saveState();
    // For now just triggers a re-read or passive apply.
    // Real persistence logic would verify active state against device state here.
  },

  // --- DROPDOWNS ---
  setupDropdown(id, onSelect) {
    const dd = document.getElementById(id);
    if (!dd) return;
    const selectedText = dd.querySelector('.dropdown-selected');
    const optionsContainer = dd.querySelector('.dropdown-options');
    const options = optionsContainer.querySelectorAll('.dropdown-option');

    // Toggle open/close (and close any other open dropdown)
    dd.addEventListener('click', (e) => {
      e.stopPropagation();
      const opening = !dd.classList.contains('open');
      document.querySelectorAll('.custom-dropdown.open').forEach(o => o.classList.remove('open'));
      dd.classList.toggle('open', opening);
    });

    // Prevent scrollbar clicks from closing dropdown
    optionsContainer.addEventListener('click', (e) => e.stopPropagation());

    options.forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        options.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        dd.dataset.value = opt.dataset.value;
        selectedText.innerText = opt.innerText;
        dd.classList.remove('open');
        onSelect(opt.dataset.value);
      });
    });

    // Close when clicking outside
    document.addEventListener('click', () => dd.classList.remove('open'));
  },

  // --- BATTERY STYLE ---
  setBatteryStyle(style, save = true) {
    if (!BATTERY_STYLES.includes(style)) style = 'soda';
    this.settings.batteryStyle = style;
    this.fizz.setStyle(style);

    // Keep the Settings dropdown in sync (also used when restoring a saved choice)
    const dd = document.getElementById('battery-dropdown');
    const opt = document.querySelector(`#battery-options .dropdown-option[data-value="${style}"]`);
    if (dd && opt) {
      dd.dataset.value = style;
      document.getElementById('battery-selected-text').innerText = opt.innerText;
      document.querySelectorAll('#battery-options .dropdown-option').forEach(o => o.classList.toggle('selected', o === opt));
    }

    if (save) this.saveState();
  },

  // --- THEMES ---
  setTheme(themeName, save = true) {
    if (save) {
      this.settings.theme = themeName;
      this.saveState();
    }
    
    // Remove existing theme classes
    document.body.className = '';
    
    if (themeName !== 'default') {
      document.body.classList.add(`theme-${themeName}`);
    }
    
    this.updateSVGTheme(themeName);
  },

  updateSVGTheme(themeName) {
    const s1 = document.getElementById('bg-stop-1');
    const s2 = document.getElementById('bg-stop-2');
    const s3 = document.getElementById('bg-stop-3');
    if (!s1 || !s2 || !s3) return;

    if (themeName === 'matrix') {
        s1.style.stopColor = 'rgba(50,255,50,0.9)';
        s2.style.stopColor = 'rgba(0,255,0,0.6)';
        s3.style.stopColor = 'rgba(0,255,0,0)';
    } else if (themeName === 'blue') {
        s1.style.stopColor = 'rgba(50,150,255,0.9)';
        s2.style.stopColor = 'rgba(0,136,255,0.6)';
        s3.style.stopColor = 'rgba(0,136,255,0)';
    } else if (themeName === 'cyberpunk') {
        s1.style.stopColor = 'rgba(255,50,255,0.9)';
        s2.style.stopColor = 'rgba(200,0,200,0.6)';
        s3.style.stopColor = 'rgba(200,0,200,0)';
    } else if (themeName === 'sunset') {
        s1.style.stopColor = 'rgba(255,150,50,0.9)';
        s2.style.stopColor = 'rgba(255,50,100,0.6)';
        s3.style.stopColor = 'rgba(255,50,100,0)';
    } else if (themeName === 'ocean') {
        s1.style.stopColor = 'rgba(50,255,255,0.9)';
        s2.style.stopColor = 'rgba(0,150,255,0.6)';
        s3.style.stopColor = 'rgba(0,150,255,0)';
    } else if (themeName === 'gold') {
        s1.style.stopColor = 'rgba(255,230,100,0.9)';
        s2.style.stopColor = 'rgba(200,150,0,0.6)';
        s3.style.stopColor = 'rgba(200,150,0,0)';
    } else {
        s1.style.stopColor = 'rgba(255,50,50,0.9)';
        s2.style.stopColor = 'rgba(230,30,37,0.6)';
        s3.style.stopColor = 'rgba(230,30,37,0)';
    }
  },

  // --- GESTURES ---
  openGestureModal(side) {
    this.currentSide = side;
    const modal = document.getElementById('gesture-modal');
    const content = modal.querySelector('.modal-content');

    // 1. Calculate Coordinates
    const triggerBtn = document.querySelector(`.bud-card[data-side="${side}"]`);
    const rect = triggerBtn.getBoundingClientRect();

    // Store origin for closing
    this.gestureOrigin = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2
    };

    // Reset Modal
    modal.classList.remove('hidden');
    document.getElementById('modal-title').innerText = `CONFIGURE ${(side || 'LEFT').toUpperCase()}`;

    // Update Dot Color (Left=White/Black, Right=Red usually, but let's stick to theme)
    // Actually Ear (a) uses Red (R) and White (L)
    const dot = document.getElementById('side-dot');
    if (dot) dot.setAttribute('fill', side === 'right' ? '#d92027' : '#fff');

    // GSAP Expand (From Pill to Window)
    gsap.fromTo(content,
      {
        transformOrigin: "center center",
        scale: 0.1,
        opacity: 0,
        x: (this.gestureOrigin.x - window.innerWidth / 2),
        y: (this.gestureOrigin.y - window.innerHeight / 2),
        borderRadius: "50px" // Start as pill shape
      },
      {
        scale: 1,
        opacity: 1,
        x: 0,
        y: 0,
        borderRadius: "12px", // Morph to card
        duration: 0.6,
        ease: "expo.out" // Very smooth expand
      }
    );

    this.setupGestureAnimations();

    // Load saved
    const saved = this.savedGestures[side] || {};
    document.getElementById('g-double').value = saved[2] || 0;
    document.getElementById('g-triple').value = saved[3] || 0;
    document.getElementById('g-hold').value = saved[4] || 0;
    document.getElementById('g-doublehold').value = saved[5] || 0;

    // Backdrop Click Listener (One-time)
    this.backdropCloser = (e) => {
      if (e.target === modal) this.closeGestureModal();
    };
    modal.addEventListener('click', this.backdropCloser);
  },

  closeGestureModal() {
    const modal = document.getElementById('gesture-modal');
    const content = modal.querySelector('.modal-content');

    // Remove listener
    if (this.backdropCloser) modal.removeEventListener('click', this.backdropCloser);

    // Reverse Animation (Back to Pill)
    gsap.to(content, {
      scale: 0.1,
      opacity: 0,
      x: (this.gestureOrigin.x - window.innerWidth / 2),
      y: (this.gestureOrigin.y - window.innerHeight / 2),
      borderRadius: "50px",
      duration: 0.4,
      ease: "power3.in",
      onComplete: () => {
        modal.classList.add('hidden');
      }
    });
  },

  setupGestureAnimations() {
    // Hover Listeners for Tutorial
    const rows = document.querySelectorAll('.gesture-row');

    rows.forEach(row => {
      row.addEventListener('mouseenter', () => {
        const type = row.dataset.anim;
        this.playGestureAnim(type);
        document.getElementById('gesture-instruction').innerText = row.querySelector('label').innerText + " ACTIONS";
      });
    });
  },

  playGestureAnim(type) {
    // Clear Previous
    gsap.killTweensOf("#pinch-point");
    gsap.killTweensOf("#finger-indicator");
    gsap.set("#pinch-point", { opacity: 0 });
    gsap.set("#finger-indicator", { opacity: 0, x: 20 });

    const finger = "#finger-indicator";
    const contact = "#pinch-point";

    // Adjusted coordinates for new SVG
    // SVG Y is 0-350. Stem is roughly 90,40 to 140,260.
    // Pinch area around Y=110? No, Y=110 was in old one.
    // New Stem Rect is y=40 h=220 -> Mid Y ~ 150.
    // Let's target Y=120 for pinch.

    const pinchY = 120; // Visual sweet spot on stem
    gsap.set([finger, contact], { cy: pinchY });

    if (type === 'double') {
      const t = gsap.timeline();
      t.to(finger, { opacity: 1, x: 0, duration: 0.2 })
        .to(contact, { opacity: 1, scale: 1.5, duration: 0.1 }, "<")
        .to(finger, { x: 10, duration: 0.1 })
        .to(contact, { opacity: 0, duration: 0.1 }, "<")
        .to(finger, { x: 0, duration: 0.1 })
        .to(contact, { opacity: 1, scale: 1.5, duration: 0.1 }, "<")
        .to(finger, { x: 20, opacity: 0, duration: 0.3, delay: 0.1 });
    }
    else if (type === 'triple') {
      const t = gsap.timeline();
      for (let i = 0; i < 3; i++) {
        t.to(finger, { opacity: 1, x: 0, duration: 0.15 })
          .to(contact, { opacity: 1, scale: 1.2, duration: 0.05 }, "<")
          .to(finger, { x: 10, duration: 0.1 })
          .to(contact, { opacity: 0, duration: 0.05 }, "<");
      }
      t.to(finger, { x: 20, opacity: 0, duration: 0.3 });
    }
    else if (type === 'hold') {
      const t = gsap.timeline();
      t.to(finger, { opacity: 1, x: 0, duration: 0.3 })
        .to(contact, { opacity: 1, scale: 2, duration: 0.3 }, "<")
        .to(contact, { scale: 1.5, duration: 1, yoyo: true, repeat: 1 })
        .to(finger, { x: 20, opacity: 0, duration: 0.4 });
    }
    else if (type === 'doublehold') {
      // Two quick pinches, then hold
      const t = gsap.timeline();
      // First pinch
      t.to(finger, { opacity: 1, x: 0, duration: 0.15 })
        .to(contact, { opacity: 1, scale: 1.2, duration: 0.05 }, "<")
        .to(finger, { x: 10, duration: 0.1 })
        .to(contact, { opacity: 0, duration: 0.05 }, "<")
        // Second pinch
        .to(finger, { x: 0, duration: 0.1 })
        .to(contact, { opacity: 1, scale: 1.2, duration: 0.05 }, "<")
        // Hold sustained
        .to(contact, { scale: 2, duration: 0.3 })
        .to(contact, { scale: 1.5, duration: 0.8, yoyo: true, repeat: 1 })
        // Release
        .to(finger, { x: 20, opacity: 0, duration: 0.4 })
        .to(contact, { opacity: 0, duration: 0.2 }, "<");
    }
  },

  applyGestures() {
    const side = this.currentSide;
    const g2 = parseInt(document.getElementById('g-double').value);
    const g3 = parseInt(document.getElementById('g-triple').value);
    const g4 = parseInt(document.getElementById('g-hold').value);
    const g5 = parseInt(document.getElementById('g-doublehold').value);

    // Save To State
    if (!this.savedGestures[side]) this.savedGestures[side] = {};
    if (g2) { this.savedGestures[side][2] = g2; this.ear.setGesture(side, 2, g2); }
    if (g3) { this.savedGestures[side][3] = g3; this.ear.setGesture(side, 3, g3); }
    if (g4) { this.savedGestures[side][4] = g4; this.ear.setGesture(side, 4, g4); }
    if (g5) { this.savedGestures[side][5] = g5; this.ear.setGesture(side, 5, g5); }

    this.saveState();
    this.closeGestureModal();
  }
};

// Handy for testing in DevTools, e.g. app.updateBattery({ l: 72, r: 64, c: 90, l_c: false, r_c: true })
window.app = app;

document.addEventListener('DOMContentLoaded', () => {
  app.init();
});

(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d", { alpha: false });

  const scoreEl = document.getElementById("score");
  const hazardEl = document.getElementById("hazard");
  const hazardTextEl = document.getElementById("hazard-text");
  const startPanel = document.getElementById("start-panel");
  const gameoverPanel = document.getElementById("gameover-panel");
  const pausePanel = document.getElementById("pause-panel");
  const playBtn = document.getElementById("play-btn");
  const retryBtn = document.getElementById("retry-btn");
  const pauseBtn = document.getElementById("pause-btn");
  const resumeBtn = document.getElementById("resume-btn");
  const flapBtn = document.getElementById("flap-btn");
  const finalScoreEl = document.getElementById("final-score");
  const bestScoreEl = document.getElementById("best-score");
  const deathReasonEl = document.getElementById("death-reason");
  const mobileTip = document.getElementById("mobile-tip");
  const powerupsEl = document.getElementById("powerups");
  const powerupToastEl = document.getElementById("powerup-toast");

  const STATE = Object.freeze({ READY: 0, PLAYING: 1, DEAD: 2, PAUSED: 3 });

  const game = {
    state: STATE.READY,
    W: innerWidth,
    H: innerHeight,
    dpr: 1,
    unit: 1,
    time: 0,
    runTime: 0,
    score: 0,
    best: Number(localStorage.getItem("blackCatFlapBest") || 0),
    speed: 210,
    pipeTimer: 0,
    shake: 0,
    flash: 0,
    reason: "",
    powerupTimer: 5.2,
    effectHudKey: "",
    toastTimer: 0,
    lastTs: performance.now(),
  };

  const player = {
    x: 0,
    y: 0,
    vy: 0,
    radius: 22,
    rotation: 0,
    tail: 0,
    alive: true,
    effects: {
      revive: 0,
      shield: 0,
      invincible: 0,
      white: 0,
      hitGrace: 0,
    },
  };

  const POWERUPS = Object.freeze({
    revive: { icon: "↻", label: "Second Chance", short: "REVIVE", duration: 15, color: "#72e6ff", glow: "#2dbbd7" },
    shield: { icon: "◆", label: "Force Field", short: "SHIELD", duration: 10, color: "#8ee7ff", glow: "#3f9ee8" },
    invincible: { icon: "★", label: "Immortality", short: "IMMORTAL", duration: 6, color: "#ffe067", glow: "#ff9f3e" },
    white: { icon: "◐", label: "White Cat", short: "WHITE CAT", duration: 10, color: "#fff7e8", glow: "#d0c9c1" },
  });
  const POWERUP_TYPES = Object.keys(POWERUPS);

  const pipes = [];
  const giantCats = [];
  const powerupCoins = [];
  const particles = [];
  const clouds = [];
  const skySpecks = [];

  const rand = (min, max) => min + Math.random() * (max - min);
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  // Lightweight WebAudio SFX: no external files needed for GitHub Pages.
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  }

  function tone(freq, duration = 0.08, type = "sine", gain = 0.035, slide = 0) {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const amp = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(35, freq + slide), now + duration);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp).connect(audioCtx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  function sfx(name) {
    ensureAudio();
    if (!audioCtx) return;
    if (name === "flap") tone(430, 0.07, "triangle", 0.025, 90);
    if (name === "score") { tone(740, 0.07, "square", 0.018, 80); setTimeout(() => tone(980, 0.08, "square", 0.014, 40), 55); }
    if (name === "warn") tone(210, 0.11, "sawtooth", 0.018, -45);
    if (name === "snap") { tone(90, 0.16, "square", 0.06, -45); tone(55, 0.22, "sawtooth", 0.035, -15); }
    if (name === "hit") tone(145, 0.24, "sawtooth", 0.055, -75);
    if (name === "power") { tone(660, 0.09, "triangle", 0.025, 160); setTimeout(() => tone(940, 0.11, "triangle", 0.02, 110), 70); }
    if (name === "shield") { tone(320, 0.08, "square", 0.025, 90); tone(620, 0.14, "sine", 0.02, -80); }
    if (name === "revive") { tone(420, 0.12, "triangle", 0.03, 260); setTimeout(() => tone(780, 0.18, "sine", 0.025, 180), 90); }
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    game.W = Math.max(1, rect.width);
    game.H = Math.max(1, rect.height);
    game.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(game.W * game.dpr);
    canvas.height = Math.floor(game.H * game.dpr);
    ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
    game.unit = clamp(game.H / 760, 0.60, 1.7);

    player.radius = clamp(22 * game.unit, 17, 34);
    player.x = clamp(game.W * (game.W > 900 ? 0.27 : 0.25), 92 * game.unit, 320 * game.unit);
    if (game.state === STATE.READY) player.y = game.H * 0.48;

    // Keep the persistent giant cat correctly scaled after rotations/resizes.
    for (const cat of giantCats) {
      cat.r = clamp(148 * game.unit, 108, 205);
      if (cat.phase === "open") {
        const follow = getCatFollowTarget(cat);
        cat.x = follow.x + cat.r * .18;
        cat.y = follow.y;
      }
    }

    buildAmbient();
  }

  function buildAmbient() {
    clouds.length = 0;
    skySpecks.length = 0;
    const count = Math.ceil(game.W / 180) + 3;
    for (let i = 0; i < count; i++) {
      clouds.push({
        x: rand(-100, game.W + 100),
        y: rand(game.H * 0.08, game.H * 0.83),
        s: rand(0.55, 1.35) * game.unit,
        speed: rand(5, 14) * game.unit,
        alpha: rand(0.45, 0.9),
      });
    }
    for (let i = 0; i < 24; i++) {
      skySpecks.push({ x: Math.random(), y: Math.random() * 0.88, r: rand(0.8, 2.2), a: rand(0.12, 0.28) });
    }
  }

  function resetRun() {
    pipes.length = 0;
    giantCats.length = 0;
    powerupCoins.length = 0;
    particles.length = 0;
    game.score = 0;
    game.runTime = 0;
    game.speed = 210 * game.unit;
    game.pipeTimer = 0.55;
    game.shake = 0;
    game.flash = 0;
    game.reason = "";
    // The first pipe carries a power coin so the player learns the system
    // before the giant cat's first bite cycle.
    game.powerupTimer = 0;
    game.effectHudKey = "";
    game.toastTimer = 0;
    player.y = game.H * 0.47;
    player.vy = 0;
    player.rotation = 0;
    player.tail = 0;
    player.alive = true;
    for (const key of Object.keys(player.effects)) player.effects[key] = 0;
    updateScore(0);
    updatePowerupHUD(true);
    hidePowerupToast();
    hazardEl.hidden = true;
    mobileTip.style.opacity = "1";
    spawnPersistentGiantCat();
  }

  function startGame() {
    ensureAudio();
    resetRun();
    game.state = STATE.PLAYING;
    startPanel.classList.remove("is-visible");
    gameoverPanel.classList.remove("is-visible");
    pausePanel.classList.remove("is-visible");
    pauseBtn.textContent = "Ⅱ";
    flap();
  }

  function endGame(reason) {
    if (game.state !== STATE.PLAYING) return "ignored";

    // Full immortality and the short post-hit grace window ignore damage entirely.
    if (player.effects.hitGrace > 0) return "immune";
    if (player.effects.invincible > 0) {
      player.effects.hitGrace = .12;
      burst(player.x, player.y, 10, "#ffe067", 95 * game.unit);
      return "immune";
    }

    // Force field is time-limited and absorbs exactly one hit while active.
    if (player.effects.shield > 0) {
      player.effects.shield = 0;
      player.effects.hitGrace = 1.15;
      game.shake = Math.max(game.shake, 5 * game.unit);
      game.flash = Math.max(game.flash, .24);
      sfx("shield");
      burst(player.x, player.y, 22, "#8ee7ff", 155 * game.unit);
      showPowerupToast("◆ FORCE FIELD BLOCKED THE HIT");
      updatePowerupHUD(true);
      return "shield";
    }

    // Second Chance is armed only for its timer. If damage happens in time, revive once.
    if (player.effects.revive > 0) {
      player.effects.revive = 0;
      reviveAtDeathPoint(reason);
      return "revive";
    }

    game.state = STATE.DEAD;
    player.alive = false;
    game.reason = reason;
    game.shake = 12 * game.unit;
    game.flash = 0.9;
    sfx(reason.includes("giant") ? "snap" : "hit");

    burst(player.x, player.y, 22, "#ffd04b", 180 * game.unit);
    burst(player.x, player.y, 14, "#ffffff", 150 * game.unit);

    if (game.score > game.best) {
      game.best = game.score;
      localStorage.setItem("blackCatFlapBest", String(game.best));
    }

    finalScoreEl.textContent = String(game.score);
    bestScoreEl.textContent = String(game.best);
    deathReasonEl.textContent = reason;
    hidePowerupToast();
    setTimeout(() => gameoverPanel.classList.add("is-visible"), 360);
    return "dead";
  }

  function reviveAtDeathPoint(reason) {
    const u = game.unit;
    const floor = game.H - 26 * u - player.radius;
    player.y = clamp(player.y, 30 * u + player.radius, floor);
    if (reason.includes("clouds below")) player.y = Math.max(game.H * .68, floor - 75 * u);
    player.vy = -270 * u;
    player.rotation = -.25;
    player.effects.hitGrace = 2.4;
    game.flash = Math.max(game.flash, .55);
    game.shake = Math.max(game.shake, 4 * u);

    // Remove only the threat overlapping the death point so the revive is playable,
    // while keeping the rest of the run intact.
    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      if (player.x + player.radius * 2 > p.x && player.x - player.radius * 2 < p.x + p.w) pipes.splice(i, 1);
    }
    for (const cat of giantCats) {
      cat.phase = "reopening";
      cat.phaseT = Math.max(.48, cat.reopenDuration);
      cat.openness = .18;
      cat.attackQueued = false;
      cat.biteScored = true;
    }

    sfx("revive");
    burst(player.x, player.y, 34, "#72e6ff", 190 * u);
    burst(player.x, player.y, 18, "#ffffff", 140 * u);
    showPowerupToast("↻ SECOND CHANCE — REVIVED");
    updatePowerupHUD(true);
  }

  function pauseGame() {
    if (game.state !== STATE.PLAYING) return;
    game.state = STATE.PAUSED;
    pausePanel.classList.add("is-visible");
    pauseBtn.textContent = "▶";
  }

  function resumeGame() {
    if (game.state !== STATE.PAUSED) return;
    game.state = STATE.PLAYING;
    game.lastTs = performance.now();
    pausePanel.classList.remove("is-visible");
    pauseBtn.textContent = "Ⅱ";
  }

  function flap() {
    if (game.state === STATE.READY) {
      startGame();
      return;
    }
    if (game.state !== STATE.PLAYING) return;
    player.vy = -440 * game.unit;
    player.rotation = -0.35;
    player.tail += 0.75;
    sfx("flap");
    for (let i = 0; i < 5; i++) {
      particles.push({
        x: player.x - player.radius * 1.0,
        y: player.y + rand(-player.radius * .2, player.radius * .45),
        vx: rand(-95, -30) * game.unit,
        vy: rand(-50, 55) * game.unit,
        life: rand(.22, .38),
        max: .38,
        r: rand(2.5, 5.5) * game.unit,
        color: "#ffffff",
      });
    }
  }

  function updateScore(add) {
    game.score += add;
    scoreEl.textContent = String(game.score);
    if (add > 0) sfx("score");
  }

  function spawnPipe() {
    const u = game.unit;
    const w = clamp(76 * u, 58, 118);
    const gap = clamp(game.H * (0.25 - Math.min(game.score, 35) * 0.0015), 158 * u, 235 * u);
    const topSafe = 88 * u;
    const bottomSafe = 95 * u;
    const center = rand(topSafe + gap / 2, game.H - bottomSafe - gap / 2);
    const pipe = { x: game.W + w + 20 * u, w, gap, center, scored: false };
    pipes.push(pipe);

    // Power-up coins are deliberately placed inside a pipe gap, so every spawn has a fair route.
    if (game.powerupTimer <= 0 && powerupCoins.length === 0) {
      spawnPowerupCoin(pipe);
      game.powerupTimer = rand(5.0, 7.0);
    }
  }

  function spawnPowerupCoin(pipe) {
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    const def = POWERUPS[type];
    powerupCoins.push({
      x: pipe.x + pipe.w * .5,
      y: pipe.center + rand(-pipe.gap * .19, pipe.gap * .19),
      baseY: pipe.center,
      r: clamp(18 * game.unit, 14, 28),
      type,
      spin: rand(0, Math.PI * 2),
      bob: rand(0, Math.PI * 2),
      color: def.color,
      collected: false,
    });
  }

  function spawnPersistentGiantCat() {
    giantCats.length = 0;
    const u = game.unit;
    const faceR = clamp(148 * u, 108, 205);
    const followX = player.x + faceR * .30;
    const followY = player.y - faceR * .22;
    giantCats.push({
      x: followX + faceR * .48,
      y: followY,
      r: faceR,
      phase: "open",
      phaseT: 4.80,
      openness: 1,
      warningDuration: 1.42,
      closeDuration: .74,
      snapDuration: .16,
      reopenDuration: .62,
      attackQueued: false,
      biteScored: false,
      bites: 0,
      escapeDirection: "UP",
      lockedX: followX,
      lockedY: followY,
      snapX: followX,
    });
  }

  function getCatFollowTarget(cat) {
    return {
      x: player.x + cat.r * .30,
      y: clamp(
        player.y - cat.r * .22,
        -cat.r * .08,
        game.H - cat.r * .72
      ),
    };
  }

  function isAttackLaneClear() {
    const u = game.unit;
    const left = player.x - 105 * u;
    const right = player.x + 185 * u;
    return pipes.every(p => p.x + p.w < left || p.x > right);
  }

  function nextOpenDuration(cat) {
    // The cat attacks often enough to remain the central mechanic, but the
    // safe/open interval never becomes too short to read.
    const pressure = Math.min(cat.bites, 8);
    return rand(Math.max(2.35, 3.25 - pressure * .07), Math.max(3.0, 4.0 - pressure * .06));
  }

  function queueCatAttack(cat) {
    if (cat.attackQueued) return;
    cat.attackQueued = true;
    // Once an attack is queued, new pipes stop spawning until the lane is clear.
    // This prevents a pipe + bite combination from creating an impossible dodge.
    game.pipeTimer = Math.max(game.pipeTimer, 1.2);
  }

  function beginCatWarning(cat) {
    const target = getCatFollowTarget(cat);
    cat.attackQueued = false;
    cat.phase = "warning";
    cat.phaseT = cat.warningDuration;
    cat.openness = 1;
    cat.biteScored = false;
    cat.lockedX = target.x;
    cat.lockedY = target.y;
    cat.snapX = player.x + cat.r * .06;

    const topRoom = player.y - (24 * game.unit + player.radius);
    const bottomRoom = (game.H - 38 * game.unit - player.radius) - player.y;
    cat.escapeDirection = topRoom >= bottomRoom ? "UP" : "DOWN";
    sfx("warn");
  }

  function activatePowerup(type) {
    const def = POWERUPS[type];
    if (!def) return;
    player.effects[type] = def.duration;
    if (type === "shield") player.effects.hitGrace = Math.max(player.effects.hitGrace, .25);
    sfx("power");
    burst(player.x, player.y, 20, def.color, 145 * game.unit);
    showPowerupToast(`${def.icon} ${def.label.toUpperCase()} — ${def.duration}s`);
    updatePowerupHUD(true);
  }

  function updateEffects(dt) {
    const keys = ["revive", "shield", "invincible", "white", "hitGrace"];
    for (const key of keys) player.effects[key] = Math.max(0, player.effects[key] - dt);
    if (game.toastTimer > 0) {
      game.toastTimer -= dt;
      if (game.toastTimer <= 0) hidePowerupToast();
    }
    updatePowerupHUD();
  }

  function updatePowerupHUD(force = false) {
    if (!powerupsEl) return;
    const active = POWERUP_TYPES.filter(type => player.effects[type] > 0);
    const key = active.map(type => `${type}:${Math.ceil(player.effects[type] * 2)}`).join("|");
    if (!force && key === game.effectHudKey) return;
    game.effectHudKey = key;
    if (!active.length) {
      powerupsEl.innerHTML = "";
      powerupsEl.hidden = true;
      return;
    }
    powerupsEl.hidden = false;
    powerupsEl.innerHTML = active.map(type => {
      const def = POWERUPS[type];
      return `<div class="power-chip power-${type}"><span class="power-icon">${def.icon}</span><span>${def.short}</span><strong>${player.effects[type].toFixed(1)}s</strong></div>`;
    }).join("");
  }

  function showPowerupToast(text) {
    if (!powerupToastEl) return;
    powerupToastEl.textContent = text;
    powerupToastEl.classList.add("is-visible");
    game.toastTimer = 1.65;
  }

  function hidePowerupToast() {
    if (!powerupToastEl) return;
    powerupToastEl.classList.remove("is-visible");
  }

  function updatePowerupCoins(dt) {
    for (let i = powerupCoins.length - 1; i >= 0; i--) {
      const c = powerupCoins[i];
      c.x -= game.speed * dt;
      c.spin += dt * 5.2;
      c.bob += dt * 3.5;
      const cy = c.y + Math.sin(c.bob) * 5 * game.unit;
      const dx = player.x - c.x;
      const dy = player.y - cy;
      const reach = player.radius * .72 + c.r;
      if (dx * dx + dy * dy <= reach * reach) {
        activatePowerup(c.type);
        powerupCoins.splice(i, 1);
        continue;
      }
      if (c.x + c.r < -30) powerupCoins.splice(i, 1);
    }
  }

  function burst(x, y, count, color, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * speed;
      particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(.35, .72),
        max: .72,
        r: rand(2.2, 6.2) * game.unit,
        color,
      });
    }
  }

  function update(dt) {
    game.time += dt;
    updateAmbient(dt);
    updateParticles(dt);
    game.flash = Math.max(0, game.flash - dt * 2.8);
    game.shake = Math.max(0, game.shake - dt * 28 * game.unit);

    if (game.state === STATE.READY) {
      player.y = game.H * 0.48 + Math.sin(game.time * 3.3) * 8 * game.unit;
      player.tail += dt * 2.2;
      return;
    }

    if (game.state === STATE.PAUSED) return;

    if (game.state === STATE.DEAD) {
      player.vy += 1250 * game.unit * dt;
      player.y += player.vy * dt;
      player.rotation = Math.min(1.4, player.rotation + dt * 2.8);
      const floorY = game.H - 20 * game.unit;
      if (player.y > floorY) {
        player.y = floorY;
        player.vy = 0;
      }
      return;
    }

    game.runTime += dt;
    updateEffects(dt);
    game.powerupTimer -= dt;
    mobileTip.style.opacity = game.runTime < 4 ? String(1 - game.runTime / 5) : "0";
    game.speed = (210 + Math.min(game.score, 40) * 3.2) * game.unit;

    // Player physics
    player.vy += 1220 * game.unit * dt;
    player.vy = Math.min(player.vy, 760 * game.unit);
    player.y += player.vy * dt;
    player.rotation = lerp(player.rotation, clamp(player.vy / (700 * game.unit), -0.45, 1.1), Math.min(1, dt * 6));
    player.tail += dt * 5;

    const ceil = 8 * game.unit;
    const floor = game.H - 18 * game.unit;
    if (player.y - player.radius < ceil) {
      player.y = ceil + player.radius;
      player.vy = Math.max(0, player.vy * .25);
    }
    if (player.y + player.radius >= floor) {
      const outcome = endGame("The black cat hit the clouds below.");
      if (outcome === "shield" || outcome === "immune") {
        player.y = floor - player.radius - 4 * game.unit;
        player.vy = -340 * game.unit;
      }
      return;
    }

    // Pipes continue during the giant cat's safe/open tracking phase. When an
    // attack is queued or the jaws are closing, spawning pauses until the lane
    // around the player is clear.
    game.pipeTimer -= dt;
    const cat = giantCats[0];
    const attackPhase = cat && ["warning", "closing", "snap", "reopening"].includes(cat.phase);
    const holdPipes = cat && (cat.attackQueued || attackPhase);
    if (!holdPipes && game.pipeTimer <= 0) {
      spawnPipe();
      const difficulty = Math.min(game.score, 30) / 30;
      game.pipeTimer = lerp(1.56, 1.30, difficulty);
    }

    updatePipes(dt);
    updatePowerupCoins(dt);
    updateGiantCats(dt);
  }

  function updateAmbient(dt) {
    const parallax = game.state === STATE.PLAYING ? 1 : .3;
    for (const c of clouds) {
      c.x -= c.speed * dt * parallax;
      if (c.x < -140 * c.s) {
        c.x = game.W + rand(40, 180);
        c.y = rand(game.H * 0.08, game.H * 0.82);
      }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * game.unit * dt;
      p.vx *= Math.pow(.985, dt * 60);
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function updatePipes(dt) {
    for (let i = pipes.length - 1; i >= 0; i--) {
      const p = pipes[i];
      p.x -= game.speed * dt;

      if (!p.scored && p.x + p.w < player.x - player.radius) {
        p.scored = true;
        updateScore(1);
        burst(player.x + 14 * game.unit, player.y, 7, "#fff6a9", 75 * game.unit);
      }

      const topBottom = p.center - p.gap / 2;
      const bottomTop = p.center + p.gap / 2;
      const px = player.x;
      const py = player.y;
      const rr = player.radius * .72;

      const overlapsX = px + rr > p.x && px - rr < p.x + p.w;
      if (overlapsX && (py - rr < topBottom || py + rr > bottomTop)) {
        const outcome = endGame("The black cat clipped a pipe.");
        if (outcome === "shield" || outcome === "revive") {
          player.y = clamp(p.center, player.radius + 14 * game.unit, game.H - player.radius - 30 * game.unit);
          player.vy = -150 * game.unit;
        }
        if (outcome === "dead") return;
      }

      if (p.x + p.w < -30) pipes.splice(i, 1);
    }
  }

  function updateGiantCats(dt) {
    let status = null;

    for (const cat of giantCats) {
      const follow = getCatFollowTarget(cat);

      if (cat.phase === "open") {
        // The giant cat is always present and trails the Black Cat with a small
        // amount of lag. This makes it feel like a pursuer without making its
        // bite unfair: once WARNING starts, tracking stops and the target locks.
        cat.x = lerp(cat.x, follow.x, Math.min(1, dt * 2.35));
        cat.y = lerp(cat.y, follow.y, Math.min(1, dt * 2.85));
        cat.openness = lerp(cat.openness, 1, Math.min(1, dt * 7));
        cat.phaseT -= dt;

        if (cat.phaseT <= 0) queueCatAttack(cat);

        if (cat.attackQueued) {
          status = { kind: "queued", t: 0, direction: cat.escapeDirection };
          if (isAttackLaneClear()) beginCatWarning(cat);
        } else {
          status = { kind: "open", t: Math.max(0, cat.phaseT) };
        }
      } else if (cat.phase === "warning") {
        cat.phaseT -= dt;
        cat.openness = 1;
        // Lock the mouth at the position telegraphed when the warning began.
        cat.x = lerp(cat.x, cat.lockedX, Math.min(1, dt * 5));
        cat.y = lerp(cat.y, cat.lockedY, Math.min(1, dt * 5));
        status = { kind: "warning", t: Math.max(0, cat.phaseT), direction: cat.escapeDirection };
        if (cat.phaseT <= 0) {
          cat.phase = "closing";
          cat.phaseT = cat.closeDuration;
          sfx("warn");
        }
      } else if (cat.phase === "closing") {
        cat.phaseT -= dt;
        const t = 1 - clamp(cat.phaseT / cat.closeDuration, 0, 1);
        const eased = t * t * (3 - 2 * t);
        cat.openness = 1 - eased;
        cat.x = lerp(cat.lockedX, cat.snapX, eased * .72);
        cat.y = cat.lockedY;
        status = { kind: "closing", t: Math.max(0, cat.phaseT), direction: cat.escapeDirection };
        if (cat.phaseT <= 0) {
          cat.phase = "snap";
          cat.phaseT = cat.snapDuration;
          cat.openness = 0;
          cat.x = cat.snapX;
          sfx("snap");
          game.shake = Math.max(game.shake, 7 * game.unit);
          game.flash = Math.max(game.flash, .28);
        }
      } else if (cat.phase === "snap") {
        cat.phaseT -= dt;
        cat.openness = 0;
        status = { kind: "snap", t: 0 };
        if (cat.phaseT <= 0) {
          if (!cat.biteScored) {
            cat.biteScored = true;
            cat.bites += 1;
            updateScore(2);
            burst(player.x + 16 * game.unit, player.y, 12, "#ffcf6d", 115 * game.unit);
            showPowerupToast("+2  CHOMP ESCAPED");
          }
          cat.phase = "reopening";
          cat.phaseT = cat.reopenDuration;
        }
      } else if (cat.phase === "reopening") {
        cat.phaseT -= dt;
        const t = 1 - clamp(cat.phaseT / cat.reopenDuration, 0, 1);
        const eased = t * t * (3 - 2 * t);
        cat.openness = eased;
        // Retreat slightly while reopening, then resume following.
        cat.x = lerp(cat.snapX, follow.x + cat.r * .25, eased);
        status = { kind: "safe", t: Math.max(0, cat.phaseT) };
        if (cat.phaseT <= 0) {
          cat.phase = "open";
          cat.phaseT = nextOpenDuration(cat);
          cat.openness = 1;
          cat.attackQueued = false;
          cat.x = follow.x + cat.r * .18;
          cat.y = lerp(cat.y, follow.y, .5);
        }
      }

      // Only the last portion of the visible close and the actual snap is lethal.
      // During WARNING the target is locked, so the player can deliberately exit
      // the dotted ellipse instead of being followed by the hitbox.
      if ((cat.phase === "closing" && cat.openness < .18) || cat.phase === "snap") {
        const mouth = getBiteGeometry(cat);
        if (circleEllipseOverlap(player.x, player.y, player.radius * .62, mouth.x, mouth.y, mouth.rx, mouth.ry)) {
          const outcome = endGame("The giant cat snapped shut with the black cat inside its mouth.");
          if (outcome === "shield" || outcome === "revive" || outcome === "immune") {
            cat.phase = "reopening";
            cat.phaseT = Math.max(.46, cat.reopenDuration * .78);
            cat.openness = .16;
            cat.attackQueued = false;
            cat.biteScored = true;
          }
          if (outcome === "dead") return;
        }
      }
    }

    if (status) {
      hazardEl.hidden = false;
      const compact = game.W < 560;
      if (status.kind === "warning") {
        const arrow = status.direction === "UP" ? "↑" : "↓";
        hazardTextEl.textContent = compact
          ? `BITE ${status.t.toFixed(1)}s ${arrow}`
          : `BITE IN ${status.t.toFixed(1)}s — ESCAPE ${arrow}`;
      } else if (status.kind === "closing") {
        hazardTextEl.textContent = compact
          ? `CLOSE ${status.t.toFixed(1)}s!`
          : `CLOSING ${status.t.toFixed(1)}s — OUTSIDE THE RING!`;
      } else if (status.kind === "snap") {
        hazardTextEl.textContent = "CHOMP!";
      } else if (status.kind === "safe") {
        hazardTextEl.textContent = compact ? "SAFE — OPENING" : "SAFE — MOUTH REOPENING";
      } else if (status.kind === "queued") {
        hazardTextEl.textContent = compact ? "OPEN — GET READY" : "MOUTH OPEN — CLEARING A FAIR LANE";
      } else {
        hazardTextEl.textContent = compact
          ? `TRACKING ${status.t.toFixed(1)}s`
          : `GIANT CAT TRACKING — ${status.t.toFixed(1)}s`;
      }
    } else {
      hazardEl.hidden = true;
    }
  }

  function getMouthGeometry(cat) {
    const r = cat.r;
    return {
      x: cat.x - r * .08,
      y: cat.y + r * .22,
      rx: r * .58,
      ry: Math.max(r * .085, r * (.17 + .33 * cat.openness)),
    };
  }

  function getBiteGeometry(cat) {
    const r = cat.r;
    return {
      x: cat.x - r * .08,
      y: cat.y + r * .22,
      rx: r * .52,
      ry: r * .40,
    };
  }

  function circleEllipseOverlap(cx, cy, cr, ex, ey, rx, ry) {
    if (rx <= 0 || ry <= 0) return false;
    const nx = (cx - ex) / (rx + cr);
    const ny = (cy - ey) / (ry + cr);
    return nx * nx + ny * ny <= 1;
  }

  function render() {
    const W = game.W;
    const H = game.H;
    ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const sx = game.shake ? rand(-game.shake, game.shake) : 0;
    const sy = game.shake ? rand(-game.shake * .55, game.shake * .55) : 0;
    ctx.save();
    ctx.translate(sx, sy);

    drawSky();
    drawCloudLayer();
    drawGiantCats();
    drawPipes();
    drawPowerupCoins();
    drawParticles();
    drawPlayer();
    drawForegroundClouds();

    ctx.restore();

    if (game.flash > 0) {
      ctx.fillStyle = `rgba(255,245,222,${Math.min(.55, game.flash * .55)})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, game.H);
    g.addColorStop(0, "#5bc1ef");
    g.addColorStop(.68, "#9fe4fb");
    g.addColorStop(1, "#dff8ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, game.W, game.H);

    for (const s of skySpecks) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(s.x * game.W, s.y * game.H, s.r * game.unit, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCloudLayer() {
    for (const c of clouds) drawCloud(c.x, c.y, c.s, c.alpha);
  }

  function drawCloud(x, y, s, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.ellipse(x, y, 46 * s, 20 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 28 * s, y + 2 * s, 28 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 29 * s, y + 3 * s, 32 * s, 17 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 5 * s, y - 16 * s, 26 * s, 26 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 17 * s, y - 10 * s, 21 * s, 22 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawForegroundClouds() {
    const y = game.H + 13 * game.unit;
    const r = 36 * game.unit;
    ctx.fillStyle = "rgba(255,255,255,.96)";
    for (let x = -r; x < game.W + r; x += r * 1.45) {
      const lift = (Math.sin(x * 0.037) * 4 + 4) * game.unit;
      ctx.beginPath();
      ctx.arc(x, y - lift, r, Math.PI, 0);
      ctx.fill();
    }
    ctx.fillRect(0, game.H - 10 * game.unit, game.W, 18 * game.unit);
  }

  function drawPipeBody(x, y, w, h, top) {
    const capH = Math.min(34 * game.unit, h * .18);
    const capExtra = 10 * game.unit;
    const edge = 3 * game.unit;
    if (h <= 0) return;

    ctx.save();
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, "#4d9d27");
    grad.addColorStop(.18, "#7bd33d");
    grad.addColorStop(.46, "#93ea45");
    grad.addColorStop(.76, "#57ad28");
    grad.addColorStop(1, "#38841f");

    ctx.fillStyle = grad;
    ctx.strokeStyle = "#2a6520";
    ctx.lineWidth = edge;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    ctx.fillStyle = "rgba(255,255,255,.22)";
    ctx.fillRect(x + w * .18, y + edge, w * .12, Math.max(0, h - edge * 2));

    const capY = top ? y + h - capH : y;
    ctx.fillStyle = grad;
    ctx.fillRect(x - capExtra, capY, w + capExtra * 2, capH);
    ctx.strokeRect(x - capExtra, capY, w + capExtra * 2, capH);
    ctx.fillStyle = "rgba(255,255,255,.18)";
    ctx.fillRect(x - capExtra + w * .15, capY + edge, w * .12, Math.max(0, capH - edge * 2));
    ctx.restore();
  }

  function drawPipes() {
    for (const p of pipes) {
      const topH = p.center - p.gap / 2;
      const bottomY = p.center + p.gap / 2;
      drawPipeBody(p.x, -4, p.w, topH + 4, true);
      drawPipeBody(p.x, bottomY, p.w, game.H - bottomY + 10, false);
    }
  }

  function drawPowerupCoins() {
    for (const c of powerupCoins) {
      const def = POWERUPS[c.type];
      const y = c.y + Math.sin(c.bob) * 5 * game.unit;
      const squash = .72 + Math.abs(Math.cos(c.spin)) * .28;
      ctx.save();
      ctx.translate(c.x, y);
      ctx.scale(squash, 1);

      ctx.shadowColor = def.glow;
      ctx.shadowBlur = 15 * game.unit;
      ctx.fillStyle = "#ffd95c";
      ctx.strokeStyle = "#8b5b16";
      ctx.lineWidth = Math.max(2, 2.5 * game.unit);
      ctx.beginPath();
      ctx.arc(0, 0, c.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(0, 0, c.r * .68, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(75,50,28,.38)";
      ctx.lineWidth = Math.max(1, 1.5 * game.unit);
      ctx.stroke();

      ctx.fillStyle = "#2d2728";
      ctx.font = `900 ${Math.max(13, c.r * .95)}px system-ui`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(def.icon, 0, 1 * game.unit);
      ctx.restore();
    }
  }

  function drawPlayer() {
    const r = player.radius;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.rotation * .72);
    const s = r / 22;
    const whiteMode = player.effects.white > 0;

    // Timed power-up feedback around the player.
    if (player.effects.invincible > 0) {
      ctx.save();
      ctx.globalAlpha = .55 + Math.sin(game.time * 13) * .18;
      ctx.strokeStyle = "#ffe067";
      ctx.lineWidth = 5 * s;
      ctx.shadowColor = "#ffb64d";
      ctx.shadowBlur = 18 * s;
      ctx.beginPath(); ctx.arc(0, 0, 39 * s, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    } else if (player.effects.shield > 0) {
      ctx.save();
      ctx.fillStyle = "rgba(142,231,255,.14)";
      ctx.strokeStyle = "rgba(92,198,255,.92)";
      ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.arc(0, 0, 39 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    if (player.effects.revive > 0) {
      ctx.save();
      ctx.rotate(game.time * 1.8);
      ctx.strokeStyle = "rgba(114,230,255,.85)";
      ctx.lineWidth = 2.4 * s;
      ctx.setLineDash([5 * s, 6 * s]);
      ctx.beginPath(); ctx.arc(0, 0, 44 * s, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // Speed streaks / flap wake
    if (game.state === STATE.PLAYING && player.vy < 0) {
      ctx.strokeStyle = "rgba(255,255,255,.92)";
      ctx.lineWidth = 3 * s;
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(-30 * s - i * 6 * s, (i - 1) * 7 * s, 10 * s + i * 4 * s, 2.6, 4.0);
        ctx.stroke();
      }
    }

    // Tail
    ctx.strokeStyle = whiteMode ? "#eee9e2" : "#1e1a20";
    ctx.lineWidth = 12 * s;
    ctx.lineCap = "round";
    ctx.beginPath();
    const tailWave = Math.sin(player.tail) * 7 * s;
    ctx.moveTo(-19 * s, 9 * s);
    ctx.bezierCurveTo(-42 * s, 17 * s, -46 * s, -3 * s + tailWave, -36 * s, -15 * s + tailWave * .3);
    ctx.stroke();
    ctx.strokeStyle = whiteMode ? "#8b8584" : "#0f0d10";
    ctx.lineWidth = 3 * s;
    ctx.stroke();

    // Body
    ctx.fillStyle = whiteMode ? "#f4f1ec" : "#232027";
    ctx.strokeStyle = whiteMode ? "#6e6968" : "#100e11";
    ctx.lineWidth = 2.7 * s;
    ctx.beginPath();
    ctx.ellipse(-4 * s, 9 * s, 30 * s, 19 * s, -.12, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // Ears + head
    ctx.beginPath();
    ctx.moveTo(-22 * s, -9 * s);
    ctx.lineTo(-16 * s, -31 * s);
    ctx.lineTo(-4 * s, -18 * s);
    ctx.quadraticCurveTo(8 * s, -24 * s, 21 * s, -15 * s);
    ctx.lineTo(33 * s, -28 * s);
    ctx.lineTo(34 * s, -4 * s);
    ctx.quadraticCurveTo(37 * s, 17 * s, 18 * s, 24 * s);
    ctx.quadraticCurveTo(-4 * s, 30 * s, -22 * s, 17 * s);
    ctx.quadraticCurveTo(-29 * s, 7 * s, -22 * s, -9 * s);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Inner ears
    ctx.fillStyle = "#8c4e53";
    ctx.beginPath(); ctx.moveTo(-17*s,-17*s); ctx.lineTo(-15*s,-27*s); ctx.lineTo(-8*s,-18*s); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(24*s,-17*s); ctx.lineTo(31*s,-25*s); ctx.lineTo(31*s,-12*s); ctx.closePath(); ctx.fill();

    // Eyes
    drawCatEye(-8*s, -3*s, 7.3*s, 9.2*s, s);
    drawCatEye(19*s, -2*s, 7.3*s, 9.2*s, s);

    // Nose / smile
    ctx.fillStyle = "#e47e79";
    ctx.beginPath(); ctx.ellipse(6*s, 8*s, 3.4*s, 2.5*s, 0, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#100e11"; ctx.lineWidth = 1.7*s; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(6*s,10*s); ctx.quadraticCurveTo(3*s,14*s,0*s,12*s); ctx.moveTo(6*s,10*s); ctx.quadraticCurveTo(9*s,14*s,12*s,12*s); ctx.stroke();

    // Whiskers
    ctx.strokeStyle = "#0f0d10"; ctx.lineWidth = 1.5*s;
    for (const dy of [-1, 5]) {
      ctx.beginPath(); ctx.moveTo(-17*s, (7+dy)*s); ctx.lineTo(-33*s, (4+dy)*s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(28*s, (7+dy)*s); ctx.lineTo(42*s, (4+dy)*s); ctx.stroke();
    }

    // Front paws, slightly animated
    const paw = Math.sin(game.time * 11) * 2 * s;
    ctx.fillStyle = whiteMode ? "#e9e5df" : "#28242c";
    ctx.beginPath(); ctx.ellipse(10*s, 19*s + paw, 9*s, 6*s, -.18, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-17*s, 18*s - paw, 9*s, 6*s, .18, 0, Math.PI*2); ctx.fill();

    ctx.restore();
  }

  function drawCatEye(x, y, rx, ry, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = "#f2b842";
    ctx.strokeStyle = "#0f0d10";
    ctx.lineWidth = 1.7 * s;
    ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#171116";
    ctx.beginPath(); ctx.ellipse(1.3*s, .5*s, rx*.37, ry*.7, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-1.2*s, -3.1*s, 1.8*s, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawGiantCats() {
    for (const cat of giantCats) drawGiantCat(cat);
  }

  function drawGiantCat(cat) {
    const r = cat.r;
    const open = cat.openness;
    const mouth = getMouthGeometry(cat);

    ctx.save();
    ctx.translate(cat.x, cat.y);

    // Shadow halo
    ctx.fillStyle = "rgba(61, 61, 73, .12)";
    ctx.beginPath(); ctx.ellipse(0, r*.18, r*.93, r*.88, 0, 0, Math.PI*2); ctx.fill();

    // Ears behind face
    ctx.fillStyle = "#a56f62";
    ctx.strokeStyle = "#6b433e";
    ctx.lineWidth = Math.max(3, r * .025);
    ctx.beginPath(); ctx.moveTo(-r*.66,-r*.44); ctx.lineTo(-r*.52,-r*.98); ctx.lineTo(-r*.16,-r*.54); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(r*.43,-r*.55); ctx.lineTo(r*.76,-r*.92); ctx.lineTo(r*.74,-r*.30); ctx.closePath(); ctx.fill(); ctx.stroke();

    ctx.fillStyle = "#d28f7f";
    ctx.beginPath(); ctx.moveTo(-r*.55,-r*.49); ctx.lineTo(-r*.50,-r*.82); ctx.lineTo(-r*.28,-r*.54); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r*.51,-r*.57); ctx.lineTo(r*.70,-r*.81); ctx.lineTo(r*.67,-r*.38); ctx.closePath(); ctx.fill();

    // Face
    const fur = ctx.createRadialGradient(-r*.15,-r*.25,r*.15, 0,0,r);
    fur.addColorStop(0, "#cfaa95");
    fur.addColorStop(.65, "#b88978");
    fur.addColorStop(1, "#966657");
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.ellipse(0, 0, r*.80, r*.78, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();

    // Forehead markings
    ctx.strokeStyle = "rgba(106,69,64,.75)";
    ctx.lineWidth = r*.035;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-r*.18,-r*.62); ctx.lineTo(-r*.10,-r*.45);
    ctx.moveTo(0,-r*.66); ctx.lineTo(0,-r*.45);
    ctx.moveTo(r*.18,-r*.62); ctx.lineTo(r*.10,-r*.45);
    ctx.stroke();

    // Eyes
    drawGiantEye(-r*.28, -r*.30, r, -0.12);
    drawGiantEye(r*.28, -r*.30, r, 0.12);

    // Upper muzzle
    ctx.fillStyle = "#ead7c5";
    ctx.beginPath(); ctx.ellipse(-r*.21, r*.02, r*.29, r*.23, -.08, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r*.21, r*.02, r*.29, r*.23, .08, 0, Math.PI*2); ctx.fill();

    // Lower jaw physically drops while the mouth is open, making the bite cycle
    // readable even without looking at the HUD countdown.
    const jawDrop = r * (.035 + .12 * open);
    ctx.fillStyle = "#a97466";
    ctx.strokeStyle = "#6b433e";
    ctx.lineWidth = Math.max(2, r * .017);
    ctx.beginPath();
    ctx.ellipse(0, r * .36 + jawDrop, r * .49, r * .22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Mouth cavity changes with openness.
    ctx.fillStyle = "#4a2428";
    ctx.beginPath();
    ctx.ellipse(mouth.x - cat.x, mouth.y - cat.y, mouth.rx, mouth.ry, 0, 0, Math.PI*2);
    ctx.fill();

    // Tongue appears mostly when open.
    if (open > .13) {
      ctx.fillStyle = "#e7857f";
      ctx.beginPath(); ctx.ellipse(0, r*(.30 + .17*open), r*.31, r*(.08 + .12*open), 0, 0, Math.PI*2); ctx.fill();
    }

    // Teeth anchored to upper/lower jaws.
    drawTeeth(r, open);

    // Nose
    ctx.fillStyle = "#aa6761";
    ctx.strokeStyle = "#794a48";
    ctx.lineWidth = r*.018;
    ctx.beginPath();
    ctx.moveTo(-r*.12, -r*.02); ctx.quadraticCurveTo(0, r*.08, r*.12, -r*.02); ctx.quadraticCurveTo(0, -r*.08, -r*.12, -r*.02); ctx.fill(); ctx.stroke();

    // Mouth side lines / whiskers
    ctx.strokeStyle = "rgba(98,60,58,.7)";
    ctx.lineWidth = r*.014;
    for (const dy of [0, .08, .16]) {
      ctx.beginPath(); ctx.moveTo(-r*.36, r*(.02+dy)); ctx.lineTo(-r*.68, r*(.01+dy)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(r*.36, r*(.02+dy)); ctx.lineTo(r*.68, r*(.01+dy)); ctx.stroke();
    }

    // Mouth danger telegraph: the dotted ellipse shows the actual bite zone before it becomes lethal.
    if (cat.phase === "warning" || cat.phase === "closing") {
      ctx.save();
      ctx.strokeStyle = cat.phase === "closing" ? "rgba(255,91,58,.92)" : "rgba(255,222,92,.88)";
      ctx.lineWidth = Math.max(2, r * .014);
      ctx.setLineDash([r * .045, r * .035]);
      ctx.globalAlpha = .68 + Math.sin(game.time * 10) * .18;
      ctx.beginPath();
      ctx.ellipse(mouth.x - cat.x, mouth.y - cat.y, r * .52, r * .40, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      if (cat.phase === "warning") {
        ctx.save();
        const up = cat.escapeDirection === "UP";
        const ay = (mouth.y - cat.y) + (up ? -r * .58 : r * .62);
        ctx.globalAlpha = .72 + Math.sin(game.time * 9) * .20;
        ctx.fillStyle = "#fff6b8";
        ctx.strokeStyle = "rgba(82,47,42,.72)";
        ctx.lineWidth = Math.max(2, r * .012);
        ctx.font = `900 ${Math.max(24, r * .18)}px ui-rounded, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.strokeText(up ? "↑" : "↓", mouth.x - cat.x, ay);
        ctx.fillText(up ? "↑" : "↓", mouth.x - cat.x, ay);
        ctx.restore();
      }
    }

    // Alert accents when closing.
    if (cat.phase === "closing" || cat.phase === "snap") {
      ctx.strokeStyle = "#ff8446";
      ctx.lineWidth = r*.022;
      ctx.lineCap = "round";
      const pulse = 1 + Math.sin(game.time * 18) * .08;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const ay = (-.23 + i*.17) * r;
          const ax = side * r * (.86 + i*.04);
          ctx.beginPath();
          ctx.moveTo(ax, ay);
          ctx.lineTo(ax + side*r*.10*pulse, ay - r*.025);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
  }

  function drawGiantEye(x, y, r, tilt) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.fillStyle = "#f7f2e9";
    ctx.strokeStyle = "#6f443f";
    ctx.lineWidth = r*.018;
    ctx.beginPath(); ctx.ellipse(0, 0, r*.13, r*.095, 0, 0, Math.PI*2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#5b3128";
    ctx.beginPath(); ctx.ellipse(r*.015, 0, r*.054, r*.069, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#171012";
    ctx.beginPath(); ctx.ellipse(r*.02, 0, r*.026, r*.053, 0, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-r*.006, -r*.03, r*.014, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawTeeth(r, open) {
    const topY = r * (.09 + .02 * (1-open));
    const lowerY = r * (.36 * open + .16);
    const toothW = r * .065;
    const toothH = r * (.11 + .04*open);

    ctx.fillStyle = "#fff6e8";
    ctx.strokeStyle = "#8b625d";
    ctx.lineWidth = r*.009;

    const xs = [-.42,-.30,-.18,-.06,.06,.18,.30,.42];
    for (let i = 0; i < xs.length; i++) {
      const x = xs[i] * r;
      const h = toothH * (i===0 || i===7 ? 1.25 : 1);
      ctx.beginPath();
      ctx.moveTo(x - toothW*.48, topY);
      ctx.lineTo(x + toothW*.48, topY);
      ctx.lineTo(x, topY + h);
      ctx.closePath(); ctx.fill(); ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x - toothW*.45, lowerY);
      ctx.lineTo(x + toothW*.45, lowerY);
      ctx.lineTo(x, lowerY - h*.82);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  function loop(ts) {
    const rawDt = (ts - game.lastTs) / 1000;
    game.lastTs = ts;
    const dt = Math.min(rawDt || 0, 0.033);
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function onPrimaryAction(e) {
    if (e && e.target && (e.target.closest("button") || e.target.closest(".panel"))) return;
    flap();
  }

  playBtn.addEventListener("click", startGame);
  retryBtn.addEventListener("click", startGame);
  resumeBtn.addEventListener("click", resumeGame);
  pauseBtn.addEventListener("click", () => game.state === STATE.PAUSED ? resumeGame() : pauseGame());
  flapBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); e.stopPropagation(); flap(); });

  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); onPrimaryAction(e); });

  window.addEventListener("keydown", (e) => {
    if (["Space", "ArrowUp", "KeyW"].includes(e.code)) {
      e.preventDefault();
      if (game.state === STATE.DEAD) startGame(); else flap();
    } else if (e.code === "Escape" || e.code === "KeyP") {
      e.preventDefault();
      if (game.state === STATE.PLAYING) pauseGame();
      else if (game.state === STATE.PAUSED) resumeGame();
    } else if (e.code === "Enter" && game.state === STATE.READY) {
      startGame();
    }
  }, { passive: false });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.state === STATE.PLAYING) pauseGame();
  });

  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("orientationchange", () => setTimeout(resize, 80), { passive: true });

  resize();
  resetRun();
  requestAnimationFrame(loop);
})();

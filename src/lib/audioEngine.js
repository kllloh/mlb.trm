// ── Audio graph ───────────────────────────────────────────────────────────────
let AC = null, master = null, shortReverb = null, longReverb = null
let BPM = 120

// Beat subdivisions (fractions of a quarter note) used for delay times.
// Returns absolute seconds so any BPM produces in-tempo echoes.
function beatSecs(...divs) { return divs.map(d => (60 / BPM) * d) }

export function setBpm(bpm) { BPM = bpm }

function buildImpulse(seconds, decay, preDelaySec = 0) {
  const rate = AC.sampleRate
  const pre  = Math.floor(rate * preDelaySec)
  const len  = Math.ceil(rate * seconds) + pre
  const buf  = AC.createBuffer(2, len, rate)
  for (let ch = 0; ch < 2; ch++) {
    const d  = buf.getChannelData(ch)
    const dc = decay * (ch === 0 ? 1 : 0.96)
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, dc)
    }
  }
  return buf
}

function setup() {
  if (AC) return
  AC = new AudioContext()
  master = AC.createGain(); master.gain.value = 0.75; master.connect(AC.destination)
  shortReverb = AC.createConvolver(); shortReverb.buffer = buildImpulse(1.4, 2.2, 0.010)
  const sg = AC.createGain(); sg.gain.value = 0.28; shortReverb.connect(sg); sg.connect(master)
  longReverb  = AC.createConvolver(); longReverb.buffer  = buildImpulse(5.5, 0.7, 0.030)
  const lg = AC.createGain(); lg.gain.value = 0.65; longReverb.connect(lg); lg.connect(master)
}

// ── All sounds use pure sine oscillators only ─────────────────────────────────

// ── Short sine strikes (the 20%) ─────────────────────────────────────────────
const PERC = {
  // Brief mid-range ding — sudden onset, clean tail
  ding(d, n, v=0.5, f=660) {
    const o=AC.createOscillator(), g=AC.createGain()
    o.frequency.value=f
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+0.45)
    o.connect(g); g.connect(d); o.start(n); o.stop(n+0.47)
  },
  // Low sine tok — pitched thump with brief tail
  tok(d, n, v=0.6, f=180) {
    const o=AC.createOscillator(), g=AC.createGain()
    o.frequency.setValueAtTime(f*1.5,n); o.frequency.exponentialRampToValueAtTime(f,n+0.04)
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+0.22)
    o.connect(g); g.connect(d); o.start(n); o.stop(n+0.24)
  },
  // High brief ping — very short, glassy
  ping(d, n, v=0.45, f=1760) {
    const o=AC.createOscillator(), g=AC.createGain()
    o.frequency.value=f
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+0.28)
    o.connect(g); g.connect(d); o.start(n); o.stop(n+0.30)
  },
  // Rising then falling sine pop — "water drop" feel
  pop(d, n, v=0.55, f=440) {
    const o=AC.createOscillator(), g=AC.createGain()
    o.frequency.setValueAtTime(f*0.6,n); o.frequency.linearRampToValueAtTime(f*2.2,n+0.04)
    o.frequency.exponentialRampToValueAtTime(f*0.5,n+0.15)
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+0.17)
    o.connect(g); g.connect(d); o.start(n); o.stop(n+0.19)
  },
  // Ultra-brief sine blip
  blip(d, n, v=0.6, f=880) {
    const o=AC.createOscillator(), g=AC.createGain()
    o.frequency.value=f
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+0.07)
    o.connect(g); g.connect(d); o.start(n); o.stop(n+0.08)
  },
  // Brief mid tap with slight pitch dip
  tap(d, n, v=0.5, f=330) {
    const o=AC.createOscillator(), g=AC.createGain()
    o.frequency.setValueAtTime(f*1.3,n); o.frequency.exponentialRampToValueAtTime(f,n+0.05)
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+0.16)
    o.connect(g); g.connect(d); o.start(n); o.stop(n+0.18)
  },
  // High descending drip
  drip(d, n, v=0.4, f=2200) {
    const o=AC.createOscillator(), g=AC.createGain()
    o.frequency.setValueAtTime(f,n); o.frequency.exponentialRampToValueAtTime(f*0.65,n+0.10)
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+0.12)
    o.connect(g); g.connect(d); o.start(n); o.stop(n+0.14)
  },
  // Very brief tick — just an onset transient
  tick(d, n, v=0.7, f=1200) {
    const o=AC.createOscillator(), g=AC.createGain()
    o.frequency.value=f
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+0.035)
    o.connect(g); g.connect(d); o.start(n); o.stop(n+0.04)
  },
  // Descending sine sweep — whoosh down
  drop(d, n, v=0.5, f=550) {
    const o=AC.createOscillator(), g=AC.createGain()
    o.frequency.setValueAtTime(f*3.5,n); o.frequency.exponentialRampToValueAtTime(f*0.28,n+0.38)
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+0.40)
    o.connect(g); g.connect(d); o.start(n); o.stop(n+0.42)
  },
  // FM sine chime — modulator at 2× gives harmonic shimmer
  chime(d, n, v=0.45, f=440) {
    const mod=AC.createOscillator(), mg=AC.createGain(), car=AC.createOscillator(), g=AC.createGain()
    mod.frequency.value=f*2; mg.gain.setValueAtTime(f*3,n); mg.gain.exponentialRampToValueAtTime(0,n+0.28)
    mod.connect(mg); mg.connect(car.frequency); car.frequency.value=f
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+0.56)
    car.connect(g); g.connect(d)
    mod.start(n); mod.stop(n+0.56); car.start(n); car.stop(n+0.58)
  },
}

// ── Sustained sine tones (the 80%) ────────────────────────────────────────────
const SYNTH = {
  // Long harmonic FM bell — mod at 2×, decaying mod depth creates shimmer→pure
  bell(d, n, v=0.38, f=220) {
    const mod=AC.createOscillator(), mg=AC.createGain(), car=AC.createOscillator(), g=AC.createGain()
    mod.frequency.value=f*2; mg.gain.setValueAtTime(f*4,n); mg.gain.exponentialRampToValueAtTime(f*0.04,n+2.8)
    mod.connect(mg); mg.connect(car.frequency); car.frequency.value=f
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+3.2)
    car.connect(g); g.connect(d)
    mod.start(n); mod.stop(n+3.2); car.start(n); car.stop(n+3.25)
  },
  // Simple pure sine — slow attack, long decay
  tone(d, n, v=0.35, f=330) {
    const o=AC.createOscillator(), g=AC.createGain()
    o.frequency.value=f
    g.gain.setValueAtTime(0,n); g.gain.linearRampToValueAtTime(v,n+0.08)
    g.gain.exponentialRampToValueAtTime(0.001,n+2.8)
    o.connect(g); g.connect(d); o.start(n); o.stop(n+2.9)
  },
  // High-frequency shimmer — quick fade, airy
  shimmer(d, n, v=0.28, f=1320) {
    const o=AC.createOscillator(), g=AC.createGain()
    o.frequency.value=f
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+1.4)
    o.connect(g); g.connect(d); o.start(n); o.stop(n+1.45)
  },
  // Detuned 3-voice pad — sines very slightly apart, slow bloom
  pad(d, n, v=0.28, f=220) {
    [f, f*1.006, f*0.994].forEach(freq => {
      const o=AC.createOscillator(), g=AC.createGain()
      o.frequency.value=freq
      g.gain.setValueAtTime(0,n); g.gain.linearRampToValueAtTime(v/3,n+0.22)
      g.gain.exponentialRampToValueAtTime(0.001,n+3.5)
      o.connect(g); g.connect(d); o.start(n); o.stop(n+3.6)
    })
  },
  // Low sub sine — punchy pitched bass hit
  sub(d, n, v=0.75, f=55) {
    const o=AC.createOscillator(), g=AC.createGain()
    o.frequency.setValueAtTime(f*1.6,n); o.frequency.exponentialRampToValueAtTime(f,n+0.05)
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+0.6)
    o.connect(g); g.connect(d); o.start(n); o.stop(n+0.65)
  },
  // Detuned trio drone — very slow bloom, long sustain
  drone(d, n, v=0.26, f=110) {
    [f, f*1.014, f*0.988].forEach(freq => {
      const o=AC.createOscillator(), g=AC.createGain()
      o.frequency.value=freq
      g.gain.setValueAtTime(0,n); g.gain.linearRampToValueAtTime(v/3,n+0.30)
      g.gain.exponentialRampToValueAtTime(0.001,n+3.2)
      o.connect(g); g.connect(d); o.start(n); o.stop(n+3.3)
    })
  },
  // FM warm — mod at 3/2 (perfect fifth) gives mellow harmonic colour
  warm(d, n, v=0.40, f=220) {
    const mod=AC.createOscillator(), mg=AC.createGain(), car=AC.createOscillator(), g=AC.createGain()
    mod.frequency.value=f*1.5; mg.gain.setValueAtTime(f*2.5,n); mg.gain.exponentialRampToValueAtTime(f*0.08,n+1.8)
    mod.connect(mg); mg.connect(car.frequency); car.frequency.value=f
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+2.4)
    car.connect(g); g.connect(d)
    mod.start(n); mod.stop(n+2.4); car.start(n); car.stop(n+2.45)
  },
  // FM bright — mod at 4× gives upper harmonic cluster
  bright(d, n, v=0.32, f=330) {
    const mod=AC.createOscillator(), mg=AC.createGain(), car=AC.createOscillator(), g=AC.createGain()
    mod.frequency.value=f*4; mg.gain.setValueAtTime(f*6,n); mg.gain.exponentialRampToValueAtTime(f*0.12,n+0.9)
    mod.connect(mg); mg.connect(car.frequency); car.frequency.value=f
    g.gain.setValueAtTime(v,n); g.gain.exponentialRampToValueAtTime(0.001,n+1.8)
    car.connect(g); g.connect(d)
    mod.start(n); mod.stop(n+1.8); car.start(n); car.stop(n+1.85)
  },
  // Crystal — fundamental + 4th harmonic sine, long ring
  crystal(d, n, v=0.28, f=880) {
    [[f, v], [f*4, v*0.28]].forEach(([freq, vol]) => {
      const o=AC.createOscillator(), g=AC.createGain()
      o.frequency.value=freq
      g.gain.setValueAtTime(vol,n); g.gain.exponentialRampToValueAtTime(0.001,n+2.0)
      o.connect(g); g.connect(d); o.start(n); o.stop(n+2.05)
    })
  },
  // Swell — slow amplitude rise then fade, one sine
  swell(d, n, v=0.32, f=196) {
    const o=AC.createOscillator(), g=AC.createGain()
    o.frequency.value=f
    g.gain.setValueAtTime(0,n); g.gain.linearRampToValueAtTime(v,n+0.5)
    g.gain.linearRampToValueAtTime(0,n+2.4)
    o.connect(g); g.connect(d); o.start(n); o.stop(n+2.45)
  },
  // Root + perfect fifth — open two-voice harmony
  fifth(d, n, v=0.30, f=220) {
    [f, f*1.5].forEach((freq, i) => {
      const o=AC.createOscillator(), g=AC.createGain()
      o.frequency.value=freq
      g.gain.setValueAtTime(0,n); g.gain.linearRampToValueAtTime(v*(i===0?0.65:0.42),n+0.10)
      g.gain.exponentialRampToValueAtTime(0.001,n+2.8)
      o.connect(g); g.connect(d); o.start(n); o.stop(n+2.9)
    })
  },
  // Root + octave — open, hollow tone
  octave(d, n, v=0.28, f=165) {
    [f, f*2].forEach((freq, i) => {
      const o=AC.createOscillator(), g=AC.createGain()
      o.frequency.value=freq
      g.gain.setValueAtTime(0,n); g.gain.linearRampToValueAtTime(v*(i===0?0.68:0.32),n+0.07)
      g.gain.exponentialRampToValueAtTime(0.001,n+2.5)
      o.connect(g); g.connect(d); o.start(n); o.stop(n+2.6)
    })
  },
  // Beating pair — two very slightly detuned sines create organic tremolo
  trem(d, n, v=0.35, f=293) {
    [f, f*1.009].forEach(freq => {
      const o=AC.createOscillator(), g=AC.createGain()
      o.frequency.value=freq
      g.gain.setValueAtTime(0,n); g.gain.linearRampToValueAtTime(v/2,n+0.12)
      g.gain.exponentialRampToValueAtTime(0.001,n+2.8)
      o.connect(g); g.connect(d); o.start(n); o.stop(n+2.85)
    })
  },
  // Very soft high wisp — slow attack, airy
  wisp(d, n, v=0.20, f=1320) {
    const o=AC.createOscillator(), g=AC.createGain()
    o.frequency.value=f
    g.gain.setValueAtTime(0,n); g.gain.linearRampToValueAtTime(v,n+0.35)
    g.gain.exponentialRampToValueAtTime(0.001,n+1.8)
    o.connect(g); g.connect(d); o.start(n); o.stop(n+1.85)
  },
}

const ALL_SYNTHS = { ...PERC, ...SYNTH }

// ── Exported type lists ───────────────────────────────────────────────────────
export const PERC_IDS  = Object.keys(PERC)
export const SYNTH_IDS = Object.keys(SYNTH)

// ── Instrument sets ───────────────────────────────────────────────────────────
// Each function: (dest, now, vol, freq) → schedules oscillators into dest node.
// All voices are pure sine; character comes from envelope + harmonic structure.

function marimbaFn(dest, now, vol, freq) {
  // Fundamental — pitched mallet thump with ~1 s resonant decay
  const o1 = AC.createOscillator(), g1 = AC.createGain()
  o1.frequency.setValueAtTime(freq * 1.012, now)        // slight strike pitch
  o1.frequency.exponentialRampToValueAtTime(freq, now + 0.010)
  g1.gain.setValueAtTime(vol, now)
  g1.gain.exponentialRampToValueAtTime(0.001, now + 1.2)
  o1.connect(g1); g1.connect(dest); o1.start(now); o1.stop(now + 1.25)
  // 4th partial (two octaves up) — fast attack gives the woody "click"
  const o2 = AC.createOscillator(), g2 = AC.createGain()
  o2.frequency.value = freq * 4
  g2.gain.setValueAtTime(vol * 0.45, now)
  g2.gain.exponentialRampToValueAtTime(0.001, now + 0.07)
  o2.connect(g2); g2.connect(dest); o2.start(now); o2.stop(now + 0.09)
}

function pianoFn(dest, now, vol, freq) {
  // Additive harmonic series — higher partials decay faster (natural piano behaviour).
  // Slight inharmonicity (freq * mult where mult > integer) mimics string stiffness.
  const partials = [
    [1.000, 0.90, 3.2],
    [2.001, 0.55, 2.0],
    [3.003, 0.28, 1.2],
    [4.006, 0.14, 0.7],
    [5.012, 0.07, 0.4],
    [6.020, 0.03, 0.2],
  ]
  partials.forEach(([mult, amp, dec]) => {
    const o = AC.createOscillator(), g = AC.createGain()
    o.frequency.value = freq * mult
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(vol * amp, now + 0.007)  // fast hammer attack
    g.gain.exponentialRampToValueAtTime(0.001, now + dec)
    o.connect(g); g.connect(dest); o.start(now); o.stop(now + dec + 0.05)
  })
}

function oldPianoFn(dest, now, vol, freq) {
  // Honky-tonk upright — pairs of detuned partials create the characteristic wobble/beating.
  // Slightly harder attack and shorter decay than the clean piano.
  const partials = [
    [1.000, 0.85, 2.2],
    [1.014, 0.60, 1.8],   // detuned unison — main wobble source
    [2.001, 0.42, 1.3],
    [2.022, 0.28, 1.0],   // detuned octave
    [3.003, 0.18, 0.7],
    [4.008, 0.08, 0.4],
  ]
  partials.forEach(([mult, amp, dec]) => {
    const o = AC.createOscillator(), g = AC.createGain()
    o.frequency.value = freq * mult
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(vol * amp, now + 0.005)   // snappier hammer
    g.gain.exponentialRampToValueAtTime(0.001, now + dec)
    o.connect(g); g.connect(dest); o.start(now); o.stop(now + dec + 0.05)
  })
}

function stringsFn(dest, now, vol, freq) {
  // 5-voice ensemble with slight per-voice detuning → warm chorus / beating
  const detunes = [-0.015, -0.006, 0, 0.006, 0.015]
  detunes.forEach(d => {
    const o = AC.createOscillator(), g = AC.createGain()
    o.frequency.value = freq * (1 + d)
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(vol * 0.14, now + 0.28)  // slow bow-on attack
    g.gain.setValueAtTime(vol * 0.14, now + 1.5)             // sustain plateau
    g.gain.exponentialRampToValueAtTime(0.001, now + 2.8)
    o.connect(g); g.connect(dest); o.start(now); o.stop(now + 2.9)
  })
  // Octave harmonic adds warmth / body
  const oh = AC.createOscillator(), gh = AC.createGain()
  oh.frequency.value = freq * 2
  gh.gain.setValueAtTime(0, now)
  gh.gain.linearRampToValueAtTime(vol * 0.10, now + 0.32)
  gh.gain.exponentialRampToValueAtTime(0.001, now + 2.2)
  oh.connect(gh); gh.connect(dest); oh.start(now); oh.stop(now + 2.25)
}

function glitchFn(dest, now, vol, freq) {
  // Stutter burst: 5 short sine pops, each starting high and crashing down.
  // Gaps of ~22 ms between them create the digital-glitch stutter feel.
  // Amplitude tapers so the burst decays naturally into silence.
  const stutterOffsets = [0, 0.022, 0.048, 0.078, 0.112]
  stutterOffsets.forEach((dt, i) => {
    const t = now + dt
    const o = AC.createOscillator(), g = AC.createGain()
    o.frequency.setValueAtTime(freq * (4.0 - i * 0.55), t)
    o.frequency.exponentialRampToValueAtTime(freq * Math.max(0.5, 1.1 - i * 0.1), t + 0.016)
    g.gain.setValueAtTime(vol * (1.0 - i * 0.16), t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.018)
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + 0.020)
  })

  // Soft pad: 3 detuned sines bloom slowly underneath the stutter,
  // giving warmth and sustain after the glitch burst fades.
  [-0.011, 0, 0.011].forEach(d => {
    const o = AC.createOscillator(), g = AC.createGain()
    o.frequency.value = freq * (1 + d)
    g.gain.setValueAtTime(0, now)
    g.gain.linearRampToValueAtTime(vol * 0.19, now + 0.20)
    g.gain.setValueAtTime(vol * 0.19, now + 1.1)
    g.gain.exponentialRampToValueAtTime(0.001, now + 3.0)
    o.connect(g); g.connect(dest); o.start(now); o.stop(now + 3.1)
  })

  // Octave shimmer — brief high partial to sharpen the initial transient
  const oh = AC.createOscillator(), gh = AC.createGain()
  oh.frequency.value = freq * 2
  gh.gain.setValueAtTime(vol * 0.38, now)
  gh.gain.exponentialRampToValueAtTime(0.001, now + 0.10)
  oh.connect(gh); gh.connect(dest); oh.start(now); oh.stop(now + 0.12)
}

function aphexFn(dest, now, vol, freq) {
  // ── Sub-bass ─────────────────────────────────────────────────────────────────
  // Deep sine two octaves below, tiny pitch-bend up-then-settle on attack.
  // Carries the low-end weight characteristic of SAW Vol. II / Alberto Balsam.
  const bf = freq / 4
  const ob = AC.createOscillator(), gb = AC.createGain()
  ob.frequency.setValueAtTime(bf * 1.020, now)
  ob.frequency.exponentialRampToValueAtTime(bf, now + 0.10)
  gb.gain.setValueAtTime(0, now)
  gb.gain.linearRampToValueAtTime(vol * 0.90, now + 0.09)
  gb.gain.exponentialRampToValueAtTime(0.001, now + 3.4)
  ob.connect(gb); gb.connect(dest); ob.start(now); ob.stop(now + 3.5)

  // ── Pad — 4 microtonal voices, staggered slow bloom ──────────────────────────
  // Wide microtonal cluster (±24 cents) creates the gentle beating / shimmer.
  // Each voice enters ~60 ms after the last so the texture unfolds gradually.
  ;[-0.024, -0.008, 0.008, 0.024].forEach((d, i) => {
    const o = AC.createOscillator(), g = AC.createGain()
    o.frequency.value = freq * (1 + d)
    const t0 = now + i * 0.062
    g.gain.setValueAtTime(0, t0)
    g.gain.linearRampToValueAtTime(vol * 0.17, t0 + 0.45)
    g.gain.setValueAtTime(vol * 0.17, t0 + 2.4)
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 5.2)
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + 5.3)
  })
  // Soft octave shimmer — very slow attack, fades before the pad
  const oh = AC.createOscillator(), gh = AC.createGain()
  oh.frequency.value = freq * 2.003
  gh.gain.setValueAtTime(0, now)
  gh.gain.linearRampToValueAtTime(vol * 0.055, now + 0.65)
  gh.gain.exponentialRampToValueAtTime(0.001, now + 3.6)
  oh.connect(gh); gh.connect(dest); oh.start(now); oh.stop(now + 3.7)

  // ── Click transient ───────────────────────────────────────────────────────────
  // Ultra-short high-frequency sine burst (≈7 ms) — simulates the mechanical
  // relay / analogue hardware click texture in Aphex's ambient recordings.
  // Frequency randomised slightly so clicks never sound identical.
  const cf = 2800 + Math.random() * 3200
  const oc = AC.createOscillator(), gc = AC.createGain()
  oc.frequency.value = cf
  gc.gain.setValueAtTime(vol * 0.52, now)
  gc.gain.exponentialRampToValueAtTime(0.001, now + 0.007)
  oc.connect(gc); gc.connect(dest); oc.start(now); oc.stop(now + 0.009)

  // Ghost click — 40% chance of a quieter, slightly delayed second click
  if (Math.random() < 0.40) {
    const dt = 0.05 + Math.random() * 0.18
    const oc2 = AC.createOscillator(), gc2 = AC.createGain()
    oc2.frequency.value = cf * (0.60 + Math.random() * 0.55)
    gc2.gain.setValueAtTime(vol * 0.22, now + dt)
    gc2.gain.exponentialRampToValueAtTime(0.001, now + dt + 0.005)
    oc2.connect(gc2); gc2.connect(dest); oc2.start(now + dt); oc2.stop(now + dt + 0.007)
  }
}

function tb303Fn(dest, now, vol, freq) {
  // Sawtooth oscillator → resonant lowpass with fast-attack filter envelope
  const osc = AC.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(freq * 1.010, now)
  osc.frequency.exponentialRampToValueAtTime(freq, now + 0.018)  // portamento glide

  const filt = AC.createBiquadFilter()
  filt.type = 'lowpass'
  filt.Q.value = 22  // high resonance — the acid squeal

  // Filter envelope: snap open, then exponential decay back down
  const cutoffHigh = Math.min(freq * 9, AC.sampleRate * 0.44)
  const cutoffRest = freq * 0.85
  filt.frequency.setValueAtTime(cutoffRest, now)
  filt.frequency.linearRampToValueAtTime(cutoffHigh, now + 0.009)
  filt.frequency.exponentialRampToValueAtTime(cutoffRest, now + 0.38)

  const g = AC.createGain()
  g.gain.setValueAtTime(vol * 0.88, now)
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.52)

  osc.connect(filt); filt.connect(g); g.connect(dest)
  osc.start(now); osc.stop(now + 0.55)

  // Sub sine one octave down for low-end body
  const sub = AC.createOscillator(), sg = AC.createGain()
  sub.frequency.value = freq / 2
  sg.gain.setValueAtTime(vol * 0.42, now)
  sg.gain.exponentialRampToValueAtTime(0.001, now + 0.38)
  sub.connect(sg); sg.connect(dest); sub.start(now); sub.stop(now + 0.40)
}

const INSTRUMENT_FNS = { aphex: aphexFn, piano: pianoFn, 'old-piano': oldPianoFn, strings: stringsFn, '303': tb303Fn }
const INSTRUMENT_CFG = {
  aphex:       { wet: 0.08, longWet: 0.80 },
  piano:       { wet: 0.24, longWet: 0    },
  'old-piano': { wet: 0.30, longWet: 0.18 },
  strings:     { wet: 0.20, longWet: 0.45 },
  '303':       { wet: 0.12, longWet: 0.30 },
}
export const INSTRUMENT_SET_IDS = Object.keys(INSTRUMENT_FNS)

// ── Public API ────────────────────────────────────────────────────────────────

export function playInstrument(setName, { pan=0, vol=0.5, freq=440, incidentDelay=false, extraReverb=false } = {}) {
  if (!AC || AC.state === 'suspended') return
  const fn  = INSTRUMENT_FNS[setName]
  const cfg = INSTRUMENT_CFG[setName]
  if (!fn) return

  const now    = AC.currentTime
  const panner = AC.createStereoPanner(); panner.pan.value = pan

  const dryG = AC.createGain(); dryG.gain.value = 1 - cfg.wet
  const wetG = AC.createGain(); wetG.gain.value = cfg.wet
  panner.connect(dryG); dryG.connect(master)
  panner.connect(wetG); wetG.connect(shortReverb)

  if (cfg.longWet > 0) {
    const lg = AC.createGain(); lg.gain.value = cfg.longWet
    panner.connect(lg); lg.connect(longReverb)
  }
  if (extraReverb) {
    const lg = AC.createGain(); lg.gain.value = 0.55
    panner.connect(lg); lg.connect(longReverb)
  }
  if (incidentDelay) {
    const opts = beatSecs(0.25, 0.375, 0.5)
    const dt   = opts[Math.floor(Math.random() * opts.length)]
    const fb   = 0.38 + Math.random() * 0.22
    const dly  = AC.createDelay(2.0); dly.delayTime.value = dt
    const fbg  = AC.createGain();     fbg.gain.value = fb
    const dlg  = AC.createGain();     dlg.gain.value = 0.30
    panner.connect(dly)
    dly.connect(fbg); fbg.connect(dly)
    dly.connect(dlg); dlg.connect(master)
    fbg.gain.setValueAtTime(fb, now); fbg.gain.linearRampToValueAtTime(0, now + 5.0)
  }

  fn(panner, now, vol, freq)
}

export function playPercussion(type, { pan=0, vol=0.52, wet=0.22, freq, delayed=false, incidentDelay=false, extraReverb=false } = {}) {
  if (!AC || AC.state==='suspended') return
  const now = AC.currentTime

  const panner = AC.createStereoPanner(); panner.pan.value = pan

  const dryG = AC.createGain(); dryG.gain.value = 1 - wet
  const wetG = AC.createGain(); wetG.gain.value = wet
  panner.connect(dryG); dryG.connect(master)
  panner.connect(wetG); wetG.connect(shortReverb)

  if (extraReverb) {
    const lg = AC.createGain(); lg.gain.value = 0.55
    panner.connect(lg); lg.connect(longReverb)
  }
  if (incidentDelay) {
    const opts = beatSecs(0.25, 0.375, 0.5)
    const dt   = opts[Math.floor(Math.random() * opts.length)]
    const fb   = 0.38 + Math.random() * 0.22
    const dly  = AC.createDelay(2.0); dly.delayTime.value = dt
    const fbg  = AC.createGain();     fbg.gain.value = fb
    const dlg  = AC.createGain();     dlg.gain.value = 0.30
    panner.connect(dly)
    dly.connect(fbg); fbg.connect(dly)
    dly.connect(dlg); dlg.connect(master)
    fbg.gain.setValueAtTime(fb, now); fbg.gain.linearRampToValueAtTime(0, now + 5.0)
  }

  if (delayed) {
    const opts = beatSecs(0.25, 0.375, 0.5, 0.75, 1.0)
    const dt   = opts[Math.floor(Math.random() * opts.length)]
    const fb   = 0.25 + Math.random() * 0.25
    const dly  = AC.createDelay(2.0); dly.delayTime.value = dt
    const fbg  = AC.createGain();     fbg.gain.value = fb
    const dlg  = AC.createGain();     dlg.gain.value = 0.28
    src.connect(dly)
    dly.connect(fbg); fbg.connect(dly)
    dly.connect(dlg); dlg.connect(master)
    fbg.gain.setValueAtTime(fb, now); fbg.gain.linearRampToValueAtTime(0, now + 5.0)
  }

  freq !== undefined
    ? ALL_SYNTHS[type]?.(panner, now, vol, freq)
    : ALL_SYNTHS[type]?.(panner, now, vol)
}

// Crossing: sine chord cluster → long cathedral reverb + randomised delay echo
// Delay time and feedback are re-randomised every call so each crossing sounds different.
export function playCrossing({ pan=0, freq=220 } = {}) {
  if (!AC || AC.state==='suspended') return
  const now=AC.currentTime, panner=AC.createStereoPanner(); panner.pan.value=pan

  // dotted-8th → dotted-half, quantised to current BPM
  const opts = beatSecs(0.375, 0.5, 0.75, 1.0, 1.5, 2.0)
  const dt   = opts[Math.floor(Math.random() * opts.length)]
  const fb  = 0.30 + Math.random() * 0.30   // 0.30–0.60 feedback

  // Per-crossing delay chain (no shared state, naturally decays)
  const dly = AC.createDelay(2.0); dly.delayTime.value = dt
  const fbg = AC.createGain();     fbg.gain.value = fb
  const dlg = AC.createGain();     dlg.gain.value = 0.30
  panner.connect(dly)
  dly.connect(fbg); fbg.connect(dly)   // feedback loop
  dly.connect(dlg); dlg.connect(master)
  // Ramp feedback to zero so the echo naturally dies within ~7 s
  fbg.gain.setValueAtTime(fb, now); fbg.gain.linearRampToValueAtTime(0, now + 7.0)

  // Cathedral reverb
  const revG = AC.createGain(); revG.gain.value = 0.88
  panner.connect(revG); revG.connect(longReverb)

  // Very quiet dry signal
  const dryG = AC.createGain(); dryG.gain.value = 0.05
  panner.connect(dryG); dryG.connect(master)

  // Pentatonic-tuned sine cluster (root, fifth, octave)
  SYNTH.pad(panner, now, 0.55, freq)
  SYNTH.bell(panner, now + 0.012, 0.32, freq * 1.5)   // perfect fifth
  PERC.ding(panner, now + 0.004, 0.40, freq * 2)       // octave ping
}

// Incident: brief inharmonic cluster → short reverb
export function playIncident({ pan = 0 } = {}) {
  if (!AC || AC.state === 'suspended') return
  const now = AC.currentTime
  const panner = AC.createStereoPanner(); panner.pan.value = pan
  const revG = AC.createGain(); revG.gain.value = 0.55; panner.connect(revG); revG.connect(shortReverb)
  const dryG = AC.createGain(); dryG.gain.value = 0.18; panner.connect(dryG); dryG.connect(master)
  // Three detuned descending sines — dissonant but still sine-only
  [[280, 0.45], [296, 0.35], [374, 0.28]].forEach(([f, v], i) => {
    const o = AC.createOscillator(), g = AC.createGain()
    o.frequency.setValueAtTime(f * 1.6, now + i * 0.018)
    o.frequency.exponentialRampToValueAtTime(f * 0.35, now + i * 0.018 + 0.45)
    g.gain.setValueAtTime(v, now + i * 0.018)
    g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.018 + 0.55)
    o.connect(g); g.connect(panner)
    o.start(now + i * 0.018); o.stop(now + i * 0.018 + 0.58)
  })
}

export function unlock() { setup(); if (AC.state==='suspended') AC.resume() }

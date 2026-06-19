import { PERC_IDS, SYNTH_IDS } from './audioEngine'

// ── Geographic stereo pan ─────────────────────────────────────────────────────
// Based on each route's average east-west corridor relative to CBD (lng 144.963).
// West suburbs → -1 (left), east suburbs → +1 (right), CBD → 0.
const ROUTE_PAN = {
  '1':  -0.05, '3':   0.15, '5':   0.35, '6':   0.2,
  '11': -0.30, '12':  0.15, '16':  0.35, '19': -0.05,
  '30':  0.0,  '35':  0.0,  '48':  0.65, '57': -0.55,
  '58': -0.15, '59': -0.55, '64':  0.25, '67':  0.45,
  '70':  0.55, '72':  0.45, '75':  0.65, '78':  0.25,
  '82': -0.65, '86':  0.40, '96':  0.05, '109': 0.55,
}

// Visual colours per route
const ROUTE_COLORS = {
  '35':  '#f5a623', '1':  '#e84040', '3':  '#e84040',
  '5':   '#ff7c43', '6':  '#ff7c43', '11': '#7bc67e',
  '12':  '#7bc67e', '16': '#42a5f5', '19': '#42a5f5', '30': '#ab47bc',
  '48':  '#26c6da', '57': '#ec407a', '58': '#ec407a', '59': '#8d6e63',
  '64':  '#66bb6a', '67': '#66bb6a', '70': '#ffa726', '72': '#ffa726',
  '75':  '#ef5350', '78': '#26a69a', '82': '#26a69a', '86': '#5c6bc0',
  '96':  '#ffca28', '109':'#78909c',
}

const ROUTE_ORDER = [
  '35','1','3','5','6',
  '11','12','16','19','30',
  '48','57','58','59',
  '64','67','70','72','75',
  '78','82','86','96','109',
]

// ── Scales ────────────────────────────────────────────────────────────────────
// Each entry is a pool of frequencies (Hz) spanning ~3 octaves.
// buildFreqMap() shuffles the pool and assigns one freq per route.
export const SCALES = {
  'min-pent': {
    label: 'min pent',
    freqs: [110.0,130.8,146.8,164.8,196.0, 220.0,261.6,293.7,329.6,392.0, 440.0,523.3,587.3,659.3,784.0,880.0],
  },
  'maj-pent': {
    label: 'maj pent',
    freqs: [130.8,146.8,164.8,196.0,220.0, 261.6,293.7,329.6,392.0,440.0, 523.3,587.3,659.3,784.0,880.0,1046.5],
  },
  'blues': {
    label: 'blues',
    freqs: [110.0,130.8,146.8,155.6,164.8,196.0, 220.0,261.6,293.7,311.1,329.6,392.0, 440.0,523.3,587.3,622.3],
  },
  'whole': {
    label: 'whole tone',
    freqs: [130.8,146.8,164.8,185.0,207.7,233.1, 261.6,293.7,329.6,370.0,415.3,466.2, 523.3,587.3,659.3],
  },
  'dorian': {
    label: 'dorian',
    freqs: [73.4,82.4,87.3,98.0,110.0,123.5,130.8, 146.8,164.8,174.6,196.0,220.0,246.9,261.6, 293.7,329.6,349.2,392.0,440.0],
  },
  'phrygian': {
    label: 'phrygian',
    freqs: [82.4,87.3,98.0,110.0,123.5,130.8,146.8, 164.8,174.6,196.0,220.0,246.9,261.6,293.7, 329.6,349.2,392.0,440.0,493.9],
  },
}

// Build a route → freq map by shuffling the chosen scale pool.
// Called once at startup and again whenever the user changes scale.
export function buildFreqMap(scaleId = 'min-pent') {
  const pool = [...(SCALES[scaleId]?.freqs ?? SCALES['min-pent'].freqs)]
  const shuffled = pool.sort(() => Math.random() - 0.5)
  return Object.fromEntries(
    ROUTE_ORDER.map((route, i) => [route, shuffled[i % shuffled.length]])
  )
}

// ── 80 / 20 synth-to-percussion assignment ────────────────────────────────────
// 26 routes → 5 perc (≈20%) + 21 synth (≈80%).
// Pick types randomly each session; spread across full type pool.
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Assigns perc/synth type to each route (random per session).
// Freq is handled separately via buildFreqMap so it can change live.
function assignTones(routes) {
  const N     = routes.length
  const nPerc = Math.round(N * 0.20)   // 5 perc, 21 synth

  const positions = new Set()
  while (positions.size < nPerc) positions.add(Math.floor(Math.random() * N))

  const percPool  = shuffle(PERC_IDS)
  const synthPool = shuffle(SYNTH_IDS)
  let pi = 0, si = 0
  return Object.fromEntries(
    routes.map((route, idx) => {
      if (positions.has(idx)) {
        return [route, { type: percPool[pi++ % percPool.length],  isPerc: true  }]
      } else {
        return [route, { type: synthPool[si++ % synthPool.length], isPerc: false }]
      }
    })
  )
}

const ROUTE_ASSIGNMENT = assignTones(ROUTE_ORDER)

// ── Human-readable labels for the panel ──────────────────────────────────────
const TYPE_LABELS = {
  // Short sine strikes
  ding:  'DING',  tok:    'TOK',    ping:   'PING',  pop:   'POP',
  blip:  'BLIP',  tap:    'TAP',    drip:   'DRIP',  tick:  'TICK',
  drop:  'DROP',  chime:  'CHIME',
  // Sustained sine tones
  bell:    'BELL',  tone:    'TONE',   shimmer: 'SHMR',  pad:  'PAD',
  sub:     'SUB',   drone:   'DRONE',  warm:    'WARM',  bright:'BRGT',
  crystal: 'CRST',  swell:   'SWLL',   fifth:   'FFTH',  octave:'OCT',
  trem:    'TREM',  wisp:    'WISP',
}

// ── Exports ───────────────────────────────────────────────────────────────────

export const ROUTE_TONES = Object.fromEntries(
  ROUTE_ORDER.map(route => {
    const a = ROUTE_ASSIGNMENT[route]
    return [
      route,
      {
        percType:  a.type,
        percLabel: TYPE_LABELS[a.type] ?? a.type.toUpperCase(),
        pan:       ROUTE_PAN[route]    ?? 0,
        color:     ROUTE_COLORS[route] ?? '#aaaaaa',
        isPerc:    a.isPerc,
      },
    ]
  })
)

export function toneForRoute(routeNumber) {
  return ROUTE_TONES[String(routeNumber)] ?? {
    percType: 'click', percLabel: 'CLICK', pan: 0, color: '#aaaaaa', isPerc: true,
  }
}

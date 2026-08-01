import { useState, useCallback, useMemo, useRef } from 'react'
import TramMap from './components/TramMap'
import TonePanel from './components/TonePanel'
import { useRoutes } from './hooks/useRoutes'
import { useDepartures } from './hooks/useDepartures'
import { useToneEngine } from './hooks/useToneEngine'
import { unlock, setBpm, playIncident } from './lib/audioEngine'
import { buildFreqMap } from './lib/routeTones'
import { MOCK_ROUTES } from './mock/mockData'
import { getTramPositions, setSimulatorBpm } from './mock/simulator'
import { ROUTE_LINES } from './mock/routeLines'

const IS_MOCK = import.meta.env.VITE_USE_MOCK === 'true'
const LIVE_DOT_TTL   = 90_000   // ms a dot lives after appearing
const LIVE_DOT_SPEED = 0.00014  // route-line points per ms (~12 km/h in CBD)

// Snap [lng, lat] to nearest point on a route line; returns position + index
function snapToRoute(routeNumber, lng, lat) {
  const line = ROUTE_LINES[String(routeNumber)]
  if (!line) return { lng, lat, index: 0 }
  let best = line[0], bestIdx = 0, bestD = Infinity
  for (let i = 0; i < line.length; i++) {
    const [lx, ly] = line[i]
    const d = (lx - lng) ** 2 + (ly - lat) ** 2
    if (d < bestD) { bestD = d; best = line[i]; bestIdx = i }
  }
  return { lng: best[0], lat: best[1], index: bestIdx }
}

export default function App() {
  const { geojson, loading, error } = useRoutes()

  // ── Start screen ─────────────────────────────────────────────────────────
  const [started, setStarted] = useState(false)

  // ── Playback ──────────────────────────────────────────────────────────────
  const [paused, setPaused] = useState(false)
  const handlePlayPause = useCallback(() => setPaused(p => !p), [])

  // ── Octave ────────────────────────────────────────────────────────────────
  const [octave, setOctave] = useState(0)
  const handleOctaveChange = useCallback((o) => setOctave(Math.max(-2, Math.min(2, o))), [])

  // ── BPM + Scale ──────────────────────────────────────────────────────────
  const [bpm,     setBpmState] = useState(120)
  const [scaleId, setScaleId]  = useState('min-pent')
  const [freqMap, setFreqMap]  = useState(() => buildFreqMap('min-pent'))

  const handleBpmChange        = useCallback((b)  => { setBpmState(b); setBpm(b); setSimulatorBpm(b) }, [])
  const handleScaleChange      = useCallback((id) => { setScaleId(id); setFreqMap(buildFreqMap(id)) }, [])

  // ── Instrument set ────────────────────────────────────────────────────────
  const [instrumentSet, setInstrumentSet] = useState('aphex')
  const handleInstrumentSetChange = useCallback((s) => setInstrumentSet(s || 'aphex'), [])

  // ── Track mute ────────────────────────────────────────────────────────────
  const [muted, setMuted] = useState(new Set())
  const handleToggleMute  = useCallback((route) => {
    setMuted(prev => { const n = new Set(prev); n.has(route) ? n.delete(route) : n.add(route); return n })
  }, [])

  // ── Disruptions ───────────────────────────────────────────────────────────
  const [congested, setCongested] = useState(new Set())
  const [incidents, setAccidents] = useState(new Map())   // Map<routeNumber, {lng, lat}>

  const handleDisrupt = useCallback(({ routeNumber, kind, active, lng, lat }) => {
    if (kind === 'incident') {
      setAccidents(prev => {
        const n = new Map(prev)
        if (active) n.set(routeNumber, { lng, lat })
        else        n.delete(routeNumber)
        return n
      })
      if (active) playIncident()
    } else {
      setCongested(prev => { const n = new Set(prev); active ? n.add(routeNumber) : n.delete(routeNumber); return n })
    }
  }, [])

  // ── Stop GeoJSON (mock only) ──────────────────────────────────────────────
  const stopsGeojson = useMemo(() => ({
    type: 'FeatureCollection',
    features: MOCK_ROUTES.flatMap(r => r.stops.map(s => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: { routeNumber: r.routeNumber, stopId: s.stopId },
    }))),
  }), [])

  // ── Tone engine ───────────────────────────────────────────────────────────
  const { trigger, triggerCrossing, active, crossings } = useToneEngine(freqMap, octave, muted, congested, incidents, instrumentSet)

  // ── Live dot tracking (non-mock only) ────────────────────────────────────
  // key → { routeNumber, lineKey, startIndex, direction, startTime, expiresAt }
  const liveDotsRef = useRef(new Map())
  const getLiveDots = useCallback(() => {
    const now = Date.now()
    const result = []
    for (const [key, dot] of liveDotsRef.current) {
      if (now > dot.expiresAt) { liveDotsRef.current.delete(key); continue }
      const line = ROUTE_LINES[dot.lineKey]
      if (!line) continue
      const elapsed = now - dot.startTime
      const rawIdx  = dot.startIndex + dot.direction * elapsed * LIVE_DOT_SPEED
      const idx     = Math.max(0, Math.min(line.length - 1, Math.round(rawIdx)))
      const [lng, lat] = line[idx]
      result.push({ id: key, routeNumber: String(dot.routeNumber), lng, lat })
    }
    return result
  }, [])

  const handleArrival = useCallback((e) => {
    trigger(e)
    if (!IS_MOCK && e.lng != null) {
      const key     = `${e.routeNumber}-${e.stopId}`
      const lineKey = String(e.routeNumber)
      const snapped = snapToRoute(e.routeNumber, e.lng, e.lat)
      liveDotsRef.current.set(key, {
        routeNumber: e.routeNumber,
        lineKey,
        startIndex:  snapped.index,
        direction:   e.directionId === 1 ? -1 : 1,
        startTime:   Date.now(),
        expiresAt:   Date.now() + LIVE_DOT_TTL,
      })
    }
  }, [trigger])
  const handleCrossing = useCallback((e) => triggerCrossing(e), [triggerCrossing])

  useDepartures(handleArrival, handleCrossing, paused, handleDisrupt)

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }} onClick={unlock}>
      <TramMap
        geojson={geojson}
        activeRoutes={active}
        crossings={crossings}
        congested={congested}
        incidents={incidents}
        stopsGeojson={IS_MOCK ? stopsGeojson : null}
        getPositions={IS_MOCK ? getTramPositions : getLiveDots}
      />
      <TonePanel
        active={active}     crossings={crossings}
        bpm={bpm}           onBpmChange={handleBpmChange}
        scaleId={scaleId}   onScaleChange={handleScaleChange}
        instrumentSet={instrumentSet} onInstrumentSetChange={handleInstrumentSetChange}
        paused={paused}     onPlayPause={handlePlayPause}
        octave={octave}     onOctaveChange={handleOctaveChange}
        muted={muted}       onToggleMute={handleToggleMute}
        congested={congested}
        incidents={incidents}
      />

      {!started && (
        <button style={startBtnStyle} onClick={() => { unlock(); setStarted(true) }}>
          {IS_MOCK || !loading ? 'click to start' : 'loading tram network…'}
        </button>
      )}
      {!IS_MOCK && loading && started && <div style={overlayStyle}>loading tram network…</div>}
      {!IS_MOCK && error && (
        <div style={{ ...overlayStyle, color: '#ff6b6b' }}>
          API error: {error} <br /><small>Check your .env keys.</small>
        </div>
      )}
    </div>
  )
}

const startBtnStyle = {
  position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
  background: '#fff', color: '#000', border: 'none',
  fontFamily: '"JetBrains Mono","Fira Mono",monospace',
  fontSize: 16, letterSpacing: 4,
  padding: '14px 32px', borderRadius: 4,
  cursor: 'pointer', zIndex: 20,
}

const overlayStyle = {
  position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
  background: 'rgba(0,0,0,0.75)', color: '#aaa', padding: '8px 16px',
  borderRadius: 6, fontFamily: 'monospace', fontSize: 12, pointerEvents: 'none',
}

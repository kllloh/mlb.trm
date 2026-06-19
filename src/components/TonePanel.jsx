import { useState } from 'react'
import { ROUTE_TONES, SCALES } from '../lib/routeTones'

const BPM_OPTIONS = [60, 75, 90, 105, 120, 135, 150, 174]

const INFO_LINES = [
  'mlb.trm is a generative score driven by Melbourne\'s tram network. Two trams on the same route passing each other triggers a tone. Congestion adds reverb. Incidents echo with delay. Click any route number to mute it.',
  'Map: MapLibre GL JS · CARTO Dark Matter',
  'Route data: PTV GTFS (Google Transit Feed)',
  'Tram positions: simulated from real headways',
  'v2 will use live data from the PTV API',
]

export default function TonePanel({
  active, crossings,
  bpm, onBpmChange,
  scaleId, onScaleChange,
  instrumentSet, onInstrumentSetChange,
  paused, onPlayPause,
  octave, onOctaveChange,
  muted, onToggleMute,
  congested, incidents,
}) {
  const [showInfo, setShowInfo] = useState(false)

  const crossCount    = crossings.size
  const congestCount  = congested.size
  const incidentCount = incidents.size

  return (
    <div style={s.panel}>

      {/* ── Title row ──────────────────────────────────────────────────── */}
      <div style={s.titleRow}>
        <div style={s.title}>mlb.trm</div>
        <button
          onClick={() => setShowInfo(v => !v)}
          style={{ ...s.btn, ...s.infoBtn, color: showInfo ? '#fff' : '#555' }}
          title="about"
        >i</button>
      </div>

      {showInfo && (
        <div style={s.infoText}>
          {INFO_LINES.map((line, i) => (
            <div key={i} style={i > 0 ? { marginTop: 8, color: '#555' } : {}}>{line}</div>
          ))}
        </div>
      )}

      {/* ── Transport + controls ─────────────────────────────────────── */}
      <div style={s.controls}>
        <button onClick={onPlayPause} style={{ ...s.btn, ...s.transportBtn, color: paused ? '#7bc67e' : '#aaa' }}>
          {paused ? '▶  play' : '■  pause'}
        </button>

        <div style={s.controlRow}>
          <span style={s.ctrlLabel}>OCT</span>
          <button onClick={() => onOctaveChange(octave - 1)} disabled={octave <= -2} style={{ ...s.btn, ...s.octBtn }}>−</button>
          <span style={s.octVal}>{octave > 0 ? `+${octave}` : octave}</span>
          <button onClick={() => onOctaveChange(octave + 1)} disabled={octave >= 2} style={{ ...s.btn, ...s.octBtn }}>+</button>
        </div>

        <div style={s.controlRow}>
          <span style={s.ctrlLabel}>BPM</span>
          <select value={bpm} onChange={e => onBpmChange(Number(e.target.value))} style={s.select}>
            {BPM_OPTIONS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <div style={s.controlRow}>
          <span style={s.ctrlLabel}>SCALE</span>
          <select value={scaleId} onChange={e => onScaleChange(e.target.value)} style={s.select}>
            {Object.entries(SCALES).map(([id, { label }]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
        </div>

        <div style={s.controlRow}>
          <span style={s.ctrlLabel}>INST</span>
          <select value={instrumentSet ?? ''} onChange={e => onInstrumentSetChange(e.target.value)} style={s.select}>
            <option value='aphex'>default</option>
            <option value='piano'>piano</option>
            <option value='old-piano'>old piano</option>
            <option value='strings'>strings</option>
            <option value='303'>303</option>
          </select>
        </div>
      </div>

      {/* ── Route grid — click to mute / unmute ──────────────────────── */}
      <div style={s.grid}>
        {Object.entries(ROUTE_TONES).map(([route, { color }]) => {
          const isMuted     = muted.has(route)
          const isActive    = !isMuted && active.has(route)
          const isCrossing  = !isMuted && crossings.has(route)
          const isIncident  = incidents.has(route)
          const isCongested = congested.has(route)

          // Border / colour priority: incident > crossing > active > congestion > normal
          const borderColor = isIncident  ? '#cc2200'
                            : isCrossing  ? 'rgba(255,255,255,0.65)'
                            : isActive    ? color
                            : isCongested ? '#996600'
                            : '#1e1e1e'

          const bgColor     = isIncident  ? 'rgba(204,34,0,0.12)'
                            : isCrossing  ? 'rgba(255,255,255,0.09)'
                            : isActive    ? `${color}1a`
                            : isCongested ? 'rgba(180,120,0,0.08)'
                            : 'transparent'

          const textColor   = isIncident  ? '#cc4422'
                            : isCrossing  ? '#fff'
                            : isActive    ? color
                            : isCongested ? '#885500'
                            : '#3a3a3a'

          const shadow      = isIncident  ? '0 0 6px rgba(204,34,0,0.6)'
                            : isCrossing  ? '0 0 8px rgba(255,255,255,0.45), inset 0 0 6px rgba(255,255,255,0.08)'
                            : isActive    ? `0 0 6px ${color}99`
                            : 'none'

          return (
            <button
              key={route}
              onClick={() => onToggleMute(route)}
              style={{
                ...s.trackBtn,
                opacity: isMuted ? 0.15 : 1,
                background: bgColor,
                borderColor,
                color: textColor,
                boxShadow: shadow,
              }}
            >
              {route}
            </button>
          )
        })}
      </div>

      <div style={s.hint}>
        {incidentCount > 0  && <span style={{ color: '#cc2200' }}>{incidentCount} incident{incidentCount > 1 ? 's' : ''} · </span>}
        {congestCount > 0   && <span style={{ color: '#885500' }}>{congestCount} congested · </span>}
        {crossCount > 0     && `${crossCount} crossing · `}
        {paused
          ? 'paused'
          : active.size > 0 ? `${active.size} active` : (incidentCount + congestCount + crossCount) === 0 ? 'click to unlock audio' : ''
        }
      </div>

      {crossCount > 0 && (
        <div style={s.crossStrip}>
          <span style={s.crossLabel}>× CROSS</span>
          {Array.from(crossings.values()).map(r => (
            <span key={r.routeNumber} style={{ ...s.crossPill, borderColor: r.color, color: r.color }}>
              {r.routeNumber}
            </span>
          ))}
        </div>
      )}

      <div style={s.copyright}>© {new Date().getFullYear()} Nathan Killoh</div>
    </div>
  )
}

const s = {
  panel: {
    position: 'absolute', top: 24, right: 24, width: 252,
    background: 'rgba(8,8,8,0.92)', backdropFilter: 'blur(10px)',
    borderRadius: 9, padding: '18px 21px', color: '#fff',
    fontFamily: '"JetBrains Mono", "Fira Mono", monospace', fontSize: 17,
    zIndex: 10, userSelect: 'none',
  },

  titleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  title:    { fontWeight: 700, fontSize: 20, letterSpacing: 5, color: '#fff' },
  infoBtn:  { padding: '2px 7px', fontSize: 13, borderRadius: 10, lineHeight: 1.4, flexShrink: 0 },

  infoText: {
    fontSize: 12, color: '#777', lineHeight: 1.6,
    marginBottom: 12, paddingBottom: 12,
    borderBottom: '1px solid #1e1e1e',
  },

  controls: {
    display: 'flex', flexDirection: 'column', gap: 6,
    marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #1e1e1e',
  },
  controlRow: { display: 'flex', alignItems: 'center', gap: 8 },
  ctrlLabel:  { color: '#444', fontSize: 14, letterSpacing: 2, width: 51, flexShrink: 0 },

  btn: {
    background: '#111', color: '#777',
    border: '1px solid #2a2a2a', borderRadius: 4,
    fontFamily: '"JetBrains Mono","Fira Mono",monospace',
    fontSize: 15, padding: '3px 8px',
    cursor: 'pointer', outline: 'none', lineHeight: 1,
  },
  transportBtn: { width: '100%', letterSpacing: 2, padding: '6px 8px', textAlign: 'left' },
  octBtn:       { padding: '3px 11px', flexShrink: 0 },
  octVal:       { flex: 1, textAlign: 'center', color: '#888', fontSize: 15 },

  select: {
    flex: 1,
    background: '#111', color: '#aaa',
    border: '1px solid #2a2a2a', borderRadius: 4,
    fontFamily: '"JetBrains Mono","Fira Mono",monospace',
    fontSize: 15, padding: '3px 6px',
    cursor: 'pointer', outline: 'none',
  },

  crossStrip: {
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    marginTop: 12, paddingTop: 12, borderTop: '1px solid #2a2a2a',
  },
  crossLabel: { color: '#555', fontSize: 14, letterSpacing: 2 },
  crossPill:  { border: '1px solid', borderRadius: 4, padding: '2px 6px', fontSize: 14 },

  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 5,
    marginBottom: 12,
  },
  trackBtn: {
    border: '1px solid',
    borderRadius: 5,
    fontFamily: '"JetBrains Mono","Fira Mono",monospace',
    fontSize: 15, fontWeight: 600,
    padding: '9px 3px',
    cursor: 'pointer', outline: 'none',
    letterSpacing: 1,
    transition: 'opacity 0.15s, box-shadow 0.15s, border-color 0.15s, color 0.15s, background 0.15s',
    textAlign: 'center',
  },

  hint:      { color: '#333', fontSize: 14, borderTop: '1px solid #1a1a1a', paddingTop: 12, letterSpacing: 2 },
  copyright: { color: '#252525', fontSize: 11, textAlign: 'right', marginTop: 14, letterSpacing: 1 },
}

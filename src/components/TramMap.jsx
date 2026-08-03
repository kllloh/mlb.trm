import { useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'

const DARK_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json'
const MELBOURNE  = { lng: 144.9631, lat: -37.8136 }

const DOT_TICK_MS  = 0     // update every frame for smooth movement
const HALO_MS      = 3200  // crossing halo fade duration

const CBD_GEOJSON = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: [144.9655, -37.8183] }, properties: {} }],
}
const EMPTY_FC = { type: 'FeatureCollection', features: [] }

export default function TramMap({ geojson, activeRoutes, crossings, congested, incidents, stopsGeojson, getPositions }) {
  const containerRef     = useRef(null)
  const mapRef           = useRef(null)
  const rafRef           = useRef(null)
  const colorMapRef      = useRef({})   // routeNumber → hex color
  const getPositionsRef  = useRef(getPositions)
  const pulsingRef       = useRef(new Map())   // routeNumber → startMs (dot pop)
  const haloRef          = useRef(new Map())   // routeNumber → startMs (slow ring)
  const prevCrossingsRef = useRef(new Set())

  useEffect(() => { getPositionsRef.current = getPositions }, [getPositions])

  // Detect newly crossing routes — stamp dot pulse + halo
  useEffect(() => {
    const now = Date.now()
    crossings.forEach((_, key) => {
      if (!prevCrossingsRef.current.has(key)) {
        pulsingRef.current.set(key, now)
        haloRef.current.set(key, now)
      }
    })
    prevCrossingsRef.current = new Set(crossings.keys())
  }, [crossings])

  // Build color lookup whenever geojson arrives
  useEffect(() => {
    if (!geojson) return
    const m = {}
    geojson.features.forEach(f => { m[f.properties.routeNumber] = f.properties.color })
    colorMapRef.current = m
  }, [geojson])

  // ── Map init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: DARK_STYLE,
      center: [MELBOURNE.lng, MELBOURNE.lat],
      zoom: 13,
      pitch: 45,
      bearing: -15,
    })
    mapRef.current = map
    return () => { cancelAnimationFrame(rafRef.current); map.remove() }
  }, [])

  // ── Add sources + layers once geojson is ready ─────────────────────────────
  useEffect(() => {
    if (!geojson) return
    const map = mapRef.current
    if (!map) return

    const add = () => {
      // Already added (e.g. geojson prop updated) — just refresh data
      if (map.getSource('tram-routes')) {
        map.getSource('tram-routes').setData(geojson)
        return
      }

      // ── 0. Register square stop icon ────────────────────────────────────────
      if (!map.hasImage('stop-square')) {
        const sz  = 8
        const px  = new Uint8Array(sz * sz * 4)
        for (let i = 0; i < sz * sz; i++) {
          px[i * 4 + 0] = 180
          px[i * 4 + 1] = 180
          px[i * 4 + 2] = 180
          px[i * 4 + 3] = 255
        }
        map.addImage('stop-square', { width: sz, height: sz, data: px })
      }

      // ── 1. Tram stops (dim squares below route lines) ───────────────────────
      map.addSource('tram-stops', { type: 'geojson', data: stopsGeojson ?? EMPTY_FC })
      map.addLayer({
        id: 'tram-stops-layer', type: 'symbol', source: 'tram-stops',
        layout: {
          'icon-image': 'stop-square',
          'icon-size': 1,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
        paint: { 'icon-opacity': 0.45 },
      })

      // ── 2. Route lines ──────────────────────────────────────────────────────
      map.addSource('tram-routes', { type: 'geojson', data: geojson })
      map.addLayer({
        id: 'tram-base', type: 'line', source: 'tram-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.35 },
      })

      // ── 3. Congestion red glow (filtered to congested routes) ───────────────
      map.addLayer({
        id: 'tram-congestion', type: 'line', source: 'tram-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#cc2200',
          'line-width': 10,
          'line-opacity': 0.35,
          'line-blur': 10,
        },
        filter: ['in', ['get', 'routeNumber'], ['literal', []]],  // empty until congestion
      })

      // ── 4. Solid route line ─────────────────────────────────────────────────
      map.addLayer({
        id: 'tram-pulse', type: 'line', source: 'tram-routes',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.9 },
      })

      // ── 5. Route number labels ──────────────────────────────────────────────
      map.addLayer({
        id: 'tram-label', type: 'symbol', source: 'tram-routes',
        layout: {
          'symbol-placement': 'line-center',
          'text-field': ['get', 'routeNumber'],
          'text-font': ['Noto Sans Bold'],
          'text-size': 10, 'text-allow-overlap': false,
        },
        paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1.5 },
      })

      // ── 6. CBD indicator ───────────────────────────────────────────────────
      map.addSource('cbd-point', { type: 'geojson', data: CBD_GEOJSON })
      map.addLayer({
        id: 'cbd-halo', type: 'circle', source: 'cbd-point',
        paint: { 'circle-radius': 10, 'circle-color': '#ffffff', 'circle-opacity': 0, 'circle-blur': 1 },
      })
      map.addLayer({
        id: 'cbd-dot', type: 'circle', source: 'cbd-point',
        paint: { 'circle-radius': 4, 'circle-color': '#ffffff', 'circle-opacity': 0.5 },
      })

      // ── 7. Crossing halos (large soft rings, rendered below tram dots) ──────
      map.addSource('tram-halos', { type: 'geojson', data: EMPTY_FC })
      map.addLayer({
        id: 'tram-halos-layer', type: 'circle', source: 'tram-halos',
        paint: {
          'circle-radius':  ['coalesce', ['get', 'haloRadius'],  0],
          'circle-color':   ['coalesce', ['get', 'haloColor'],   '#ffffff'],
          'circle-opacity': ['coalesce', ['get', 'haloOpacity'], 0],
          'circle-blur':    1,           // soft fuzzy edge
          'circle-stroke-width': 0,
        },
      })

      // ── 8. Live tram dots ───────────────────────────────────────────────────
      map.addSource('tram-dots', { type: 'geojson', data: EMPTY_FC })
      map.addLayer({
        id: 'tram-dots-layer', type: 'circle', source: 'tram-dots',
        paint: {
          'circle-radius': ['coalesce', ['get', 'dotRadius'], 4],
          'circle-color': ['coalesce', ['get', 'dotColor'], '#ffffff'],
          'circle-stroke-width': 1.5,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-opacity': 0.7,
          'circle-opacity': 0.95,
        },
      })

      // ── 9. Incident markers — red fuzzy dot (topmost) ──────────────────────
      map.addSource('incident-markers', { type: 'geojson', data: EMPTY_FC })
      map.addLayer({
        id: 'incident-markers-layer', type: 'circle', source: 'incident-markers',
        paint: {
          'circle-radius': 14,
          'circle-color': '#ff2200',
          'circle-opacity': 0.85,
          'circle-blur': 0.7,
          'circle-stroke-width': 0,
        },
      })

      // ── Animation loop ──────────────────────────────────────────────────────
      let lastBreath = -1, lastBreathWidth = -1, lastDotMs = 0

      function animate(ts) {
        rafRef.current = requestAnimationFrame(animate)
        const nowMs = Date.now()

        // Breathing base line
        const breath      = Math.round((0.20 + 0.18 * Math.sin(ts * 0.0008)) * 100) / 100
        const breathWidth = Math.round((0.60 + 0.40 * Math.sin(ts * 0.0008)) * 100) / 100
        if (breath !== lastBreath) {
          map.setPaintProperty('tram-base', 'line-opacity', breath)
          lastBreath = breath
        }
        if (breathWidth !== lastBreathWidth) {
          map.setPaintProperty('tram-base', 'line-width', breathWidth)
          lastBreathWidth = breathWidth
        }

        // Live tram dot + halo positions
        if (getPositionsRef.current && ts - lastDotMs > DOT_TICK_MS) {
          lastDotMs = ts
          const positions = getPositionsRef.current()
          const colorMap  = colorMapRef.current
          const pulsing   = pulsingRef.current
          const halos     = haloRef.current
          const PULSE_MS  = 800
          const BASE_R    = 4
          const PEAK_R    = 11

          // Expire finished pulses + halos
          for (const [key, startMs] of pulsing) {
            if (nowMs - startMs > PULSE_MS) pulsing.delete(key)
          }
          for (const [key, startMs] of halos) {
            if (nowMs - startMs > HALO_MS) halos.delete(key)
          }

          const dotFeatures  = []
          const haloFeatures = []

          for (const p of positions) {
            const rn      = String(p.routeNumber)
            const color   = p.isIncident  ? '#ff3300'
                          : p.isCongested ? '#cc6600'
                          : (colorMap[rn] ?? '#ffffff')

            // Dot pop pulse
            const pulseStart = pulsing.get(rn)
            const pt = pulseStart != null ? Math.min(1, (nowMs - pulseStart) / PULSE_MS) : 1
            const dotRadius  = Math.round((BASE_R + (PEAK_R - BASE_R) * Math.pow(1 - pt, 1.8)) * 10) / 10

            dotFeatures.push({
              type: 'Feature',
              geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
              properties: { routeNumber: rn, dotRadius, dotColor: color },
            })

            // Crossing halo — large soft ring that slowly fades out
            const haloStart = halos.get(rn)
            if (haloStart != null) {
              const ht          = Math.min(1, (nowMs - haloStart) / HALO_MS)
              const haloRadius  = Math.round((18 + 30 * ht) * 10) / 10   // 18 → 48 px
              const haloOpacity = Math.round(0.45 * Math.pow(1 - ht, 0.6) * 100) / 100
              haloFeatures.push({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
                properties: { routeNumber: rn, haloRadius, haloOpacity, haloColor: color },
              })
            }
          }

          if (map.getSource('tram-dots'))  map.getSource('tram-dots').setData({ type: 'FeatureCollection', features: dotFeatures })
          if (map.getSource('tram-halos')) map.getSource('tram-halos').setData({ type: 'FeatureCollection', features: haloFeatures })
        }
      }
      rafRef.current = requestAnimationFrame(animate)
    }

    if (map.isStyleLoaded()) add(); else map.once('load', add)
  }, [geojson]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Active routes highlight ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('tram-pulse')) return
    const activeNumbers = Array.from(activeRoutes.keys())
    if (activeNumbers.length === 0) {
      map.setPaintProperty('tram-pulse', 'line-opacity', 0.9)
      return
    }
    map.setPaintProperty('tram-pulse', 'line-opacity', [
      'case', ['in', ['get', 'routeNumber'], ['literal', activeNumbers]], 1, 0.5,
    ])
    map.setPaintProperty('tram-pulse', 'line-width', [
      'case', ['in', ['get', 'routeNumber'], ['literal', activeNumbers]], 2, 1,
    ])
  }, [activeRoutes])

  // ── CBD crossing glow ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('cbd-dot')) return
    const crossing = crossings.size > 0
    map.setPaintProperty('cbd-dot',  'circle-opacity', crossing ? 1   : 0.5)
    map.setPaintProperty('cbd-dot',  'circle-radius',  crossing ? 8   : 4)
    map.setPaintProperty('cbd-halo', 'circle-opacity', crossing ? 0.5 : 0)
    map.setPaintProperty('cbd-halo', 'circle-radius',  crossing ? 22  : 10)
  }, [crossings])

  // ── Congestion red glow filter ──────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('tram-congestion')) return
    const keys = Array.from((congested ?? new Set()))
    map.setFilter('tram-congestion', ['in', ['get', 'routeNumber'], ['literal', keys]])
  }, [congested])

  // ── Incident × markers ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('incident-markers')) return
    const features = Array.from((incidents ?? new Map()).entries())
      .filter(([, pos]) => pos?.lng != null && pos?.lat != null)
      .map(([routeNumber, { lng, lat }]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [lng, lat] },
        properties: { routeNumber },
      }))
    map.getSource('incident-markers').setData({ type: 'FeatureCollection', features })
  }, [incidents])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}

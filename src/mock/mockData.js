import { toneForRoute } from '../lib/routeTones'
import { ROUTE_LINES } from './routeLines.js'

// Real off-peak headways (minutes between trams) and in-service tram counts.
// Counts derived from cycle-time / headway using ~16 km/h average speed,
// then scaled so the busiest route (86) anchors at 22 for musical density.
const ROUTE_DATA = {
  '1':   { headwayMin: 12, tramCount:  8 },
  '3':   { headwayMin: 10, tramCount: 12 },
  '5':   { headwayMin: 12, tramCount:  8 },
  '6':   { headwayMin: 10, tramCount: 14 },
  '11':  { headwayMin: 10, tramCount:  9 },
  '12':  { headwayMin: 12, tramCount:  6 },
  '16':  { headwayMin: 12, tramCount: 13 },
  '19':  { headwayMin: 12, tramCount:  6 },
  '30':  { headwayMin: 10, tramCount:  3 },
  '35':  { headwayMin: 30, tramCount:  2 },
  '48':  { headwayMin: 12, tramCount:  8 },
  '57':  { headwayMin: 12, tramCount:  7 },
  '58':  { headwayMin: 12, tramCount: 11 },
  '59':  { headwayMin: 15, tramCount:  6 },
  '64':  { headwayMin: 10, tramCount: 12 },
  '67':  { headwayMin:  8, tramCount: 15 },
  '70':  { headwayMin: 10, tramCount: 12 },
  '72':  { headwayMin: 12, tramCount: 11 },
  '75':  { headwayMin: 15, tramCount: 11 },
  '78':  { headwayMin: 12, tramCount:  5 },
  '82':  { headwayMin: 20, tramCount:  3 },
  '86':  { headwayMin:  8, tramCount: 22 },
  '96':  { headwayMin: 10, tramCount: 11 },
  '109': { headwayMin: 10, tramCount: 14 },
}


// ── Stop interpolation ────────────────────────────────────────────────────────
// Adds evenly-spaced intermediate stops between each waypoint pair.
function makeStops(routeNumber, coords, stepsPerSegment = 4) {
  const stops = []
  let seq = 0
  for (let i = 0; i < coords.length - 1; i++) {
    const [lng0, lat0] = coords[i]
    const [lng1, lat1] = coords[i + 1]
    stops.push({ stopId: `mock-${routeNumber}-${seq}`, stopName: `Stop ${seq + 1}`, lng: lng0, lat: lat0, sequence: seq })
    seq++
    for (let s = 1; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment
      stops.push({
        stopId:   `mock-${routeNumber}-${seq}`,
        stopName: `Stop ${seq + 1}`,
        lng:      lng0 + (lng1 - lng0) * t,
        lat:      lat0 + (lat1 - lat0) * t,
        sequence: seq,
      })
      seq++
    }
  }
  const last = coords[coords.length - 1]
  stops.push({ stopId: `mock-${routeNumber}-${seq}`, stopName: `Stop ${seq + 1}`, lng: last[0], lat: last[1], sequence: seq })
  return stops
}

export const MOCK_ROUTES = Object.entries(ROUTE_LINES).map(([routeNumber, coords]) => {
  const tone = toneForRoute(routeNumber)
  const data = ROUTE_DATA[routeNumber] ?? { headwayMin: 12, tramCount: 6 }
  return {
    routeNumber,
    color:      tone.color,
    note:       tone.note,
    headwayMin: data.headwayMin,
    tramCount:  data.tramCount,
    stops:      makeStops(routeNumber, coords),
    coords,
  }
})

export const MOCK_GEOJSON = {
  type: 'FeatureCollection',
  features: MOCK_ROUTES.map(r => ({
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: r.coords },
    properties: { routeNumber: r.routeNumber, color: r.color, note: r.note },
  })),
}

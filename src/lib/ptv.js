const BASE = 'https://timetableapi.ptv.vic.gov.au'
const DEV_ID = import.meta.env.VITE_PTV_DEV_ID
const API_KEY = import.meta.env.VITE_PTV_API_KEY

// PTV requires HMAC-SHA1 signing: signature covers /path?query&devid=X
async function buildUrl(path) {
  const withDev = `${path}${path.includes('?') ? '&' : '?'}devid=${DEV_ID}`
  const keyBytes = new TextEncoder().encode(API_KEY)
  const msgBytes = new TextEncoder().encode(withDev)
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  )
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, msgBytes)
  const sig = Array.from(new Uint8Array(sigBuf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `${BASE}${withDev}&signature=${sig}`
}

export async function ptvGet(path) {
  const url = await buildUrl(path)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`PTV ${path} → ${res.status}`)
  return res.json()
}

// All tram routes (route_type 1)
export async function fetchTramRoutes() {
  const data = await ptvGet('/v3/routes?route_types=1')
  return data.routes
}

// Stops for a given route, ordered by sequence
export async function fetchStopsForRoute(routeId) {
  const data = await ptvGet(`/v3/stops/route/${routeId}/route_type/1?direction_id=0`)
  return data.stops.sort((a, b) => a.stop_sequence - b.stop_sequence)
}

// Upcoming departures from a stop (next 60 minutes)
export async function fetchDepartures(stopId) {
  const data = await ptvGet(
    `/v3/departures/route_type/1/stop/${stopId}?max_results=20&expand=run&expand=route`
  )
  return data.departures
}

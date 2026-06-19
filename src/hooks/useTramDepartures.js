import { useState, useEffect, useRef, useCallback } from 'react'
import { fetchDepartures } from '../lib/ptv'

// CBD tram stops covering the main corridors. Each entry is a stop_id
// from the PTV API. You can add more stops to widen coverage.
const MONITORED_STOPS = [
  2171,  // Flinders St / Swanston St (route 1,3,3a,5,6,8,16,64,67,72)
  2961,  // Spencer St / Collins St (routes 11,12,48,109)
  2177,  // Elizabeth St / Bourke St (routes 19,57,59,86)
  3000,  // La Trobe St / Swanston St (routes 1,3,3a,5,6,8)
  2183,  // Bourke St Mall / Swanston St
]

const POLL_MS = 30_000

// Fires onArrival({ routeNumber, stopId, scheduledDeparture }) when a
// departure time crosses from future to past between two polls.
export function useTramDepartures(onArrival) {
  const [status, setStatus] = useState('idle') // idle | polling | error
  const prevDepartures = useRef({}) // key → ISO string
  const onArrivalRef = useRef(onArrival)
  onArrivalRef.current = onArrival

  const poll = useCallback(async () => {
    setStatus('polling')
    const now = Date.now()

    try {
      for (const stopId of MONITORED_STOPS) {
        const departures = await fetchDepartures(stopId)

        for (const dep of departures) {
          const key = `${dep.run_ref}-${stopId}`
          const scheduled = dep.estimated_departure_utc ?? dep.scheduled_departure_utc
          if (!scheduled) continue

          const t = new Date(scheduled).getTime()
          const prev = prevDepartures.current[key]

          // Was in the future last poll, now in the past → arrival
          if (prev && new Date(prev).getTime() > now - POLL_MS && t <= now) {
            onArrivalRef.current({
              routeNumber: dep.route?.route_number ?? dep.route_id,
              stopId,
              scheduledDeparture: scheduled,
            })
          }

          prevDepartures.current[key] = scheduled
        }
      }
      setStatus('idle')
    } catch {
      setStatus('error')
    }
  }, [])

  useEffect(() => {
    poll()
    const id = setInterval(poll, POLL_MS)
    return () => clearInterval(id)
  }, [poll])

  return status
}

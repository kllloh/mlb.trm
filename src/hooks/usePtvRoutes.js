import { useState, useEffect } from 'react'
import { fetchTramRoutes, fetchStopsForRoute } from '../lib/ptv'
import { toneForRoute } from '../lib/routeTones'

// Builds a GeoJSON FeatureCollection of LineStrings (one per route)
// by joining ordered stop lat/lng. Requires VITE_PTV_* keys to be set.
export function usePtvRoutes() {
  const [geojson, setGeojson] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const routes = await fetchTramRoutes()

        const features = await Promise.all(
          routes.map(async (route) => {
            const stops = await fetchStopsForRoute(route.route_id)
            const coords = stops
              .filter(s => s.stop_longitude && s.stop_latitude)
              .map(s => [s.stop_longitude, s.stop_latitude])

            const tone = toneForRoute(route.route_number)

            return {
              type: 'Feature',
              geometry: { type: 'LineString', coordinates: coords },
              properties: {
                routeId: route.route_id,
                routeNumber: route.route_number,
                routeName: route.route_name,
                color: tone.color,
                note: tone.note,
              },
            }
          })
        )

        if (!cancelled) {
          setGeojson({ type: 'FeatureCollection', features })
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message)
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [])

  return { geojson, loading, error }
}

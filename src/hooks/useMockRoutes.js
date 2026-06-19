import { useState } from 'react'
import { MOCK_GEOJSON } from '../mock/mockData'

// Returns instantly — no network calls needed
export function useMockRoutes() {
  const [geojson] = useState(MOCK_GEOJSON)
  return { geojson, loading: false, error: null }
}

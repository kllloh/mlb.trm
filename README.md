# mlb.trm

A generative score driven by Melbourne's tram network.

Two trams on the same route passing each other triggers a tone. Congestion adds reverb. Incidents echo with delay. Every playthrough is different.

**[Live demo →](https://kllloh.github.io/mlb.trm)**

## How it works

- Tram positions are simulated from real PTV GTFS headway data
- Each route is assigned a pitch from a musical scale
- Route crossings trigger sustained tones — bell, pad, shimmer depending on the instrument
- Congestion colours the route red and adds reverb
- Incidents trigger a dissonant cluster with delay echo

## Controls

| Control | Description |
|---|---|
| OCT | Shift all pitches up or down by octave |
| BPM | Sets tempo — affects delay echo timing |
| SCALE | Choose the musical scale (minor pentatonic, major, blues, etc.) |
| INST | Instrument voice — default, piano, old piano, strings, 303 |
| Route buttons | Click to mute / unmute individual tram routes |

## Stack

- [React](https://react.dev) + [Vite](https://vitejs.dev)
- [MapLibre GL JS](https://maplibre.org) — CARTO Dark Matter (no labels)
- Web Audio API — pure oscillator synthesis, no samples
- PTV GTFS data for route geometry and headways

## Local dev

```bash
npm install
npm run dev
```

Set `VITE_USE_MOCK=true` in `.env` to run without a PTV API key. Still waiting for the PTV API :(

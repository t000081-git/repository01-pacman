# Pac-Man

A browser-playable Pac-Man clone built with Next.js 15, React 19, and TypeScript. Includes on-screen D-pad controls so it works on touch devices as well as keyboard.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 in your browser.

## Controls

- Arrow keys (or WASD) on desktop
- On-screen D-pad on mobile / touch screens

## Project layout

```
app/
  components/   React components (Game, DPad)
  lib/          Game engine, maze data, audio
  page.tsx      Entry page
  layout.tsx    Root layout
  globals.css   Styles
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the dev server on port 3000 |
| `npm run build` | Production build |
| `npm run start` | Run the production build |

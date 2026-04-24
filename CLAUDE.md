# CLAUDE.md

This file is a compact operating brief for external LLMs working on the Artemis II Free-Return Visualizer. It is meant to provide enough context to make safe changes without reading every line first.

## Project Summary

This repository contains a Vite + TypeScript + Three.js WebGL application that visualizes the Artemis II crewed lunar flyby / free-return trajectory. The first screen is the actual mission console, not a marketing page. The app renders a 3D Earth-Moon-Orion scene with trajectory arcs, mission events, telemetry panels, mini-map, timeline controls, and layer toggles.

GitHub repository:

```text
https://github.com/giuseppelupo1979/artemis-ii-free-return-visualizer
```

Local project path used during development:

```text
/Users/giuseppelupo/Desktop/codice/Artemis Mission
```

## Tech Stack

- Vite for dev server and production build.
- TypeScript for the whole app.
- Three.js for WebGL rendering and interaction.
- `OrbitControls` for 3D camera navigation.
- Playwright Core for smoke testing real browser/WebGL behavior.
- No React, no component framework, no backend.

Main commands:

```bash
npm install
npm run dev
npm run build
node scripts/smoke-test.mjs
```

The app is static after build. Production output is `dist/`.

## Important Files

```text
index.html                         App entry HTML
src/main.ts                        All application logic, simulation, rendering, DOM wiring
src/style.css                      Full UI styling
src/assets/earth-blue-marble-3840.jpg
src/assets/moon-lro-3840.jpg       Photorealistic planet textures
scripts/smoke-test.mjs             Browser/WebGL smoke test
README.md                          User-facing documentation and Linux deployment guide
docs/artemis-smoke.png             README preview screenshot
vite.config.ts                     Vite dev server config
tsconfig.json                      TypeScript config
```

The code is intentionally concentrated in `src/main.ts`. Avoid splitting it into many files unless the change is large enough to justify a structural refactor.

## Current UX And Visual Target

The visual style should remain close to the supplied reference image:

- dark mission-control interface;
- window bar at the top;
- left telemetry panels;
- right mini-map, guidance and mission queue panels;
- large central 3D WebGL scene;
- bottom playback/timeline controls;
- cyan trajectory lines;
- yellow/cyan event markers;
- photorealistic Earth and Moon;
- interactive 3D camera with orbit/zoom.

Avoid turning this into a landing page. The first viewport should stay the tool itself.

## Mission Data And Constants

Important constants are near the top of `src/main.ts`:

```ts
const HOURS = 3600;
const KM_SCALE = 1 / 12500;
const TRUE_RADIUS_SCALE = 1 / 5200;
const ENHANCED_RADIUS_SCALE = 1 / 1900;
const LAUNCH_UTC = Date.UTC(2026, 3, 1, 22, 35, 0);
const MISSION_HOURS = 9 * 24 + 1 + 32 / 60;
const EARTH_RADIUS = 6378.137;
const MOON_RADIUS = 1737.4;
const MOON_DISTANCE = 384400;
const MOON_PERIOD_HOURS = 27.321661 * 24;
const MU_EARTH = 398600.4418;
const MU_MOON = 4902.800066;
```

Mission milestones are defined in the `events` array. Each event has:

- `id`
- `label`
- `metHours`
- `code`
- `detail`

These events drive the queue UI, current phase display, marker labels, and timeline state. If you change mission timing, update both `events` and any dependent trajectory keyframes.

NASA/public-data sources are listed in `sources` and in `README.md`.

## Simulation Model

This is not a certified JPL/NASA propagator. It is a physically plausible visualizer using public mission timing, real Earth/Moon constants, and a hand-shaped free-return trajectory.

Core flow:

1. `buildKeyframes()` defines key positions in kilometers for Orion over mission elapsed time.
2. `interpolate()` uses Hermite interpolation between those keyframes.
3. `constrainLunarPericenter()` prevents the interpolated path from going inside the lunar flyby minimum radius.
4. `buildTrajectory()` samples the whole mission into `State[]`.
5. `getState(t)` interpolates the sampled trajectory for playback.
6. `moonPosition(t)` computes mean lunar position on a circular orbit.
7. `gravityAcceleration()` estimates combined Earth/Moon gravitational acceleration for telemetry.

The important visual/physical constraints:

- closest lunar approach display should stay at `8,282 km center`;
- trajectory should not visually pass through the Moon;
- Earth/Moon distance values should remain plausible;
- Orion path should look like outbound translunar arc plus lunar swingby plus inbound return arc;
- `KM_SCALE` controls spatial scene scale;
- planet radius scales are intentionally separate from orbit scale for readability.

If changing trajectory geometry, verify all of these:

- the mini-map still shows an understandable free-return loop;
- the 3D trajectory does not intersect Earth or Moon;
- labels and event markers stay near the corresponding trajectory points;
- smoke test still passes.

## Rendering Architecture

Main Three.js setup occurs in `src/main.ts`:

- `renderer`: WebGL renderer with antialiasing and `preserveDrawingBuffer: true` for smoke-test canvas inspection.
- `scene`: dark background, fog, star field.
- `camera`: perspective camera.
- `controls`: `OrbitControls` for interaction.
- lights: ambient, directional sun, cyan rim light.
- planets: `createPlanet('earth')`, `createPlanet('moon')`.
- trajectory: `makeTrajectoryLine(...)`.
- event markers: `createMarker(...)`.
- spacecraft: `createCraft()`.
- labels: DOM overlay projected from 3D positions.

Planet textures:

```ts
import earthBlueMarbleUrl from './assets/earth-blue-marble-3840.jpg';
import moonLroUrl from './assets/moon-lro-3840.jpg';
```

`createPlanet()` loads the right texture with `THREE.TextureLoader`, applies `SRGBColorSpace`, anisotropic filtering, `MeshStandardMaterial`, and a subtle glow shell.

Do not reintroduce procedural Earth/Moon surfaces unless explicitly asked. The current requirement is photorealistic planet rendering.

## UI Architecture

The DOM is created as a single `root.innerHTML = ...` template in `src/main.ts`, then styled in `src/style.css`.

Important DOM IDs:

```text
#scene              WebGL canvas
#met                main mission elapsed time
#utc                current UTC
#earthRange         Earth distance display
#moonRange          Moon distance display
#phase              current mission phase
#eventList          mission queue
#timeline           playback range input
#play               play/pause button
#reset              reset button
#focus              focus select
#scaleToggle        true/enhanced scale toggle
#outboundToggle
#inboundToggle
#labelToggle
#trailToggle
#guideToggle
#miniMap
#speedSpark
#earthSpark
#moonSpark
```

`updateScene(clock)` is the main per-frame synchronization point. It updates:

- 3D positions and scales;
- trail geometry;
- visible layers;
- telemetry text;
- active event row;
- labels;
- mini-map.

If adding new UI state, wire it through the `ui` object and update it inside `updateScene()` when possible.

## Styling Guidelines

Most visual behavior lives in `src/style.css`.

Preserve:

- dark palette;
- crisp mission-console typography;
- 8px-ish panel radius;
- cyan/gold highlight language;
- fixed panel layout on desktop;
- responsive fallbacks for narrower screens.

Avoid:

- large decorative gradients/orbs;
- marketing hero sections;
- card-inside-card layouts;
- text overlays that obscure core telemetry;
- huge font scaling based on viewport width.

## Testing

Always run:

```bash
npm run build
```

For rendering/interactivity changes also run:

```bash
node scripts/smoke-test.mjs
```

The smoke test:

- launches Chrome via Playwright Core;
- opens `http://127.0.0.1:5173/`;
- checks WebGL availability;
- checks that the canvas is nonblank;
- watches console/page errors;
- clicks play/reset;
- moves timeline;
- toggles labels/guides;
- writes screenshots to `output/playwright/`.

Important: the dev server must be running before `scripts/smoke-test.mjs`.

Typical local test loop:

```bash
npm run dev
npm run build
node scripts/smoke-test.mjs
```

`output/` is intentionally ignored by Git.

## Deployment

The project is deployable as a static site:

```bash
npm ci
npm run build
```

Serve `dist/` with any static host. README includes a Linux + Nginx deployment recipe.

For quick server preview:

```bash
npm run preview -- --host 0.0.0.0 --port 4173
```

## Git State And Publishing Context

The project has been published to:

```text
https://github.com/giuseppelupo1979/artemis-ii-free-return-visualizer
```

Local branch:

```text
main
```

Remote:

```text
origin https://github.com/giuseppelupo1979/artemis-ii-free-return-visualizer.git
```

Existing commits at the time this file was created:

```text
73f18dd Initial Artemis II visualizer
a93c373 Add photorealistic lunar surface
a3fcdc6 Document Linux server deployment
```

If making changes, keep commits focused and run the validation commands above before pushing.

## Common Change Recipes

### Add Or Change Mission Event

1. Edit `events` in `src/main.ts`.
2. If the event should appear as a 3D marker, ensure it is not filtered out by `events.slice(1, -1)`.
3. If it affects trajectory geometry, edit `buildKeyframes()`.
4. Run build and smoke test.

### Adjust Camera Or Initial View

Look near the renderer setup:

```ts
camera.position.set(...);
controls.target.set(...);
```

Also check `setFocus(value)` for focus modes:

- `earth`
- `return`
- `flyby`

### Improve Planet Rendering

Edit `createPlanet()`.

Be careful with:

- texture color space;
- anisotropy;
- material roughness/emissive values;
- glow shell `side: THREE.BackSide`;
- radius scale constants.

### Improve Trajectory Rendering

Relevant functions:

- `buildKeyframes()`
- `interpolate()`
- `constrainLunarPericenter()`
- `makeTrajectoryLine()`
- `createMarker()`
- `drawMiniMap()`

When changing trajectory, inspect both 3D view and mini-map.

### Add A New Toggle

1. Add control markup in the `root.innerHTML` playback section.
2. Add selector in the `ui` object.
3. Apply behavior in `updateScene()`.
4. Add smoke-test interaction if it is important.

## Known Caveats

- The trajectory is a realistic visualization, not an official ephemeris.
- `EARTH_SOI` is defined but currently not central to rendering.
- The app has no framework-level state manager; state is ordinary module-level variables.
- The screenshot in `docs/` may need manual refresh if the visual design changes significantly.
- The production JS bundle warning over 500 kB is expected because Three.js and high-resolution assets are included.

## Do Not Break

Before considering a change complete, verify:

- app starts with `npm run dev`;
- `npm run build` passes;
- WebGL canvas renders nonblank;
- play/reset/timeline still work;
- Earth and Moon remain photorealistic;
- trajectory does not intersect planets;
- README deployment instructions stay accurate.

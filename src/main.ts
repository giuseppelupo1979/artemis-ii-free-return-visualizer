import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import earthBlueMarbleUrl from './assets/earth-blue-marble-3840.jpg';
import moonLroUrl from './assets/moon-lro-3840.jpg';

type Vec2 = { x: number; y: number };
type State = {
  t: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  moon: THREE.Vector3;
  earthRange: number;
  moonRange: number;
  speed: number;
  phase: MissionEvent;
};

type MissionEvent = {
  id: string;
  label: string;
  metHours: number;
  code: string;
  detail: string;
};

const SECONDS_PER_HOUR = 3600;
const KM_SCALE = 1 / 12500;
const TRUE_RADIUS_SCALE = 1 / 5200;
const ENHANCED_RADIUS_SCALE = 1 / 1900;
const LAUNCH_UTC = Date.UTC(2026, 3, 1, 22, 35, 0); // 2026-04-01 22:35:00 UTC (month is zero-indexed)
const MISSION_HOURS = 9 * 24 + 1 + 32 / 60;
const EARTH_RADIUS = 6378.137;
const MOON_RADIUS = 1737.4;
const MOON_DISTANCE = 384400;
const MOON_PERIOD_HOURS = 27.321661 * 24;
const MU_EARTH = 398600.4418;
const MU_MOON = 4902.800066;

const events: MissionEvent[] = [
  { id: 'launch', label: 'Launch', metHours: 0, code: 'LIFTOFF', detail: 'SLS lifted Orion from LC-39B at 6:35 p.m. EDT on April 1, 2026.' },
  { id: 'icps', label: 'Orion/ICPS separation', metHours: 3 + 24 / 60 + 18 / 3600, code: 'SEPARATION', detail: 'Orion completed early checkout and separated from the interim cryogenic propulsion stage.' },
  { id: 'tli', label: 'Translunar injection', metHours: 25 + 13 / 60 + 48 / 3600, code: 'TLI', detail: 'Departure burn placed Orion on a lunar free-return transfer.' },
  { id: 'ocb', label: 'Outbound correction burn', metHours: 98 + 28 / 60 + 5 / 3600, code: 'OCB', detail: 'Small trim burn refined the lunar aim point and flyby corridor.' },
  { id: 'soi', label: 'Lunar SOI entry', metHours: 116 + 7 / 60 + 29 / 3600, code: 'LUNAR-SOI', detail: 'Orion entered the Moon Hill sphere, about 62,800 km from lunar center.' },
  { id: 'closest', label: 'Closest lunar approach', metHours: 125 + 25 / 60 + 48 / 3600, code: 'PC', detail: 'Free-return flyby passed behind the Moon and bent Orion toward Earth.' },
  { id: 'max', label: 'Maximum Earth distance', metHours: 129 + 29 / 60 + 48 / 3600, code: 'MAX RANGE', detail: 'The outbound arc reached its farthest point from Earth after the lunar swingby.' },
  { id: 'rcb', label: 'Return correction burn 1', metHours: 170 + 12 / 60, code: 'RCB-1', detail: 'Return corridor trim maintained the targeted entry interface.' },
  { id: 'entry', label: 'Entry interface', metHours: MISSION_HOURS - 0.45, code: 'EI', detail: 'Orion met the atmosphere for the guided skip-entry sequence.' },
  { id: 'splash', label: 'Splashdown', metHours: MISSION_HOURS, code: 'SPLASH', detail: 'Pacific recovery completed the Artemis II crewed lunar flyby.' }
];

const sources = [
  ['NASA Artemis II mission page', 'https://www.nasa.gov/mission/artemis-ii/'],
  ['NASA launch gallery', 'https://www.nasa.gov/gallery/artemis-ii-launch/'],
  ['NASA postflight assessment', 'https://www.nasa.gov/missions/nasa-on-track-for-future-missions-with-initial-artemis-ii-assessments/'],
  ['NASA press kit', 'https://www.nasa.gov/artemis-ii-press-kit/']
] as const;

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing app root');

root.innerHTML = `
  <main class="shell">
    <div class="window-bar">
      <div class="lights"><span></span><span></span><span></span></div>
      <div>ARTEMIS II / ORION INTEGRITY / FREE-RETURN VISUALIZER</div>
      <button id="sourceBtn">NASA / JPL HORIZONS</button>
    </div>
    <section class="viewport">
      <canvas id="scene"></canvas>
      <aside class="panel left telemetry">
        <div class="card hero-card">
          <p>MET</p><strong id="met">T+0/00:00:00</strong>
          <p>UTC</p><span id="utc">2026-04-01 22:35:00 UTC</span>
          <div class="stat"><span>EARTH</span><b id="earthRange">0 km</b></div>
          <div class="stat cyan"><span>MOON</span><b id="moonRange">0 km</b></div>
          <div class="stat gold"><span>PHASE</span><b id="phase">Launch</b></div>
        </div>
        <div class="card event-card">
          <div class="kicker"><span>CURRENT EVENT</span><span id="eventCode">LIFTOFF</span></div>
          <h2 id="eventTitle">Launch</h2>
          <p id="eventDetail">SLS lifted Orion from LC-39B.</p>
        </div>
        <div class="card charts">
          <div class="spark"><div><span>VELOCITY</span><b id="velocity">0 km/h</b></div><canvas id="speedSpark" width="330" height="82"></canvas></div>
          <div class="spark"><div><span>EARTH RANGE</span><b id="earthSparkLabel">0 km</b></div><canvas id="earthSpark" width="330" height="82"></canvas></div>
          <div class="spark"><div><span>MOON RANGE</span><b id="moonSparkLabel">0 km</b></div><canvas id="moonSpark" width="330" height="82"></canvas></div>
        </div>
      </aside>
      <aside class="panel right guidance">
        <div class="card minimap-card">
          <div class="kicker"><span>FREE-RETURN OVERVIEW</span><span>SIMPLIFIED MAP</span></div>
          <canvas id="miniMap" width="360" height="165"></canvas>
        </div>
        <div class="card guidance-card">
          <div class="kicker"><span>GUIDANCE</span><span id="leg">OUTBOUND</span></div>
          <h2>Physics State Vectors</h2>
          <div class="stat"><span>VECTOR FRAME</span><b>EME2000</b></div>
          <div class="stat cyan"><span>MODEL</span><b>CR3BP + Hermite</b></div>
          <div class="stat gold"><span>MOON PC</span><b id="moonPc">0 km center</b></div>
          <div class="stat"><span>MAX EARTH</span><b id="maxEarth">0 km</b></div>
        </div>
        <div class="card queue">
          <div class="kicker"><span>MISSION QUEUE</span><span>PHASE LOG</span></div>
          <div id="eventList"></div>
        </div>
      </aside>
      <div class="labels-layer" id="labels"></div>
      <section class="playback">
        <div class="playback-top">
          <div><span>MISSION PLAYBACK</span><strong id="playMet">MET T+0/00:00:00</strong></div>
          <div class="buttons">
            <button id="play">Play</button><button id="reset">Reset</button>
            <button data-speed="1">1x</button><button class="active" data-speed="5">5x</button><button data-speed="20">20x</button>
            <select id="focus"><option value="flyby">Lunar Flyby</option><option value="earth">Earth Departure</option><option value="return">Return Corridor</option></select>
            <label><input id="scaleToggle" type="checkbox" checked /> True scale</label>
          </div>
        </div>
        <input id="timeline" type="range" min="0" max="10000" value="0" />
        <div class="ticks"></div>
        <div class="toggles">
          <label><input id="outboundToggle" type="checkbox" checked /> Show outbound arc</label>
          <label><input id="inboundToggle" type="checkbox" checked /> Show inbound arc</label>
          <label><input id="labelToggle" type="checkbox" checked /> Show labels</label>
          <label><input id="trailToggle" type="checkbox" checked /> Show trajectory trails</label>
          <label><input id="guideToggle" type="checkbox" checked /> Show orbit guides</label>
        </div>
      </section>
    </section>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
const textureLoader = new THREE.TextureLoader();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000207);
scene.fog = new THREE.FogExp2(0x000207, 0.0035);

const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 2000);
camera.position.set(17, 7, 30);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.rotateSpeed = 0.45;
controls.zoomSpeed = 0.72;
controls.minDistance = 4;
controls.maxDistance = 120;
controls.target.set(19, 0, -16);

scene.add(new THREE.AmbientLight(0x8ea5ff, 0.26));
const sun = new THREE.DirectionalLight(0xffffff, 2.7);
sun.position.set(-20, 10, 18);
scene.add(sun);
const rim = new THREE.PointLight(0x77faff, 1.2, 70);
rim.position.set(0, 5, 0);
scene.add(rim);

const trajectory = buildTrajectory();
const maxEarthKm = Math.max(...trajectory.map((s) => s.earthRange));
const minMoonKm = Math.min(...trajectory.map((s) => s.moonRange));
const trajectoryPoints = trajectory.map((s) => toScene(s.position));

const earth = createPlanet('earth');
const moon = createPlanet('moon');
scene.add(earth.group, moon.group);

const earthOrbit = createOrbitGuide(MOON_DISTANCE * KM_SCALE, 0x163150);
scene.add(earthOrbit);

const grid = new THREE.GridHelper(130, 56, 0x12375b, 0x08192c);
grid.position.y = -1.72;
grid.material.opacity = 0.36;
(grid.material as THREE.Material).transparent = true;
scene.add(grid);

const axes = createAxes();
scene.add(axes);

const starField = createStars();
scene.add(starField);

const outbound = makeTrajectoryLine(trajectoryPoints.slice(0, indexAt(events.find((e) => e.id === 'closest')!.metHours) + 1), 0x58ffff, 1);
const inbound = makeTrajectoryLine(trajectoryPoints.slice(indexAt(events.find((e) => e.id === 'closest')!.metHours)), 0x2ac7ca, 0.64);
scene.add(outbound, inbound);

const TRAIL_MAX = 210;
const trailPositions = new Float32Array(TRAIL_MAX * 3);
const trailGeometry = new THREE.BufferGeometry();
trailGeometry.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
trailGeometry.setDrawRange(0, 0);
const trailLine = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1 }));
scene.add(trailLine);

const craft = createCraft();
scene.add(craft);

const eventMarkers = events.slice(1, -1).map((event) => {
  const state = getState(event.metHours);
  const marker = createMarker(event.code.includes('MAX') ? 0xffd84e : 0x60ffff);
  marker.position.copy(toScene(state.position));
  scene.add(marker);
  return { event, marker };
});

const labels = document.querySelector<HTMLDivElement>('#labels')!;
const labelItems = [
  { id: 'earth', text: 'EARTH', object: earth.group },
  { id: 'moon', text: 'MOON', object: moon.group },
  { id: 'orion', text: 'ORION', object: craft },
  ...eventMarkers.map(({ event, marker }) => ({ id: event.id, text: event.code, object: marker }))
].map((item) => {
  const el = document.createElement('div');
  el.className = `scene-label ${item.id}`;
  el.textContent = item.text;
  labels.appendChild(el);
  return { ...item, el };
});

const eventsById = new Map(events.map((e) => [e.id, e]));
const closestMetHours = eventsById.get('closest')!.metHours;

const eventList = document.querySelector<HTMLDivElement>('#eventList')!;
eventList.innerHTML = events.slice(1).map((event) => `
  <button class="event-row" data-met="${event.metHours}">
    <strong>${event.label}</strong><span>T+${formatMET(event.metHours).replace('T+', '')}</span>
  </button>
`).join('');
const eventRowButtons = Array.from(eventList.querySelectorAll<HTMLButtonElement>('.event-row'));

const sourceBtn = document.querySelector<HTMLButtonElement>('#sourceBtn')!;
sourceBtn.addEventListener('click', () => {
  sourceBtn.blur();
  const lines = sources.map(([label, url]) => `${label}: ${url}`).join('\n');
  window.alert(`Mission data sources\n\n${lines}\n\nPhysical constants: NASA/NSSDC standard gravitational parameters and mean radii.`);
});

let missionTime = events.find((e) => e.id === 'soi')!.metHours;
let playing = false;
let speed = 5;
let last = performance.now();

const ui = {
  met: text('#met'),
  utc: text('#utc'),
  earthRange: text('#earthRange'),
  moonRange: text('#moonRange'),
  phase: text('#phase'),
  eventCode: text('#eventCode'),
  eventTitle: text('#eventTitle'),
  eventDetail: text('#eventDetail'),
  velocity: text('#velocity'),
  earthSparkLabel: text('#earthSparkLabel'),
  moonSparkLabel: text('#moonSparkLabel'),
  playMet: text('#playMet'),
  leg: text('#leg'),
  moonPc: text('#moonPc'),
  maxEarth: text('#maxEarth'),
  timeline: document.querySelector<HTMLInputElement>('#timeline')!,
  play: document.querySelector<HTMLButtonElement>('#play')!,
  reset: document.querySelector<HTMLButtonElement>('#reset')!,
  scaleToggle: document.querySelector<HTMLInputElement>('#scaleToggle')!,
  outboundToggle: document.querySelector<HTMLInputElement>('#outboundToggle')!,
  inboundToggle: document.querySelector<HTMLInputElement>('#inboundToggle')!,
  labelToggle: document.querySelector<HTMLInputElement>('#labelToggle')!,
  trailToggle: document.querySelector<HTMLInputElement>('#trailToggle')!,
  guideToggle: document.querySelector<HTMLInputElement>('#guideToggle')!,
  focus: document.querySelector<HTMLSelectElement>('#focus')!
};

ui.timeline.value = String((missionTime / MISSION_HOURS) * 10000);
ui.play.addEventListener('click', () => {
  playing = !playing;
  ui.play.textContent = playing ? 'Pause' : 'Play';
});
ui.reset.addEventListener('click', () => {
  missionTime = 0;
  playing = false;
  ui.play.textContent = 'Play';
  setFocus('earth');
});
ui.timeline.addEventListener('input', () => {
  missionTime = (Number(ui.timeline.value) / 10000) * MISSION_HOURS;
  playing = false;
  ui.play.textContent = 'Play';
});
document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => {
  button.addEventListener('click', () => {
    speed = Number(button.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach((el) => el.classList.remove('active'));
    button.classList.add('active');
  });
});
ui.focus.addEventListener('change', () => setFocus(ui.focus.value));
eventList.querySelectorAll<HTMLButtonElement>('.event-row').forEach((button) => {
  button.addEventListener('click', () => {
    missionTime = Number(button.dataset.met);
    playing = false;
    ui.play.textContent = 'Play';
  });
});

const miniMapCanvas = document.querySelector<HTMLCanvasElement>('#miniMap')!;
const miniMapCtx = miniMapCanvas.getContext('2d')!;
const miniW = miniMapCanvas.width;
const miniH = miniMapCanvas.height;
const miniXs = trajectory.map((s) => s.position.x);
const miniYs = trajectory.map((s) => s.position.y);
const miniMinX = Math.min(...miniXs), miniMaxX = Math.max(...miniXs);
const miniMinY = Math.min(...miniYs), miniMaxY = Math.max(...miniYs);
const miniMapStatic = document.createElement('canvas');
miniMapStatic.width = miniW;
miniMapStatic.height = miniH;
buildStaticMiniMap();

drawSparks();
drawMiniMap();
animate();

function buildTrajectory(): State[] {
  const samples = 1200;
  const keys = buildKeyframes();
  const states: State[] = [];
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * MISSION_HOURS;
    const position = constrainLunarPericenter(interpolate(keys, t), t);
    const dt = MISSION_HOURS / samples;
    const before = constrainLunarPericenter(interpolate(keys, Math.max(0, t - dt)), Math.max(0, t - dt));
    const after = constrainLunarPericenter(interpolate(keys, Math.min(MISSION_HOURS, t + dt)), Math.min(MISSION_HOURS, t + dt));
    const velocity = after.clone().sub(before).divideScalar((Math.min(MISSION_HOURS, t + dt) - Math.max(0, t - dt)) * SECONDS_PER_HOUR);
    const moon = moonPosition(t);
    const phase = currentEvent(t);
    states.push({
      t,
      position,
      velocity,
      moon,
      earthRange: Math.max(EARTH_RADIUS, position.length()),
      moonRange: position.distanceTo(moon),
      speed: velocity.length() * SECONDS_PER_HOUR,
      phase
    });
  }
  return states;
}

function constrainLunarPericenter(position: THREE.Vector3, tHours: number) {
  const moon = moonPosition(tHours);
  const delta = position.clone().sub(moon);
  const minimumFlybyRadius = 8282;
  if (delta.length() < minimumFlybyRadius) {
    const direction = delta.lengthSq() > 1 ? delta.normalize() : new THREE.Vector3(-1, 0, 0);
    return moon.add(direction.multiplyScalar(minimumFlybyRadius));
  }
  return position;
}

function buildKeyframes() {
  const pcT = events.find((e) => e.id === 'closest')!.metHours;
  const maxT = events.find((e) => e.id === 'max')!.metHours;
  const lunarSoiT = events.find((e) => e.id === 'soi')!.metHours;
  const moonAtPc = moonPosition(pcT);
  const flybyNormal = moonAtPc.clone().normalize();
  const tangent = new THREE.Vector3(-flybyNormal.y, flybyNormal.x, 0).normalize();
  const peri = moonAtPc.clone().add(flybyNormal.clone().multiplyScalar(-8282)).add(tangent.clone().multiplyScalar(2900));
  const far = moonAtPc.clone().add(flybyNormal.clone().multiplyScalar(28500)).add(tangent.clone().multiplyScalar(8200));
  const soi = moonPosition(lunarSoiT).clone().add(flybyNormal.clone().multiplyScalar(-62600));

  const keyData = [
    { t: 0, p: new THREE.Vector3(EARTH_RADIUS + 80, -420, 0) },
    { t: 0.18, p: new THREE.Vector3(EARTH_RADIUS + 320, 1200, 0) },
    { t: 1.2, p: new THREE.Vector3(20500, 14600, 0) },
    { t: 3.4, p: new THREE.Vector3(-22000, 33200, 0) },
    { t: 7.6, p: new THREE.Vector3(-15800, -52000, 0) },
    { t: 14.2, p: new THREE.Vector3(61000, -7600, 0) },
    { t: 25.23, p: new THREE.Vector3(46600, 14600, 0) },
    { t: 58, p: new THREE.Vector3(129000, 76000, 6500) },
    { t: 88, p: new THREE.Vector3(236000, 132000, 9000) },
    { t: lunarSoiT, p: soi },
    { t: pcT - 5.2, p: moonPosition(pcT - 5.2).clone().add(flybyNormal.clone().multiplyScalar(-40500)).add(tangent.clone().multiplyScalar(-3600)) },
    { t: pcT - 2.1, p: moonPosition(pcT - 2.1).clone().add(flybyNormal.clone().multiplyScalar(-18800)).add(tangent.clone().multiplyScalar(1200)) },
    { t: pcT, p: peri },
    { t: pcT + 2.1, p: moonPosition(pcT + 2.1).clone().add(flybyNormal.clone().multiplyScalar(14200)).add(tangent.clone().multiplyScalar(5200)) },
    { t: pcT + 5, p: moonPosition(pcT + 5).clone().add(flybyNormal.clone().multiplyScalar(25500)).add(tangent.clone().multiplyScalar(7600)) },
    { t: maxT, p: far },
    { t: 156, p: new THREE.Vector3(306000, 82000, -4200) },
    { t: 188, p: new THREE.Vector3(177000, 31800, -2400) },
    { t: 207, p: new THREE.Vector3(61000, 10300, -600) },
    { t: MISSION_HOURS - 0.45, p: new THREE.Vector3(EARTH_RADIUS + 121, -2100, 0) },
    { t: MISSION_HOURS, p: new THREE.Vector3(EARTH_RADIUS, -160, 0) }
  ];

  return keyData.map((key, i, arr) => {
    const prev = arr[Math.max(0, i - 1)];
    const next = arr[Math.min(arr.length - 1, i + 1)];
    const tangentVector = next.p.clone().sub(prev.p).divideScalar(Math.max(1, next.t - prev.t));
    return { ...key, m: tangentVector };
  });
}

function interpolate(keys: ReturnType<typeof buildKeyframes>, t: number) {
  if (t <= keys[0].t) return keys[0].p.clone();
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b.t) {
      const span = b.t - a.t;
      const u = (t - a.t) / span;
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      return a.p.clone().multiplyScalar(h00)
        .add(a.m.clone().multiplyScalar(h10 * span))
        .add(b.p.clone().multiplyScalar(h01))
        .add(b.m.clone().multiplyScalar(h11 * span));
    }
  }
  return keys[keys.length - 1].p.clone();
}

function moonPosition(tHours: number) {
  const theta = THREE.MathUtils.degToRad(28) + (tHours / MOON_PERIOD_HOURS) * Math.PI * 2;
  return new THREE.Vector3(Math.cos(theta) * MOON_DISTANCE, Math.sin(theta) * MOON_DISTANCE, 0);
}

function gravityAcceleration(position: THREE.Vector3, tHours: number) {
  const moon = moonPosition(tHours);
  const earthTerm = position.clone().multiplyScalar(-MU_EARTH / Math.pow(Math.max(position.length(), EARTH_RADIUS), 3));
  const moonDelta = position.clone().sub(moon);
  const moonTerm = moonDelta.multiplyScalar(-MU_MOON / Math.pow(Math.max(moonDelta.length(), MOON_RADIUS), 3));
  return earthTerm.add(moonTerm);
}

function getState(t: number) {
  const clamped = THREE.MathUtils.clamp(t, 0, MISSION_HOURS);
  const scaled = (clamped / MISSION_HOURS) * (trajectory.length - 1);
  const lo = Math.floor(scaled);
  const hi = Math.min(trajectory.length - 1, lo + 1);
  const u = scaled - lo;
  const a = trajectory[lo];
  const b = trajectory[hi];
  const position = a.position.clone().lerp(b.position, u);
  const velocity = a.velocity.clone().lerp(b.velocity, u);
  const moon = moonPosition(clamped);
  return {
    t: clamped,
    position,
    velocity,
    moon,
    earthRange: position.length(),
    moonRange: position.distanceTo(moon),
    speed: velocity.length() * SECONDS_PER_HOUR,
    phase: currentEvent(clamped)
  };
}

function currentEvent(t: number) {
  return events.reduce((active, event) => event.metHours <= t ? event : active, events[0]);
}

function toScene(v: THREE.Vector3) {
  return new THREE.Vector3(v.x * KM_SCALE, v.z * KM_SCALE, -v.y * KM_SCALE);
}

function createPlanet(kind: 'earth' | 'moon') {
  const radiusKm = kind === 'earth' ? EARTH_RADIUS : MOON_RADIUS;
  const texture = textureLoader.load(kind === 'earth' ? earthBlueMarbleUrl : moonLroUrl);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: kind === 'earth' ? 0.72 : 0.92,
    metalness: 0,
    emissive: kind === 'earth' ? new THREE.Color(0x020712) : new THREE.Color(0x020203),
    emissiveIntensity: kind === 'earth' ? 0.08 : 0.08
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), material);
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(kind === 'earth' ? 1.075 : 1.055, 96, 64),
    new THREE.MeshBasicMaterial({
      color: kind === 'earth' ? 0x6fdfff : 0x9fb4c9,
      transparent: true,
      opacity: kind === 'earth' ? 0.16 : 0.09,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide
    })
  );
  const group = new THREE.Group();
  group.add(mesh, glow);
  group.userData.radiusKm = radiusKm;
  return { group, mesh, glow };
}

function createCraft() {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.22, 24),
    new THREE.MeshStandardMaterial({ color: 0xc9f6ff, roughness: 0.35, metalness: 0.3 })
  );
  body.rotation.x = Math.PI / 2;
  const service = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.1, 0.18, 24),
    new THREE.MeshStandardMaterial({ color: 0x79a8b7, roughness: 0.52, metalness: 0.2 })
  );
  service.rotation.x = Math.PI / 2;
  service.position.z = 0.14;
  const solarMat = new THREE.MeshBasicMaterial({ color: 0x4ef7ff, transparent: true, opacity: 0.7 });
  for (const x of [-0.2, 0.2]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.08), solarMat);
    panel.position.set(x, 0, 0.15);
    group.add(panel);
  }
  const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.18, 32, 16), new THREE.MeshBasicMaterial({ color: 0x00f5ff, transparent: true, opacity: 0.34, blending: THREE.AdditiveBlending }));
  group.add(body, service, pulse);
  group.userData.pulse = pulse;
  return group;
}

function createStars() {
  const count = 1400;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = THREE.MathUtils.randFloat(65, 180);
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(1.7));
    positions[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    positions[i * 3 + 1] = Math.cos(phi) * r;
    positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
    const c = new THREE.Color().setHSL(THREE.MathUtils.randFloat(0.52, 0.66), 0.25, THREE.MathUtils.randFloat(0.62, 1));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.035, vertexColors: true, transparent: true, opacity: 0.72 }));
}

function makeTrajectoryLine(points: THREE.Vector3[], color: number, opacity: number) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  return new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity, linewidth: 2 }));
}

function createMarker(color: number) {
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 28, 14),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 })
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 28, 14),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending })
  );
  marker.add(halo);
  return marker;
}

function createOrbitGuide(radius: number, color: number) {
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(a) * radius, -1.7, Math.sin(a) * radius));
  }
  return makeTrajectoryLine(points, color, 0.5);
}

function createAxes() {
  const group = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: 0x0f3554, transparent: true, opacity: 0.34 });
  for (const points of [
    [new THREE.Vector3(-80, 0, 0), new THREE.Vector3(80, 0, 0)],
    [new THREE.Vector3(0, -12, 0), new THREE.Vector3(0, 20, 0)],
    [new THREE.Vector3(0, 0, -80), new THREE.Vector3(0, 0, 80)]
  ]) {
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), mat));
  }
  return group;
}


function animate() {
  const now = performance.now();
  const dt = Math.min(0.08, (now - last) / 1000);
  last = now;
  if (playing) {
    missionTime += dt * speed * 0.12;
    if (missionTime >= MISSION_HOURS) {
      missionTime = MISSION_HOURS;
      playing = false;
      ui.play.textContent = 'Play';
    }
  }
  updateScene(now * 0.001);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateScene(clock: number) {
  const state = getState(missionTime);
  const moonScene = toScene(state.moon);
  craft.position.copy(toScene(state.position));
  moon.group.position.copy(moonScene);
  earth.group.position.set(0, 0, 0);
  earth.mesh.rotation.y += 0.0008;
  moon.mesh.rotation.y += 0.00018;
  const visualScale = ui.scaleToggle.checked ? TRUE_RADIUS_SCALE : ENHANCED_RADIUS_SCALE;
  earth.group.scale.setScalar(EARTH_RADIUS * visualScale);
  moon.group.scale.setScalar(MOON_RADIUS * visualScale);
  const pulse = craft.userData.pulse as THREE.Mesh;
  pulse.scale.setScalar(1 + Math.sin(clock * 4) * 0.12);
  craft.lookAt(moonScene);

  const trailEnd = Math.max(2, indexAt(missionTime));
  const trailStart = Math.max(0, trailEnd - TRAIL_MAX);
  const trailCount = trailEnd - trailStart;
  const attr = trailLine.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < trailCount; i++) {
    const pt = trajectoryPoints[trailStart + i];
    attr.setXYZ(i, pt.x, pt.y, pt.z);
  }
  attr.needsUpdate = true;
  trailLine.geometry.setDrawRange(0, trailCount);

  outbound.visible = ui.outboundToggle.checked;
  inbound.visible = ui.inboundToggle.checked;
  trailLine.visible = ui.trailToggle.checked;
  earthOrbit.visible = ui.guideToggle.checked;
  grid.visible = ui.guideToggle.checked;
  axes.visible = ui.guideToggle.checked;
  labels.classList.toggle('hidden', !ui.labelToggle.checked);

  const accel = gravityAcceleration(state.position, missionTime);
  const nearestMoon = minMoonKm;
  ui.met.textContent = formatMET(missionTime);
  ui.playMet.textContent = `MET ${formatMET(missionTime)}`;
  ui.utc.textContent = formatUTC(missionTime);
  ui.earthRange.textContent = `${formatNumber(state.earthRange)} km`;
  ui.moonRange.textContent = `${formatNumber(state.moonRange)} km`;
  ui.phase.textContent = state.phase.label;
  ui.eventCode.textContent = state.phase.code;
  ui.eventTitle.textContent = state.phase.label;
  ui.eventDetail.textContent = `${state.phase.detail} Gravity now ${accel.length().toExponential(2)} km/s².`;
  ui.velocity.textContent = `${formatNumber(state.speed)} km/h`;
  ui.earthSparkLabel.textContent = `${formatNumber(state.earthRange)} km`;
  ui.moonSparkLabel.textContent = `${formatNumber(state.moonRange)} km`;
  ui.leg.textContent = missionTime < closestMetHours ? 'OUTBOUND' : 'INBOUND';
  ui.moonPc.textContent = `${formatNumber(nearestMoon)} km center`;
  ui.maxEarth.textContent = `${formatNumber(maxEarthKm)} km`;
  ui.timeline.value = String((missionTime / MISSION_HOURS) * 10000);

  eventRowButtons.forEach((button) => {
    const t = Number(button.dataset.met);
    button.classList.toggle('active', Math.abs(t - state.phase.metHours) < 0.01);
    button.classList.toggle('past', t <= missionTime);
  });

  projectLabels();
  drawMiniMap();
}

function setFocus(value: string) {
  const state = getState(missionTime);
  if (value === 'earth') {
    controls.target.set(0, 0, 0);
    camera.position.set(5, 4, 11);
  } else if (value === 'return') {
    controls.target.copy(toScene(state.position));
    camera.position.copy(toScene(state.position).add(new THREE.Vector3(8, 6, 12)));
  } else {
    controls.target.copy(toScene(state.moon).multiplyScalar(0.8));
    camera.position.set(9, 8, 19);
  }
}

function projectLabels() {
  const rect = canvas.getBoundingClientRect();
  for (const item of labelItems) {
    const p = item.object.getWorldPosition(new THREE.Vector3()).project(camera);
    const visible = p.z > -1 && p.z < 1;
    item.el.style.display = visible ? 'block' : 'none';
    item.el.style.transform = `translate(${(p.x * 0.5 + 0.5) * rect.width + rect.left}px, ${(-p.y * 0.5 + 0.5) * rect.height + rect.top}px)`;
  }
}

function drawSparks() {
  drawSpark(document.querySelector<HTMLCanvasElement>('#speedSpark')!, trajectory.map((s) => s.speed), '#85fbff');
  drawSpark(document.querySelector<HTMLCanvasElement>('#earthSpark')!, trajectory.map((s) => s.earthRange), '#8fc8ff');
  drawSpark(document.querySelector<HTMLCanvasElement>('#moonSpark')!, trajectory.map((s) => Math.min(s.moonRange, 160000)), '#f5d45d');
}

function drawSpark(canvasEl: HTMLCanvasElement, values: number[], color: string) {
  const ctx = canvasEl.getContext('2d')!;
  const { width: w, height: h } = canvasEl;
  ctx.clearRect(0, 0, w, h);
  const min = Math.min(...values);
  const max = Math.max(...values);
  ctx.fillStyle = 'rgba(39, 78, 130, .22)';
  ctx.beginPath();
  values.forEach((value, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - 10 - ((value - min) / Math.max(1, max - min)) * (h - 24);
    if (i === 0) ctx.moveTo(x, h - 8);
    ctx.lineTo(x, y);
  });
  ctx.lineTo(w, h - 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  values.forEach((value, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - 10 - ((value - min) / Math.max(1, max - min)) * (h - 24);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function miniMap(v: THREE.Vector3): Vec2 {
  return {
    x: 20 + ((v.x - miniMinX) / (miniMaxX - miniMinX)) * (miniW - 42),
    y: miniH - 18 - ((v.y - miniMinY) / (miniMaxY - miniMinY)) * (miniH - 34)
  };
}
function buildStaticMiniMap() {
  const sCtx = miniMapStatic.getContext('2d')!;
  sCtx.fillStyle = '#070c1d';
  sCtx.fillRect(0, 0, miniW, miniH);
  sCtx.strokeStyle = 'rgba(86,255,255,.72)';
  sCtx.lineWidth = 2;
  sCtx.beginPath();
  trajectory.forEach((s, i) => {
    const p = miniMap(s.position);
    if (i === 0) sCtx.moveTo(p.x, p.y);
    else sCtx.lineTo(p.x, p.y);
  });
  sCtx.stroke();
}

function drawMiniMap() {
  miniMapCtx.clearRect(0, 0, miniW, miniH);
  miniMapCtx.drawImage(miniMapStatic, 0, 0);
  const state = getState(missionTime);
  const p = miniMap(state.position);
  const e = miniMap(new THREE.Vector3());
  const m = miniMap(state.moon);
  drawDot(miniMapCtx, e.x, e.y, 6, '#80f7ff', 'EARTH');
  drawDot(miniMapCtx, m.x, m.y, 5, '#f7d45b', 'MOON');
  drawDot(miniMapCtx, p.x, p.y, 5, '#46ffff', 'ORION');
}

function drawDot(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, label: string) {
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = color;
  ctx.font = '700 11px ui-monospace, monospace';
  ctx.fillText(label, x + 8, y + 4);
}

function text(selector: string) {
  return document.querySelector<HTMLElement>(selector)!;
}

function indexAt(t: number) {
  return Math.round((THREE.MathUtils.clamp(t, 0, MISSION_HOURS) / MISSION_HOURS) * (trajectory.length - 1));
}

function formatNumber(value: number) {
  return Math.round(value).toLocaleString('en-US');
}

function formatMET(hours: number) {
  const total = Math.max(0, Math.round(hours * 3600));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `T+${d}/${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatUTC(hours: number) {
  const date = new Date(LAUNCH_UTC + hours * SECONDS_PER_HOUR * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')} UTC`;
}

window.addEventListener('resize', resize);
resize();

function resize() {
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(rect.width, rect.height, false);
  camera.aspect = rect.width / rect.height;
  camera.updateProjectionMatrix();
}

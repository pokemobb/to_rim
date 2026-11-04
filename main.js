import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { buildScenery, LABEL_HEIGHT } from './scenery.js';
import { toJson } from './layout-format.js';
import { createPeople } from './people.js';

// แบบโต๊ะที่แอดมินเลือกได้ (หน่วยเมตร) — seats คือตำแหน่งเก้าอี้เทียบกับกลางโต๊ะ
const TYPES = {
  long6: {
    name: 'โต๊ะยาว 6 ที่นั่ง',
    w: 2.4,
    d: 1.0,
    seats: [[-0.8, -0.85], [0, -0.85], [0.8, -0.85], [-0.8, 0.85], [0, 0.85], [0.8, 0.85]],
  },
  square4: {
    name: 'โต๊ะจัตุรัส 4 ที่นั่ง',
    w: 1.1,
    d: 1.1,
    seats: [[0, -0.85], [0, 0.85], [-0.85, 0], [0.85, 0]],
  },
};

const COLOR = {
  bg: 0xdfe8ee,
  table: 0x2f5d80,
  tableHover: 0x4c86b3,
  tableSelected: 0xff4d55,
  seat: 0xb9c3cf,
  metal: 0x6b7280,
  pin: 0xff3b45,
};

const VIEW = -1; // มองจากฝั่ง z ติดลบ = ฝั่งประตูคู่ด้านบนที่เดินเข้ามา (เปลี่ยนเป็น 1 ถ้าจะมองจากฝั่งตรงข้าม)

const $ = (id) => document.getElementById(id);
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD ตามเวลาเครื่อง
const thaiDate = (iso) => new Date(`${iso}T00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });

// localStorage อาจใช้ไม่ได้ (โหมดไม่ระบุตัวตน ฯลฯ) จึงห่อ try/catch ไว้ทุกครั้ง
const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch {} },
};

// ---------- ผังโต๊ะ ----------
const params = new URLSearchParams(location.search);
const isAdmin = params.has('admin');

const published = await fetch('layout.json', { cache: 'no-cache' }).then((r) => r.json());
const layout = structuredClone(published);
if (isAdmin) {
  // ผังที่แอดมินแก้ค้างไว้ อยู่แค่ในเครื่องแอดมินจนกว่าจะเอา layout.json ไปแทนใน GitHub
  const draft = store.get('torim:draft');
  if (Array.isArray(draft)) layout.tables = draft;
}
const { room, grid } = layout;

const tableId = (t) => `${t.col}-${t.row}`;
const cellPos = (col, row) => ({
  x: grid.x0 + (col - 1) * grid.colSpacing,
  z: grid.z0 + (row - 1) * grid.rowSpacing,
});
const findTable = (col, row) => layout.tables.find((t) => t.col === col && t.row === row);
const describe = (id) => {
  const [col, row] = id.split('-');
  return `แถว ${col} · ตัวที่ ${row} นับจากประตูทางเข้า`;
};

// ---------- ฉาก ----------
const app = $('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'labels';
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(COLOR.bg);

const roomW = room.maxX - room.minX;
const roomD = room.maxZ - room.minZ;
const center = new THREE.Vector3((room.minX + room.maxX) / 2, 0, (room.minZ + room.maxZ) / 2);
const span = Math.max(roomW, roomD);
const portrait = window.innerHeight > window.innerWidth;
// เลื่อนจุดมองเข้าหาฝั่งทางเข้านิดหน่อย ไม่ให้ประตูกับเลขคอลัมน์จมอยู่ใต้แผงด้านล่าง
const homeTarget = center.clone().add(new THREE.Vector3(0, 0, VIEW * span * 0.07));
const HOME = {
  pos: homeTarget.clone().add(portrait ? new THREE.Vector3(0, span * 0.78, VIEW * span * 0.6) : new THREE.Vector3(0, span * 0.85, VIEW * span * 0.75)),
  target: homeTarget,
};

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.45;
controls.minDistance = 5;
controls.maxDistance = span * 3;

scene.add(new THREE.HemisphereLight(0xffffff, 0xb8c2cc, 2.2));
const sun = new THREE.DirectionalLight(0xffffff, 2);
sun.position.copy(center).add(new THREE.Vector3(15, 40, VIEW * 12));
sun.target.position.copy(center);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const reach = span * 0.65;
Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, far: 120 });
scene.add(sun, sun.target);

function label(text, className) {
  const el = document.createElement('div');
  el.className = className;
  el.textContent = text;
  return new CSS2DObject(el);
}

const floor = buildScenery(scene, layout);

const ICON = { shop: '🛒', dishes: '🍽️', toilet: '🚻', door: '🚪' };
for (const lm of layout.landmarks) {
  if (!lm.label) continue;
  const tag = label(`${ICON[lm.kind] ?? ''} ${lm.label}`.trim(), 'tag landmark');
  tag.position.set(lm.x, LABEL_HEIGHT[lm.kind] ?? (lm.h ?? 1) + 0.4, lm.z);
  scene.add(tag);
}

// เลขคอลัมน์หัวแถว เหมือนในผังกระดาษ
for (let col = 1; col <= grid.cols; col++) {
  const p = cellPos(col, 1);
  const tag = label(String(col), 'tag colnum');
  tag.position.set(p.x, 0.1, p.z - grid.rowSpacing * 0.75);
  scene.add(tag);
}

// ---------- โต๊ะ (ใช้ InstancedMesh ให้โต๊ะเป็นร้อยตัวยังลื่นบนมือถือ) ----------
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const seatGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.45, 16).translate(0, 0.225, 0);
const topMat = new THREE.MeshStandardMaterial({ roughness: 0.55 }); // สีแต่ละโต๊ะมาจาก instance color
const seatMat = new THREE.MeshStandardMaterial({ color: COLOR.seat, roughness: 0.5 });
const metalMat = new THREE.MeshStandardMaterial({ color: COLOR.metal, metalness: 0.4, roughness: 0.4 });
const hitMat = new THREE.MeshBasicMaterial({ visible: false });

const tablesGroup = new THREE.Group();
scene.add(tablesGroup);
const people = createPeople(scene, grid, TYPES);
const tableById = new Map();
let tableList = [];
let topsMesh;
let hitMesh;

function buildTables() {
  for (const child of [...tablesGroup.children]) {
    tablesGroup.remove(child);
    if (child.isInstancedMesh) child.dispose();
  }
  tableById.clear();
  hoverId = null;

  tableList = layout.tables.map((t, index) => ({ ...cellPos(t.col, t.row), ...t, id: tableId(t), index }));
  const seatCount = tableList.reduce((sum, t) => sum + (TYPES[t.type] ?? TYPES.long6).seats.length, 0);

  topsMesh = new THREE.InstancedMesh(unitBox, topMat, tableList.length);
  hitMesh = new THREE.InstancedMesh(unitBox, hitMat, tableList.length);
  const legsMesh = new THREE.InstancedMesh(unitBox, metalMat, tableList.length * 2);
  const seatsMesh = new THREE.InstancedMesh(seatGeo, seatMat, seatCount);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let seatIndex = 0;

  for (const t of tableList) {
    const type = TYPES[t.type] ?? TYPES.long6;
    const place = (dx, dz) => offset.set(dx, 0, dz).applyQuaternion(q).add(pos.set(t.x, 0, t.z));
    q.setFromAxisAngle(up, THREE.MathUtils.degToRad(t.rot ?? 0));

    topsMesh.setMatrixAt(t.index, m.compose(pos.set(t.x, 0.76, t.z), q, scale.set(type.w, 0.08, type.d)));
    // กล่องล่องหนที่ใหญ่กว่าโต๊ะ ให้แตะบนมือถือได้ง่าย
    hitMesh.setMatrixAt(t.index, m.compose(pos.set(t.x, 0.6, t.z), q, scale.set(type.w + 0.6, 1.2, type.d + 1.3)));
    [-1, 1].forEach((side, k) => {
      const p = place(side * (type.w / 2 - 0.15), 0).setY(0.36);
      legsMesh.setMatrixAt(t.index * 2 + k, m.compose(p, q, scale.set(0.06, 0.72, type.d * 0.8)));
    });
    for (const [sx, sz] of type.seats) {
      seatsMesh.setMatrixAt(seatIndex++, m.compose(place(sx, sz).clone(), q, scale.set(1, 1, 1)));
    }

    t.tag = label(t.id, 'tag');
    t.tag.position.set(t.x, 1.15, t.z);
    tablesGroup.add(t.tag);
    tableById.set(t.id, t);
  }

  for (const mesh of [topsMesh, legsMesh, seatsMesh, hitMesh]) {
    mesh.castShadow = mesh.receiveShadow = mesh !== hitMesh;
    mesh.frustumCulled = false;
    tablesGroup.add(mesh);
  }
  for (const t of tableList) paint(t.id);
  people.seat(tableList, selectedId);
}

// ---------- ป้ายลอยเหนือโต๊ะที่เลือก ----------
// ก้านบางๆ จากโต๊ะขึ้นไปหาป้าย ป้ายอยู่สูงเหนือโต๊ะ จึงไม่บังตัวโต๊ะ
const CALLOUT_Y = 2.9;
const pinMat = new THREE.MeshStandardMaterial({ color: COLOR.pin, emissive: COLOR.pin, emissiveIntensity: 0.3 });
const pin = new THREE.Group();
const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 8).translate(0, 0.5, 0), pinMat);
stem.position.y = 0.82;
const pinDot = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10), pinMat);
pinDot.position.y = 0.84;
pin.add(stem, pinDot);

const calloutEl = document.createElement('div');
calloutEl.className = 'callout';
calloutEl.innerHTML = '<div class="bubble"><span class="callout-dot"></span><span class="callout-text"></span></div>';
const callout = new CSS2DObject(calloutEl);
callout.position.y = CALLOUT_Y;
pin.add(callout);

const ring = new THREE.Mesh(
  new THREE.RingGeometry(1.5, 1.7, 64),
  new THREE.MeshBasicMaterial({ color: COLOR.pin, transparent: true, side: THREE.DoubleSide }),
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = 0.02;

const marker = new THREE.Group();
marker.add(pin, ring);
marker.visible = false;
scene.add(marker);

// ---------- เส้นนำทางจากประตูทางเข้าไปถึงโต๊ะ ----------
// เดินเข้าประตู → ทางเดินหน้าแถวที่ 1 → ทางเดินข้างแถวของโต๊ะ (ช่องระหว่างหัวโต๊ะ) → ถึงหัวโต๊ะ
const doors = layout.landmarks.filter((l) => l.kind === 'door');
const mainDoor = doors.find((l) => /ทางเข้า/.test(l.label ?? '')) ?? doors[0];
// ประตูทางเข้าคู่: เริ่มเดินจากบานที่ใกล้โต๊ะที่สุด
const entranceDoors = mainDoor
  ? doors.filter((d) => Math.abs(d.z - mainDoor.z) < 0.5 && Math.abs(d.x - mainDoor.x) < 6)
  : [];

const GUIDE_BLUE = 0x007aff;
const GUIDE_WIDTH = 0.5;
const GUIDE_Y = 0.04;

const chevrons = (() => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#007aff';
  g.fillRect(0, 0, 128, 64);
  g.strokeStyle = '#fff';
  g.lineWidth = 9;
  g.lineCap = g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(50, 17);
  g.lineTo(76, 32);
  g.lineTo(50, 47);
  g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
})();
const guideMat = new THREE.MeshBasicMaterial({ map: chevrons, side: THREE.DoubleSide });
const guideJointMat = new THREE.MeshBasicMaterial({ color: GUIDE_BLUE });
const guideStartMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const guide = new THREE.Group();
scene.add(guide);

function guidePoints(t) {
  const entrance = entranceDoors.reduce((a, b) => (Math.abs(a.x - t.x) <= Math.abs(b.x - t.x) ? a : b));
  const inward = Math.sign(grid.z0 - entrance.z) || 1;
  const front = grid.z0 - inward * grid.rowSpacing * 0.8;
  const type = TYPES[t.type] ?? TYPES.long6;
  const half = (t.rot ? type.d : type.w) / 2;
  const sides = [t.x - grid.colSpacing / 2, t.x + grid.colSpacing / 2];
  const aisle = sides.reduce((a, b) => (Math.abs(a - entrance.x) <= Math.abs(b - entrance.x) ? a : b));
  const end = t.x + Math.sign(aisle - t.x) * (half + 0.3);
  const pts = [
    [entrance.x, entrance.z],
    [entrance.x, front],
    [aisle, front],
    [aisle, t.z],
    [end, t.z],
  ].map(([x, z]) => new THREE.Vector2(x, z));
  return pts.filter((p, i) => i === 0 || p.distanceTo(pts[i - 1]) > 0.05);
}

function setGuide(t) {
  for (const child of [...guide.children]) {
    guide.remove(child);
    child.geometry.dispose();
  }
  if (!t || !entranceDoors.length) return;

  const pts = guidePoints(t);
  const pos = [];
  const uv = [];
  let u = 0;
  const hw = GUIDE_WIDTH / 2;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = a.distanceTo(b);
    const n = new THREE.Vector2(-(b.y - a.y), b.x - a.x).normalize().multiplyScalar(hw);
    const quad = [[a, n, u, 1], [a, n.clone().negate(), u, 0], [b, n, u + len, 1], [b, n.clone().negate(), u + len, 0]]
      .map(([p, o, uu, vv]) => ({ x: p.x + o.x, z: p.y + o.y, uu, vv }));
    for (const k of [0, 1, 2, 2, 1, 3]) {
      pos.push(quad[k].x, GUIDE_Y, quad[k].z);
      uv.push(quad[k].uu, quad[k].vv);
    }
    u += len;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  guide.add(new THREE.Mesh(geo, guideMat));

  // มุมเลี้ยวมน + จุดเริ่มที่ประตู
  const disc = (r, mat, p, y) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(p.x, y, p.y);
    guide.add(m);
  };
  pts.slice(1, -1).forEach((p) => disc(hw, guideJointMat, p, GUIDE_Y - 0.005));
  disc(hw * 1.6, guideJointMat, pts[0], GUIDE_Y + 0.004);
  disc(hw * 0.7, guideStartMat, pts[0], GUIDE_Y + 0.008);
}

// ---------- กล้องบินไปหาโต๊ะ ----------
let flight = null;
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function flyTo(pos, target, ms = 1000) {
  flight = { fromPos: camera.position.clone(), fromTarget: controls.target.clone(), pos, target, start: performance.now(), ms };
}

function flyToTable(t) {
  const target = new THREE.Vector3(t.x, 0.7, t.z);
  flyTo(target.clone().add(new THREE.Vector3(0, 14, VIEW * 15)), target);
}

// มุมกว้างพอให้เห็นทั้งเส้นทางจากประตูถึงโต๊ะ
function flyToRoute(t) {
  if (!entranceDoors.length) return flyToTable(t);
  const door = guidePoints(t)[0];
  // เล็งค่อนไปทางโต๊ะ เผื่อที่ให้ป้ายลอยเหนือโต๊ะไม่ชนหัวจอ
  const target = new THREE.Vector3(door.x + (t.x - door.x) * 0.6, 0.5, door.y + (t.z - door.y) * 0.6);
  const d = Math.max(13, Math.hypot(door.x - t.x, door.y - t.z) * 1.3);
  flyTo(target.clone().add(new THREE.Vector3(0, d, VIEW * d * 0.7)), target, 1200);
}

controls.addEventListener('start', () => { flight = null; });

// ---------- การเลือกโต๊ะ ----------
let mode = 'owner';
let selectedId = null;
let hoverId = null;
const tmpColor = new THREE.Color();

function paint(id) {
  const t = tableById.get(id);
  if (!t) return;
  const on = id === selectedId || highlighted.has(id);
  const color = on ? COLOR.tableSelected : id === hoverId ? COLOR.tableHover : COLOR.table;
  topsMesh.setColorAt(t.index, tmpColor.set(color));
  topsMesh.instanceColor.needsUpdate = true;
}

// ไฮไลต์หลายโต๊ะพร้อมกัน (แอดมินเลือกทั้งแถว)
let highlighted = new Set();
function setHighlight(ids) {
  const prev = highlighted;
  highlighted = new Set(ids);
  for (const id of new Set([...prev, ...highlighted])) paint(id);
}

function setSelected(id) {
  const prev = selectedId;
  selectedId = id;
  if (prev) paint(prev);
  const t = tableById.get(id);
  marker.visible = !!t;
  if (t) {
    paint(id);
    marker.position.set(t.x, 0, t.z);
    const who = mode === 'friend' && shared.name ? `${shared.name} · ` : '';
    calloutEl.querySelector('.callout-text').textContent = `${who}โต๊ะ ${id}`;
  }
  setGuide(mode === 'admin' ? null : t);
  if (prev !== id && mode !== 'admin') people.seat(tableList, id);
}

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();

function aim(e) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}

function tableAt(e) {
  aim(e);
  const hit = raycaster.intersectObject(hitMesh, false)[0];
  return hit ? tableList[hit.instanceId].id : null;
}

function cellAt(e) {
  aim(e);
  const point = raycaster.intersectObject(floor, false)[0]?.point;
  if (!point) return null;
  const col = Math.round((point.x - grid.x0) / grid.colSpacing) + 1;
  const row = Math.round((point.z - grid.z0) / grid.rowSpacing) + 1;
  if (col < 1 || row < 1 || col > grid.cols || row > grid.rows) return null;
  return { col, row };
}

// แยก "แตะ" ออกจาก "ลากหมุนกล้อง" ด้วยระยะที่นิ้วขยับ
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 6) return;
  if (mode === 'owner') {
    const id = tableAt(e);
    if (id) ownerPick(id);
    else if (sheetPending) cancelPick(); // แตะที่ว่างตอนยังไม่กดจอง = ยกเลิก
    else if (panelOpen) setPanel(false); // แตะที่ว่าง = ย่อการ์ดเหลือแค่หมุด
  } else if (mode === 'admin') {
    const id = tableAt(e);
    adminSel = id ? tableById.get(id) : cellAt(e);
    renderAdmin();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || mode === 'friend' || e.buttons) return;
  const id = tableAt(e);
  if (id === hoverId) return;
  const prev = hoverId;
  hoverId = id;
  if (prev) paint(prev);
  if (id) paint(id);
  canvas.style.cursor = id || mode === 'admin' ? 'pointer' : '';
});

// ---------- แผงด้านล่าง: เปิดเป็นการ์ด หรือย่อเหลือป้ายเล็กให้เห็นหมุดเต็มจอ ----------
let panelOpen = false;
let pillText = '';
let collapseTimer;

function setPanel(open) {
  clearTimeout(collapseTimer);
  panelOpen = open;
  const active = mode === 'friend' || (mode === 'owner' && !!selectedId);
  $('sheet').hidden = !(mode === 'owner' && active && open);
  $('banner').hidden = !(mode === 'friend' && open);
  $('pill').hidden = !active || open;
  $('pill-text').textContent = mode === 'owner' ? `โต๊ะ ${selectedId} · แตะเพื่อแชร์` : pillText;
}

$('pill').addEventListener('click', () => setPanel(true));
$('sheet-close').addEventListener('click', () => (sheetPending ? cancelPick() : setPanel(false)));
$('banner-close').addEventListener('click', () => setPanel(false));

// เริ่มลาก/ซูมแผนที่ = ย่อการ์ดเอง และซ่อนคำแนะนำ
controls.addEventListener('start', () => {
  $('hint').hidden = true;
  // ยังไม่ได้กดจอง ปล่อยการ์ดค้างไว้ หมุนดูรอบๆ ก่อนตัดสินใจได้
  if (panelOpen && mode !== 'admin' && !sheetPending) setPanel(false);
});

// ---------- ฝั่งเรา: เลือกแล้วแชร์ ----------
const nameInput = $('name');
nameInput.value = store.get('torim:name') ?? '';
nameInput.addEventListener('input', () => store.set('torim:name', nameInput.value.trim()));

// แตะโต๊ะ = ดูตัวอย่างก่อน (หมุด + เส้นนำทาง) ต้องกด "จองโต๊ะนี้" ถึงจะจำไว้และแชร์ได้
let confirmedId = null;
let sheetPending = false;

function fillSheet(id, pending) {
  sheetPending = pending;
  const t = tableById.get(id);
  $('sel-id').textContent = id;
  $('sel-sub').textContent = pending && confirmedId
    ? `เปลี่ยนจากโต๊ะ ${confirmedId} ที่จองไว้`
    : `${TYPES[t.type]?.name ?? ''} · ${describe(id)}`;
  $('sheet-confirm').hidden = !pending;
  $('sheet-share').hidden = pending;
}

function ownerPick(id) {
  if (!id) return;
  setSelected(id);
  fillSheet(id, id !== confirmedId);
  setPanel(true);
}

function confirmPick() {
  confirmedId = selectedId;
  store.set('torim:pick', { id: confirmedId, date: today() });
  fillSheet(confirmedId, false);
  toast(`จองโต๊ะ ${confirmedId} แล้ว ✓`);
}

function cancelPick() {
  sheetPending = false;
  setSelected(confirmedId);
  if (confirmedId) fillSheet(confirmedId, false);
  setPanel(false);
}

$('pick-ok').addEventListener('click', confirmPick);
$('pick-cancel').addEventListener('click', cancelPick);

function enterOwner() {
  mode = 'owner';
  history.replaceState(null, '', location.pathname);
  $('adm-enter').hidden = false; // ปุ่มเข้าแอดมินโชว์เฉพาะหน้าปกติ ไม่โชว์ในลิงก์ที่เพื่อนเปิด
  $('hint').hidden = false;
  $('hint').textContent = 'แตะโต๊ะที่จะนั่ง กดจอง แล้วแชร์ให้เพื่อน';
  // จำโต๊ะที่จองไว้ของวันนี้ เปิดเว็บใหม่ก็ยังปักหมุดอยู่ (แสดงเป็นป้ายย่อ)
  const last = store.get('torim:pick');
  confirmedId = last?.date === today() && tableById.has(last.id) ? last.id : null;
  cancelPick();
  flyTo(HOME.pos.clone(), HOME.target.clone());
}

$('clear').addEventListener('click', () => {
  confirmedId = null;
  store.set('torim:pick', null);
  cancelPick();
});

let toastTimer;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
}

function shareUrl() {
  const name = nameInput.value.trim();
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('t', selectedId);
  url.searchParams.set('d', today());
  if (name) url.searchParams.set('n', name);
  return url;
}

// เปิดลิงก์เดียวกับที่ส่งให้เพื่อน ดูว่าเพื่อนจะเห็นอะไร (มีปุ่มกลับ)
$('preview').addEventListener('click', () => {
  const url = shareUrl();
  url.searchParams.set('preview', '1');
  location.href = url.href;
});

$('share').addEventListener('click', async () => {
  const name = nameInput.value.trim();
  const url = shareUrl();
  const text = `${name || 'เรา'}นั่งโต๊ะ ${selectedId} ที่โรงอาหาร 📍`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'โต๊ะวันนี้', text, url: url.href });
      setPanel(false);
      return;
    } catch (err) {
      if (err.name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url.href}`);
    toast('คัดลอกลิงก์แล้ว ส่งให้เพื่อนได้เลย');
  } catch {
    window.prompt('คัดลอกลิงก์นี้ส่งให้เพื่อน', url.href);
  }
  setPanel(false);
});

// ---------- ฝั่งเพื่อน: เปิดจากลิงก์ ----------
const shared = {
  id: params.get('t'),
  date: /^\d{4}-\d{2}-\d{2}$/.test(params.get('d') ?? '') ? params.get('d') : null,
  name: (params.get('n') ?? '').trim().slice(0, 30),
};

function enterFriend() {
  mode = 'friend';
  $('hint').textContent = 'เดินตามลูกศรสีฟ้าจากประตูทางเข้า';
  if (params.has('preview')) {
    $('hint').textContent = '👀 ตัวอย่าง: นี่คือหน้าที่เพื่อนจะเห็น';
    $('own').textContent = '← กลับ';
  }
  $('ban-id').textContent = shared.id;

  const t = tableById.get(shared.id);
  if (!t) {
    $('ban-who').textContent = 'ไม่พบโต๊ะนี้ในผัง';
    $('focus').hidden = true;
    pillText = `ไม่พบโต๊ะ ${shared.id}`;
    setPanel(true);
    return;
  }
  const who = shared.name || 'เพื่อน';
  const stale = !!shared.date && shared.date !== today();
  $('ban-who').textContent = `${who}นั่งที่`;
  $('ban-sub').textContent = describe(t.id);
  if (stale) {
    $('ban-warn').textContent = `ลิงก์นี้ส่งมาเมื่อ ${thaiDate(shared.date)} อาจไม่ใช่โต๊ะของวันนี้`;
    $('ban-warn').hidden = false;
  }
  pillText = `${who} · โต๊ะ ${t.id}${stale ? ' ⚠️' : ''}`;
  setSelected(t.id);
  setPanel(true);
  setTimeout(() => flyToRoute(t), 500);
  // ดูชื่อโต๊ะแล้ว ย่อการ์ดเองให้เห็นหมุดชัดๆ (ถ้าลิงก์เก่า ปล่อยค้างไว้ให้อ่านคำเตือน)
  if (!stale) collapseTimer = setTimeout(() => setPanel(false), 4000);
}

$('focus').addEventListener('click', () => {
  const t = tableById.get(selectedId);
  if (t) flyToTable(t);
});
$('own').addEventListener('click', enterOwner);

// ---------- โหมดแอดมิน (?admin): เปลี่ยนแบบโต๊ะ เพิ่ม/ลบ แล้วดาวน์โหลด layout.json ----------
let adminSel = null; // { col, row } ของโต๊ะหรือช่องว่างที่แตะ
let adminScope = 'one'; // 'one' = โต๊ะนี้, 'col' = ทั้งแถว (ตามเลขหัวแถว), 'row' = ตัวที่ N ของทุกแถว

const signature = (tables) => JSON.stringify(
  tables.map((t) => [t.row, t.col, t.type, t.rot ?? 0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]),
);

// ช่องทั้งหมดที่กำลังแก้ ตามขอบเขตที่เลือก
function scopeCells() {
  if (!adminSel) return [];
  const { col, row } = adminSel;
  if (adminScope === 'col') return Array.from({ length: grid.rows }, (_, i) => ({ col, row: i + 1 }));
  if (adminScope === 'row') return Array.from({ length: grid.cols }, (_, i) => ({ col: i + 1, row }));
  return [{ col, row }];
}
const scopeTables = () => scopeCells().map((c) => findTable(c.col, c.row)).filter(Boolean);
const scopeEmpty = () => scopeCells().filter((c) => !findTable(c.col, c.row));
const isSquare = (t) => TYPES[t.type].w === TYPES[t.type].d;

for (const btn of $('adm-scope').children) {
  btn.addEventListener('click', () => {
    adminScope = btn.dataset.scope;
    renderAdmin();
  });
}

const typeButtons = Object.keys(TYPES).map((type) => {
  const btn = document.createElement('button');
  btn.className = 'ghost';
  btn.dataset.type = type;
  btn.addEventListener('click', () => {
    const tables = scopeTables();
    // มีโต๊ะอยู่แล้ว = เปลี่ยนแบบทุกตัว, ว่างทั้งหมด = วางโต๊ะใหม่ทุกช่อง
    if (tables.length) {
      for (const t of tables) {
        t.type = type;
        if (isSquare(t)) delete t.rot;
      }
    } else {
      for (const c of scopeCells()) layout.tables.push({ ...c, type });
    }
    commit();
  });
  $('adm-types').appendChild(btn);
  return btn;
});

$('adm-fill').addEventListener('click', () => {
  const type = scopeTables()[0]?.type ?? 'long6';
  for (const c of scopeEmpty()) layout.tables.push({ ...c, type });
  commit();
});

// ทุกการแก้เป็นแค่ "ดูตัวอย่าง" ก่อน ต้องกดตกลงถึงจะบันทึก (saved = สถานะล่าสุดที่กดตกลงแล้ว)
let saved = structuredClone(layout.tables);
const isPending = () => signature(layout.tables) !== signature(saved);

function commit() {
  buildTables();
  renderAdmin();
}

// ---------- บันทึกขึ้นเว็บจริง: ส่งไป /api/save-layout ซึ่งจะ commit layout.json ขึ้น GitHub ----------
const PASS_KEY = 'torim:adminPass'; // จำรหัสไว้แค่จนปิดแท็บ (sessionStorage)
const session = {
  get() { try { return sessionStorage.getItem(PASS_KEY); } catch { return null; } },
  set(v) { try { if (v) sessionStorage.setItem(PASS_KEY, v); else sessionStorage.removeItem(PASS_KEY); } catch {} },
};

function keepLocally(message) {
  saved = structuredClone(layout.tables);
  store.set('torim:draft', saved);
  adminSel = null;
  renderAdmin();
  toast(message);
}

function askPassword(message) {
  $('adm-auth').hidden = false;
  $('adm-ok').hidden = true; // ใช้ปุ่ม "บันทึก" ข้างช่องรหัสแทน
  $('adm-status').textContent = message;
  $('adm-pass').focus();
}

let saving = false;
async function publish(password = session.get()) {
  if (saving) return;
  if (!password) return askPassword('ใส่รหัสแอดมิน แล้วกดบันทึก');

  saving = true;
  const buttons = [$('adm-ok'), $('adm-send'), $('adm-push')];
  for (const b of buttons) b.disabled = true;
  $('adm-status').textContent = 'กำลังบันทึกขึ้นเว็บ…';

  let res = null;
  try {
    res = await fetch('api/save-layout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password, tables: layout.tables }),
    });
  } catch {}
  const data = res ? await res.json().catch(() => ({})) : {};
  saving = false;
  for (const b of buttons) b.disabled = false;

  // ยังไม่มีระบบบันทึกออนไลน์ (เปิดในเครื่อง / ยังไม่ได้ตั้งค่าบน Vercel) — เก็บในเครื่องไปก่อน
  if (!res || [404, 405, 501].includes(res.status)) return keepLocally('บันทึกในเครื่องแล้ว (ระบบบันทึกขึ้นเว็บใช้ได้เมื่ออยู่บน Vercel)');
  if (res.status === 503) return keepLocally('บันทึกในเครื่องแล้ว — ยังไม่ได้ตั้ง GITHUB_TOKEN / ADMIN_PASSWORD บน Vercel');
  if (res.status === 401) {
    session.set(null);
    $('adm-pass').value = '';
    return askPassword('รหัสไม่ถูกต้อง ลองใหม่อีกครั้ง');
  }
  if (!res.ok) {
    $('adm-status').textContent = `บันทึกไม่สำเร็จ (${data.error ?? res.status}) ลองใหม่อีกครั้ง`;
    return;
  }

  session.set(password);
  layout.tables = data.tables;
  published.tables = structuredClone(data.tables);
  saved = structuredClone(data.tables);
  store.set('torim:draft', null);
  $('adm-auth').hidden = true;
  $('adm-pass').value = '';
  adminSel = null;
  buildTables();
  renderAdmin();
  toast('บันทึกขึ้นเว็บแล้ว ✓ เพื่อนจะเห็นผังใหม่ในราว 1 นาที');
}

$('adm-ok').addEventListener('click', () => publish());
$('adm-push').addEventListener('click', () => publish());
$('adm-send').addEventListener('click', () => publish($('adm-pass').value));
$('adm-pass').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') publish($('adm-pass').value);
});

$('adm-cancel').addEventListener('click', () => {
  layout.tables = structuredClone(saved);
  $('adm-auth').hidden = true;
  buildTables();
  renderAdmin();
});

function renderAdmin() {
  $('adm-pick').hidden = !!adminSel;
  $('adm-cell').hidden = !adminSel;
  setSelected(null);
  setHighlight([]);

  if (adminSel) {
    const { col, row } = adminSel;
    const tables = scopeTables();
    const empty = scopeEmpty();
    const n = tables.length;

    for (const btn of $('adm-scope').children) btn.classList.toggle('on', btn.dataset.scope === adminScope);
    $('adm-scope').children[1].textContent = `ทั้งแถว ${col}`;
    $('adm-scope').children[2].textContent = `ตัวที่ ${row} ทุกแถว`;

    if (adminScope === 'one') {
      $('adm-title').textContent = n ? `โต๊ะ ${tableId(adminSel)}` : `ช่อง ${tableId(adminSel)} (ว่าง)`;
      $('adm-sub').textContent = n ? TYPES[tables[0].type].name : 'เลือกแบบโต๊ะเพื่อวางลงช่องนี้';
    } else {
      $('adm-title').textContent = adminScope === 'col' ? `แถว ${col}` : `ตัวที่ ${row} ของทุกแถว`;
      $('adm-sub').textContent = `${n} โต๊ะ${empty.length ? ` · ช่องว่าง ${empty.length}` : ''} · กดทีเดียวแก้ทั้งหมด`;
    }

    for (const btn of typeButtons) {
      btn.textContent = `${n ? '' : '+ '}${TYPES[btn.dataset.type].name}`;
      btn.classList.toggle('on', n > 0 && tables.every((t) => t.type === btn.dataset.type));
    }
    $('adm-table-actions').hidden = !n;
    $('adm-rotate').hidden = !tables.some((t) => !isSquare(t));
    $('adm-delete').textContent = n > 1 ? `ลบ ${n} โต๊ะ` : 'ลบโต๊ะ';
    $('adm-fill').hidden = adminScope === 'one' || !n || !empty.length;
    $('adm-fill').textContent = `+ เติมโต๊ะในช่องว่าง ${empty.length} ช่อง`;

    if (adminScope === 'one') {
      const p = cellPos(col, row);
      if (n) setSelected(tableId(adminSel));
      marker.position.set(p.x, 0, p.z);
      marker.visible = true;
    } else {
      setHighlight(tables.map((t) => tableId(t)));
    }
  }

  const pending = isPending();
  $('admin').hidden = false;
  $('adm-confirm').hidden = !pending;
  $('adm-ok').hidden = !$('adm-auth').hidden;
  $('adm-publish').hidden = pending;
  $('adm-close').hidden = pending; // มีของค้างอยู่ ต้องเลือกตกลงหรือยกเลิกก่อน
  if (pending) {
    $('adm-status').textContent = 'ยังไม่ได้บันทึก — กด "ตกลง" เพื่อบันทึกขึ้นเว็บ หรือ "ยกเลิก" เพื่อย้อนกลับ';
    return;
  }

  // ไม่มีอะไรค้าง แต่ผังในเครื่องยังต่างจากบนเว็บ (เคยบันทึกไว้ในเครื่องตอนออฟไลน์)
  const dirty = signature(layout.tables) !== signature(published.tables);
  $('adm-auth').hidden = true;
  $('adm-status').textContent = dirty
    ? 'มีผังที่บันทึกไว้ในเครื่อง แต่ยังไม่ขึ้นเว็บ'
    : 'ตรงกับผังบนเว็บตอนนี้';
  $('adm-push').hidden = !dirty;
  $('adm-download').disabled = !dirty;
  $('adm-reset').disabled = !dirty;
  // ไม่ได้แตะโต๊ะ และไม่มีอะไรค้าง = ซ่อนการ์ดให้เห็นผังเต็มจอ (คำแนะนำอยู่บนหัวแล้ว)
  $('admin').hidden = !adminSel && !dirty;
}

$('adm-close').addEventListener('click', () => { adminSel = null; renderAdmin(); });

$('adm-rotate').addEventListener('click', () => {
  const tables = scopeTables().filter((t) => !isSquare(t));
  const rotate = !tables[0]?.rot; // ยึดตัวแรกเป็นหลัก ให้ทั้งแถวหันเหมือนกัน
  for (const t of tables) {
    if (rotate) t.rot = 90;
    else delete t.rot;
  }
  commit();
});

$('adm-delete').addEventListener('click', () => {
  const doomed = new Set(scopeTables());
  if (doomed.size > 1 && !window.confirm(`ลบ ${doomed.size} โต๊ะ?`)) return;
  layout.tables = layout.tables.filter((t) => !doomed.has(t));
  commit();
});

// ออกจากโหมดแอดมิน: ที่แก้ค้างไว้ยังเก็บในเครื่อง เปิด ?admin ครั้งหน้าก็ทำต่อได้
$('adm-exit').addEventListener('click', () => {
  if (isPending() && !window.confirm('ยังไม่ได้กด "ตกลง" ออกเลยไหม? (ที่แก้ล่าสุดจะหาย)')) return;
  location.href = location.pathname;
});
$('adm-enter').addEventListener('click', () => {
  location.href = `${location.pathname}?admin`;
});

$('adm-reset').addEventListener('click', () => {
  if (!window.confirm('ทิ้งการแก้ไขทั้งหมด แล้วกลับไปใช้ผังที่เผยแพร่อยู่?')) return;
  layout.tables = structuredClone(published.tables);
  saved = structuredClone(published.tables);
  store.set('torim:draft', null);
  buildTables();
  renderAdmin();
});

$('adm-download').addEventListener('click', () => {
  const tables = [...layout.tables].sort((a, b) => a.row - b.row || a.col - b.col);
  const blob = new Blob([toJson({ ...published, tables })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'layout.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

function enterAdmin() {
  mode = 'admin';
  people.setVisible(false); // แก้ผังต้องเห็นโต๊ะชัดๆ
  document.querySelector('.title').textContent = '🛠️ แก้ผังโต๊ะ (แอดมิน)';
  $('hint').textContent = 'แตะโต๊ะเพื่อเปลี่ยนแบบ · แตะช่องว่างเพื่อเพิ่มโต๊ะ';
  $('admin').hidden = false;
  $('adm-exit').hidden = false;
  setPanel(false);
  renderAdmin();
}

// ---------- เริ่ม ----------
buildTables();
if (isAdmin) enterAdmin();
else if (shared.id) enterFriend();
else enterOwner();

function resize() {
  const w = app.clientWidth;
  const h = app.clientHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const time = clock.getElapsedTime();

  if (flight) {
    const k = Math.min(1, (performance.now() - flight.start) / flight.ms);
    const e = ease(k);
    camera.position.lerpVectors(flight.fromPos, flight.pos, e);
    controls.target.lerpVectors(flight.fromTarget, flight.target, e);
    if (k === 1) flight = null;
  }

  // เลขโต๊ะโชว์เฉพาะตัวที่จอง/เลือกอยู่ (และตัวที่เมาส์ชี้บนคอม) ไม่ให้ลายตา
  // เลขโต๊ะทั่วไปโชว์แค่ตัวที่เมาส์ชี้ (บนคอม) ส่วนตัวที่เลือกใช้ป้ายลอยแทน
  for (const t of tableList) t.tag.visible = t.id === hoverId && t.id !== selectedId;
  callout.visible = marker.visible && !!selectedId;

  people.update(time);
  chevrons.offset.x = -((time * 1.2) % 1); // ลูกศรไหลจากประตูไปหาโต๊ะ
  const bob = Math.sin(time * 2.2) * 0.12;
  callout.position.y = CALLOUT_Y + bob;
  stem.scale.y = CALLOUT_Y + bob - 0.95;
  const pulse = (time % 1.5) / 1.5;
  ring.scale.setScalar(1 + pulse * 0.35);
  ring.material.opacity = 1 - pulse;

  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

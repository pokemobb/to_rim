import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildScenery, LABEL_HEIGHT } from './scenery.js';
import { toJson } from './layout-format.js';
import { createPeople } from './people.js';
import { CHARACTERS, paintCharacters } from './characters.js';
import { icon, paintIcons } from './icons.js';

// แบบโต๊ะที่แอดมินเลือกได้ (หน่วยเมตร) — seats คือตำแหน่งเก้าอี้เทียบกับกลางโต๊ะ
const TYPES = {
  long6: {
    name: 'โต๊ะยาว 6 ที่นั่ง',
    w: 2.1,
    d: 0.85,
    seats: [[-0.7, -0.72], [0, -0.72], [0.7, -0.72], [-0.7, 0.72], [0, 0.72], [0.7, 0.72]],
  },
  // คงชื่อ square4 ไว้ให้ตรงกับ layout.json เดิม แต่เป็นโต๊ะจัตุรัสนั่ง 2 คนหัวท้าย (กด "หมุน 90°" เพื่อสลับด้านได้)
  square4: {
    name: 'โต๊ะจัตุรัส 2 ที่นั่ง',
    w: 0.95,
    d: 0.95,
    seats: [[0, -0.77], [0, 0.77]],
  },
};

const COLOR = {
  // แบบ Apple Maps: โต๊ะสีเทาเข้มบนพื้นขาว ตัดกันชัด และโต๊ะที่เลือกเป็นแดงระบบสีเดียวในแผนที่
  table: 0x3a3a3c,
  tableHover: 0x007aff, // เมาส์ชี้ (บนคอม): โต๊ะเปลี่ยนเป็นสีฟ้าแทนการขึ้นเลขโต๊ะ ไม่บังแมว
  tableSelected: 0xff3b30,
  tableFaded: 0xc7c7cc, // โต๊ะอื่นตอนโฟกัสโต๊ะที่จอง: เทาอ่อน ยังแยกจากพื้นขาวได้
  seat: 0xd1d1d6, // เก้าอี้เทาอ่อน ไม่แย่งสายตาจากโต๊ะ
  metal: 0x8e8e93,
  pin: 0xff3b30,
};

const VIEW = -1; // มองจากฝั่ง z ติดลบ = ฝั่งประตูคู่ด้านบนที่เดินเข้ามา (เปลี่ยนเป็น 1 ถ้าจะมองจากฝั่งตรงข้าม)

const $ = (id) => document.getElementById(id);
const clone = (data) => JSON.parse(JSON.stringify(data)); // structuredClone ไม่มีใน iPhone รุ่นเก่า
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
const layout = clone(published);
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
const describeShort = (id) => {
  const [col, row] = id.split('-');
  return `แถว ${col} · ตัวที่ ${row}`;
};

// ---------- ฉาก ----------
const app = $('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); // โปร่งใส ให้เห็นลายซูชิด้านหลัง
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
app.appendChild(renderer.domElement);
const canvas = renderer.domElement;

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.className = 'labels';
app.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();

const roomW = room.maxX - room.minX;
const roomD = room.maxZ - room.minZ;
const center = new THREE.Vector3((room.minX + room.maxX) / 2, 0, (room.minZ + room.maxZ) / 2);
const span = Math.max(roomW, roomD);
// มุมกล้องตายตัว: มองจากด้านบน เอียงมาทางประตูทางเข้า 40° (ลากได้แค่เลื่อนกับซูม ไม่หมุน)
const TILT = THREE.MathUtils.degToRad(40);
const VIEW_DIR = new THREE.Vector3(0, Math.cos(TILT), VIEW * Math.sin(TILT));
const viewFrom = (target, distance) => target.clone().addScaledVector(VIEW_DIR, distance);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);

// มุมภาพรวม: ถอยจนเห็นโรงอาหารทั้งห้อง ในช่องระหว่างการ์ดด้านบนกับแผงด้านล่าง (คำนวณตามขนาดจอทุกครั้ง)
const fitCam = new THREE.PerspectiveCamera();
const roomCorners = [[room.minX, room.minZ], [room.maxX, room.minZ], [room.minX, room.maxZ], [room.maxX, room.maxZ]]
  .map(([x, z]) => new THREE.Vector3(x, 0, z));
const projected = new THREE.Vector3();
function screenBounds(target, distance) {
  fitCam.position.copy(viewFrom(target, distance));
  fitCam.lookAt(target);
  fitCam.updateMatrixWorld();
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const c of roomCorners) {
    projected.copy(c).project(fitCam);
    b.x0 = Math.min(b.x0, projected.x); b.x1 = Math.max(b.x1, projected.x);
    b.y0 = Math.min(b.y0, projected.y); b.y1 = Math.max(b.y1, projected.y);
  }
  return b;
}
// ช่องบนจอที่ให้ห้องไปถึงได้ (พิกัด -1..1 ของพื้นที่แผนที่เหนือแถบด้านล่าง) ด้านบนเว้นให้การ์ดชื่อเว็บ
function fitWindow() {
  fitCam.copy(camera);
  fitCam.aspect = (app.clientWidth || innerWidth) / (app.clientHeight || innerHeight);
  fitCam.updateProjectionMatrix();
  const h = app.clientHeight || innerHeight;
  return { Y0: -0.94, Y1: 1 - (2 * 74) / h, X: 0.97 };
}
// ระยะกล้องที่เล็กที่สุดที่ยังเห็นทั้งห้อง (checkWidth=false = สนใจแค่แนวลึก)
function fitDistance(win, checkWidth) {
  let lo = 5, hi = 500;
  for (let i = 0; i < 30; i++) {
    const d = (lo + hi) / 2;
    const b = screenBounds(center, d);
    const ok = (!checkWidth || b.x1 - b.x0 <= 2 * win.X) && b.y1 - b.y0 <= win.Y1 - win.Y0;
    if (ok) hi = d; else lo = d;
  }
  return hi;
}
// เลื่อนจุดมองตามแนวลึก ให้ห้องอยู่กลางช่องที่ว่าง
function centerTarget(win, d) {
  const want = (win.Y0 + win.Y1) / 2;
  const mid = (dz) => { const b = screenBounds(center.clone().setZ(center.z + dz), d); return (b.y0 + b.y1) / 2 - want; };
  let a = -span, z = span;
  const rising = mid(z) > mid(a);
  for (let i = 0; i < 30; i++) {
    const m = (a + z) / 2;
    if ((mid(m) > 0) === rising) z = m; else a = m;
  }
  return center.clone().setZ(center.z + (a + z) / 2);
}
// ล็อกมุมกล้อง: ระยะซูมคงที่ และเลื่อนได้แค่ซ้าย/ขวา ไม่ขึ้นลง ไม่ซูม
const lock = { d: 30, z: center.z, half: 10 };
// ซูมครึ่งหนึ่งของภาพรวม แต่ต้องเห็นห้องครบตามแนวลึกเสมอ (เลื่อนซ้าย/ขวาดูส่วนที่เหลือ)
function updateLock() {
  const win = fitWindow();
  const all = fitDistance(win, true);
  lock.d = Math.max(all * 0.5, fitDistance(win, false));
  lock.z = centerTarget(win, lock.d).z;
  const perMeter = Math.tan(THREE.MathUtils.degToRad(fitCam.fov / 2)) * fitCam.aspect; // ครึ่งความกว้างบนพื้น ต่อระยะ 1 เมตร
  lock.half = lock.d * perMeter;
  lock.perMeter = perMeter;
}
// เลื่อนได้ถึงแค่ขอบห้องพอดีจอ (half = ครึ่งความกว้างที่เห็นบนพื้น ตามระยะซูมตอนนั้น)
const clampX = (x, half = lock.half) => (half * 2 >= roomW
  ? center.x
  : THREE.MathUtils.clamp(x, room.minX + half - 1, room.maxX - half + 1));
function sideView(x = center.x) {
  const target = new THREE.Vector3(clampX(x), 0, lock.z);
  return { pos: viewFrom(target, lock.d), target };
}
updateLock();
const flyHome = (ms) => { const v = sideView(); flyTo(v.pos, v.target, ms); };

const HOME = sideView();
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.enableRotate = false;
controls.minPolarAngle = controls.maxPolarAngle = TILT;
controls.screenSpacePanning = false; // เลื่อนไปตามพื้น ไม่ใช่ตามจอ
// ถ่างสองนิ้ว / ลูกกลิ้งเมาส์ ซูมเข้าไปดูแมวใกล้ๆ ได้ราว 3 เท่า ซูมออกได้ไม่เกินมุมปกติ
const MAX_ZOOM = 3;
controls.enableZoom = true;
controls.zoomToCursor = true; // ซูมเข้าหาตรงที่นิ้ว/เมาส์ชี้
controls.zoomSpeed = 1.2;
const syncZoomLimits = () => {
  controls.maxDistance = lock.d;
  controls.minDistance = lock.d / MAX_ZOOM;
};
syncZoomLimits();
controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
let zoomLevel = 1; // 1 = มุมปกติ, 3 = ใกล้สุด

// มุมปกติเลื่อนได้แค่ซ้าย/ขวา ซูมเข้าแล้วเลื่อนขึ้นลงได้ด้วย แต่ไม่หลุดขอบห้อง
const panShift = new THREE.Vector3();
function keepInRoom() {
  const t = controls.target;
  const dist = camera.position.distanceTo(t);
  zoomLevel = THREE.MathUtils.clamp(lock.d / dist, 1, MAX_ZOOM);
  const slack = (roomD / 2) * (1 - 1 / zoomLevel);
  const z = THREE.MathUtils.clamp(t.z, lock.z - slack, lock.z + slack);
  panShift.set(clampX(t.x, dist * lock.perMeter) - t.x, -t.y, z - t.z);
  if (panShift.lengthSq() === 0) return;
  t.add(panShift);
  camera.position.add(panShift);
}

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
// เก้าอี้พลาสติกมีพนักพิง: ด้าน +z คือด้านที่หันเข้าหาโต๊ะ
const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const seatGeo = mergeGeometries([
  box(0.42, 0.035, 0.4, 0, 0.45, 0), // ที่นั่ง
  box(0.4, 0.3, 0.03, 0, 0.66, -0.19), // พนักพิง
  box(0.035, 0.32, 0.035, -0.18, 0.62, -0.19), // เสาพนัก
  box(0.035, 0.32, 0.035, 0.18, 0.62, -0.19),
  ...[[-0.18, -0.17], [0.18, -0.17], [-0.18, 0.17], [0.18, 0.17]].map(([x, z]) => box(0.035, 0.45, 0.035, x, 0.225, z)), // ขา
]);
const topMat = new THREE.MeshStandardMaterial({ roughness: 0.55 }); // สีแต่ละโต๊ะมาจาก instance color
const seatMat = new THREE.MeshStandardMaterial({ color: COLOR.seat, roughness: 0.5 });
const metalMat = new THREE.MeshStandardMaterial({ color: COLOR.metal, metalness: 0.4, roughness: 0.4 });
const seamMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22 });
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
  const frameMesh = new THREE.InstancedMesh(unitBox, metalMat, tableList.length);
  const legsMesh = new THREE.InstancedMesh(unitBox, metalMat, tableList.length * 4);
  // รอยต่อกลางโต๊ะยาว (โต๊ะจริงเป็นสองแผ่นต่อกัน) โปร่งแสงให้เข้ากับสีโต๊ะทุกสถานะ
  const seamMesh = new THREE.InstancedMesh(unitBox, seamMat, tableList.length);
  let seamCount = 0;
  const seatsMesh = new THREE.InstancedMesh(seatGeo, seatMat, seatCount);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let seatIndex = 0;
  const yaw = new THREE.Quaternion();

  for (const t of tableList) {
    const type = TYPES[t.type] ?? TYPES.long6;
    const place = (dx, dz) => offset.set(dx, 0, dz).applyQuaternion(q).add(pos.set(t.x, 0, t.z));
    q.setFromAxisAngle(up, THREE.MathUtils.degToRad(t.rot ?? 0));

    // ท็อปโต๊ะบางๆ + โครงเหล็กใต้ท็อป + ขาเหล็ก 4 ขา
    topsMesh.setMatrixAt(t.index, m.compose(pos.set(t.x, 0.75, t.z), q, scale.set(type.w, 0.04, type.d)));
    frameMesh.setMatrixAt(t.index, m.compose(pos.set(t.x, 0.7, t.z), q, scale.set(type.w - 0.14, 0.06, type.d - 0.14)));
    if (type.w > type.d * 1.5) {
      seamMesh.setMatrixAt(seamCount++, m.compose(pos.set(t.x, 0.772, t.z), q, scale.set(0.022, 0.002, type.d)));
    }
    // กล่องล่องหนที่ใหญ่กว่าโต๊ะ ให้แตะบนมือถือได้ง่าย
    hitMesh.setMatrixAt(t.index, m.compose(pos.set(t.x, 0.6, t.z), q, scale.set(type.w + 0.6, 1.2, type.d + 1.3)));
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz], k) => {
      const p = place(sx * (type.w / 2 - 0.09), sz * (type.d / 2 - 0.09)).setY(0.36);
      legsMesh.setMatrixAt(t.index * 4 + k, m.compose(p, q, scale.set(0.045, 0.72, 0.045)));
    });
    for (const [sx, sz] of type.seats) {
      // หันเก้าอี้เข้าหาโต๊ะ พนักพิงอยู่ด้านนอก
      const toTable = Math.abs(sz) >= Math.abs(sx) ? (sz > 0 ? Math.PI : 0) : (sx > 0 ? -Math.PI / 2 : Math.PI / 2);
      yaw.setFromAxisAngle(up, toTable).premultiply(q);
      seatsMesh.setMatrixAt(seatIndex++, m.compose(place(sx, sz).clone(), yaw, scale.set(1, 1, 1)));
    }

    t.tag = label(t.id, 'tag');
    t.tag.position.set(t.x, 1.15, t.z);
    tablesGroup.add(t.tag);
    tableById.set(t.id, t);
  }

  seamMesh.count = seamCount;
  for (const mesh of [topsMesh, frameMesh, legsMesh, seatsMesh, seamMesh, hitMesh]) {
    mesh.castShadow = mesh.receiveShadow = mesh !== hitMesh && mesh !== seamMesh;
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
// หมุดเป็นตัวละครน่ารักโผล่หัวอยู่บนป้าย เพื่อนมองหาโต๊ะได้ง่ายขึ้น
calloutEl.innerHTML = '<div class="bubble"><span class="callout-char" data-char="cat"></span>'
  + '<span class="callout-label"><small>ที่นั่งของเรา</small><b class="callout-text"></b></span></div>';
const callout = new CSS2DObject(calloutEl);
paintCharacters(calloutEl);
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

// ---------- แมวคุยกันเรื่องความอร่อย: ป้ายคำพูดเล็กๆ โผล่สุ่มทีละ 3-4 ตัว ----------
const CHATS = [
  'อร่อยมากกก 😋', 'เหมียว~ ฟินนน', 'กะเพราเผ็ดกำลังดี 🌶️', 'ไข่ดาวกรอบสุดๆ 🍳', 'ข้าวมันไก่วันนี้ปังมาก',
  'ขอเติมข้าวอีกจาน!', 'น้ำแดงหวานชื่นใจ 🥤', 'หมูทอดกรอบนอกนุ่มใน', 'ส้มตำแซ่บบบ', 'อร่อยจนหางกระดิก 🐾',
  'อิ่มแล้ว ง่วงเลย 😴', 'แบ่งชิมหน่อยสิ', 'ร้านนี้ต้องมาอีก ⭐', 'ซุปร้อนๆ หอมมาก', 'ของหวานวันนี้อะไรดี? 🍮',
];
const chatPool = Array.from({ length: 4 }, () => {
  const el = document.createElement('div');
  el.className = 'chat';
  el.innerHTML = '<div class="chat-b"></div>';
  const obj = new CSS2DObject(el);
  obj.visible = false;
  scene.add(obj);
  return { obj, el, until: 0 };
});
let nextChatAt = 0;
let lastChat = '';
const chatNdc = new THREE.Vector3();
function updateChats(now) {
  const off = mode === 'admin' || document.hidden;
  for (const c of chatPool) if (c.obj.visible && (off || now > c.until)) c.obj.visible = false;
  if (off || now < nextChatAt) return;
  nextChatAt = now + (900 + Math.random() * 1500) / zoomLevel; // ซูมใกล้ คุยกันถี่ขึ้น
  const free = chatPool.find((c) => !c.obj.visible);
  const spots = people.spots();
  if (!free || !spots.length) return;
  // เลือกแมวที่อยู่ในจอ ไม่ชนป้ายอื่น และไม่บังป้ายโต๊ะที่จองไว้
  for (let tries = 0; tries < 14; tries++) {
    const spot = spots[Math.floor(Math.random() * spots.length)];
    chatNdc.copy(spot).project(camera);
    if (Math.abs(chatNdc.x) > 0.78 || chatNdc.y > 0.82 || chatNdc.y < -0.85) continue;
    if (marker.visible && Math.hypot(spot.x - marker.position.x, spot.z - marker.position.z) < 2.2) continue;
    if (chatPool.some((c) => c.obj.visible && c.obj.position.distanceTo(spot) < 2.4)) continue;
    let text;
    do text = CHATS[Math.floor(Math.random() * CHATS.length)]; while (text === lastChat);
    lastChat = text;
    free.el.firstChild.textContent = text;
    free.obj.position.copy(spot);
    free.obj.visible = true;
    free.until = now + 2800 + Math.random() * 1400;
    free.el.firstChild.classList.remove('pop');
    void free.el.offsetWidth;
    free.el.firstChild.classList.add('pop');
    return;
  }
}

// ---------- แตะแมวในแผนที่: กระโดดดึ๋ง หัวใจลอย และร้องเมี้ยว ----------
const PURRS = {
  awake: ['เมี้ยว~', 'ขอปลาทูหน่อยน้า', 'ลูบหัวอีกได้ไหม', 'เหมียว! 💕', 'หิวแล้วอะ', 'รักนะ', 'เล่นกันไหม?', 'ปุกปุย~', 'เกาคางหน่อย'],
  sleep: ['zZz…', 'ง่วงงง อย่าปลุกน้า', 'ฝันถึงปลาทูอยู่…'],
  guard: ['เฝ้าโต๊ะให้อยู่นะ!', 'ที่นี่ของเราแล้ว 🐾', 'รีบมานะ รออยู่~', 'ไม่ให้ใครนั่งเลย!'],
};
const purrPool = Array.from({ length: 2 }, () => {
  const el = document.createElement('div');
  el.className = 'purr';
  el.innerHTML = '<div class="purr-b"><span class="purr-t"></span><i></i><i></i><i></i></div>';
  const obj = new CSS2DObject(el);
  obj.visible = false;
  scene.add(obj);
  return { obj, el, until: 0 };
});
const catNdc = new THREE.Vector3();
function catAt(e) {
  const r = canvas.getBoundingClientRect();
  let best = null;
  let bestD = 16 + 8 * zoomLevel; // ซูมใกล้ แมวตัวใหญ่ แตะโดนง่ายขึ้น
  for (const c of people.cats()) {
    catNdc.copy(c.pos).project(camera);
    if (catNdc.z > 1) continue;
    const d = Math.hypot(r.left + ((catNdc.x + 1) / 2) * r.width - e.clientX, r.top + ((1 - catNdc.y) / 2) * r.height - e.clientY);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}
function flyToCat(c) {
  const target = new THREE.Vector3(c.pos.x, 0, c.pos.z);
  flyTo(viewFrom(target, lock.d / MAX_ZOOM), target, 800);
}
function petCat(c) {
  const { pos, kind } = people.poke(c);
  const lines = PURRS[kind] ?? PURRS.awake;
  const fx = purrPool.find((p) => !p.obj.visible) ?? purrPool[0];
  fx.el.querySelector('.purr-t').textContent = lines[Math.floor(Math.random() * lines.length)];
  fx.obj.position.copy(pos);
  fx.obj.position.y += 0.3;
  fx.obj.visible = true;
  fx.until = performance.now() + 1800;
  const b = fx.el.firstChild;
  b.classList.remove('go');
  void b.offsetWidth;
  b.classList.add('go');
  navigator.vibrate?.(12);
}

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

// รอยเท้าแมวสีขาวบนแถบสีฟ้า เดินสลับซ้ายขวาจากประตูไปหาโต๊ะ (1 ช่องลาย = 1 เมตร)
const chevrons = (() => {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#007aff';
  g.fillRect(0, 0, 128, 64);
  g.fillStyle = '#fff';
  const dot = (x, y, rx, ry) => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  // อุ้งเท้าชี้ไปทาง +x: ฝ่าเท้าใหญ่ + นิ้วกลมสี่นิ้ว
  const paw = (x, y) => {
    dot(x - 4, y, 7.5, 9);
    for (const [dx, dy] of [[7, -10], [11.5, -3.6], [11.5, 3.6], [7, 10]]) dot(x + dx, y + dy, 3.6, 3.6);
  };
  paw(30, 21);
  paw(94, 43);
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
  const v = sideView(t.x);
  flyTo(v.pos, v.target);
}

// เลื่อนซ้าย/ขวาให้เห็นเส้นทางจากประตูถึงโต๊ะ (ระยะซูมคงที่)
function flyToRoute(t) {
  if (!t || !entranceDoors.length) return flyHome(1200);
  const door = guidePoints(t)[0];
  // เล็งกลางระหว่างประตูกับโต๊ะ ถ้าเส้นทางยาวเกินจอ ให้โต๊ะยังอยู่ในจอเสมอ
  let x = (door.x + t.x) / 2;
  const room4table = lock.half - 2.5;
  if (Math.abs(t.x - x) > room4table) x = t.x - Math.sign(t.x - x) * room4table;
  const v = sideView(x);
  flyTo(v.pos, v.target, 1200);
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
  const color = on ? COLOR.tableSelected : id === hoverId ? COLOR.tableHover : focusOn ? COLOR.tableFaded : COLOR.table;
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

// มีโต๊ะที่จอง/เลือกอยู่ = ทำให้โต๊ะอื่นกับคนจางลง ให้สายตาไปที่โต๊ะกับเส้นนำทาง
let focusOn = false;

function setSelected(id) {
  const prev = selectedId;
  selectedId = id;
  if (prev) paint(prev);
  const focus = !!tableById.get(id) && mode !== 'admin';
  if (focus !== focusOn) {
    focusOn = focus;
    people.setFocus(focus);
    seatMat.color.set(focus ? 0xe5e5ea : COLOR.seat);
    for (const t of tableList) paint(t.id);
  }
  const t = tableById.get(id);
  marker.visible = !!t;
  if (t) {
    paint(id);
    marker.position.set(t.x, 0, t.z);
    const name = mode === 'friend' ? shared.name : ''; // ชื่อมีเฉพาะลิงก์แบบเก่า
    const who = name ? `${name} · ` : '';
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

// แยก "แตะ" ออกจาก "ลากเลื่อนแผนที่" ด้วยระยะที่นิ้วขยับ
// ถ่างสองนิ้วซูมอยู่ ไม่นับเป็นการแตะ (จนกว่าจะยกนิ้วออกหมด)
let downAt = null;
const fingers = new Set();
let pinching = false;
canvas.addEventListener('pointerdown', (e) => {
  fingers.add(e.pointerId);
  if (fingers.size > 1) pinching = true;
  downAt = { x: e.clientX, y: e.clientY };
});
canvas.addEventListener('pointercancel', (e) => {
  fingers.delete(e.pointerId);
  if (!fingers.size) pinching = false;
  downAt = null;
});
let lastPet = { cat: null, at: 0 };
canvas.addEventListener('pointerup', (e) => {
  fingers.delete(e.pointerId);
  if (pinching) {
    if (!fingers.size) pinching = false;
    downAt = null;
    return;
  }
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
  downAt = null;
  if (moved > 6) return;
  if (mode !== 'admin') {
    const cat = catAt(e);
    if (cat) {
      // แตะแมวตัวเดิมสองทีติดกัน = กล้องบินเข้าไปดูใกล้ๆ
      const now = performance.now();
      if (lastPet.cat === cat && now - lastPet.at < 400) flyToCat(cat);
      lastPet = { cat, at: now };
      return petCat(cat);
    }
  }
  if (mode === 'owner') {
    const id = tableAt(e);
    if (id) ownerPick(id);
    else if (sheetPending) cancelPick(); // แตะที่ว่างตอนยังไม่กดจอง = ยกเลิก
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
let tab = 'table'; // แท็บที่เปิดอยู่ในแถบด้านล่าง: 'table' | 'food'

// แถบด้านล่างแสดงตลอด: เลือกเนื้อหาของแท็บโต๊ะตามสถานะ
function setPanel() {
  $('dock').hidden = mode === 'admin';
  $('sheet').hidden = !(mode === 'owner' && selectedId);
  $('banner').hidden = mode !== 'friend';
  $('table-empty').hidden = !(mode === 'owner' && !selectedId);
  updateRecenter();
  updateMascot();
  syncDockHeight();
}

function switchTab(name) {
  tab = name;
  for (const b of document.querySelectorAll('.tab')) {
    const on = b.dataset.tab === name;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  }
  $('tab-table').hidden = name !== 'table';
  $('tab-food').hidden = name !== 'food';
  $(`badge-${name}`).hidden = true; // เปิดดูแล้ว ลบจุดแดง
  if (name === 'food') renderFood();
}
for (const b of document.querySelectorAll('.tab')) b.addEventListener('click', () => switchTab(b.dataset.tab));
if (window.ResizeObserver) new ResizeObserver(() => syncDockHeight()).observe($('dock'));

// แผนที่อยู่เฉพาะพื้นที่เหนือแถบด้านล่าง
function syncDockHeight() {
  // การ์ดลอยเหนือขอบล่าง: นับระยะจากขอบบนการ์ดถึงล่างจอ (รวมช่องว่างใต้การ์ด)
  const h = $('dock').hidden ? 0 : Math.round(window.innerHeight - $('dock').getBoundingClientRect().top);
  if (document.documentElement.style.getPropertyValue('--dock-h') === `${h}px`) return;
  document.documentElement.style.setProperty('--dock-h', `${h}px`);
  resize();
}

// ปุ่มลอย: เลื่อนแผนที่ไปไกลแล้ว กดทีเดียวกลับมาเห็นเส้นทางถึงโต๊ะ
// แสดงเมื่อมีโต๊ะที่จอง หรือซูมเข้าไปแล้ว: กดทีเดียวกลับมามุมเห็นเส้นทางถึงโต๊ะ (หรือมุมภาพรวม)
function updateRecenter() {
  const show = mode !== 'admin' && (!!tableById.get(selectedId) || zoomLevel > 1.15);
  if ($('recenter').hidden === show) $('recenter').hidden = !show;
}
$('recenter').addEventListener('click', () => flyToRoute(tableById.get(selectedId)));

// เริ่มลากแผนที่ = ซ่อนคำแนะนำด้านบน
controls.addEventListener('start', () => {
  $('hint').hidden = true;
});

// ---------- ฝั่งเรา: เลือกแล้วแชร์ ----------

// แตะโต๊ะ = ดูตัวอย่างก่อน (หมุด + เส้นนำทาง) ต้องกด "จองโต๊ะนี้" ถึงจะจำไว้และแชร์ได้
let confirmedId = null;
let sheetPending = false;

// ---------- กลุ่ม: ใครที่มีลิงก์กลุ่มก็เลือก/เปลี่ยนโต๊ะได้ ทุกคนเห็นโต๊ะเดียวกัน ----------
// ลิงก์กลุ่มหน้าตาแบบ ?g=ab12cd34 ใช้ซ้ำได้ทุกวัน (เก็บไว้ที่ Upstash Redis ผ่าน api/group.js)
const GROUP_RE = /^[a-z0-9]{6,16}$/;
const GROUP_KEY = 'torim:group';
let groupId = GROUP_RE.test(params.get('g') ?? '') ? params.get('g') : store.get(GROUP_KEY);
if (!GROUP_RE.test(groupId ?? '')) groupId = null;
if (groupId) store.set(GROUP_KEY, groupId);
let groupState = null; // { table, date, by, at }
let pollTimer;

const newGroupId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');

async function groupApi(method, body) {
  try {
    const res = method === 'GET'
      ? await fetch(`api/group?g=${groupId}`, { cache: 'no-store' })
      : await fetch('api/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ g: groupId, ...body }),
      });
    if (!res.ok) return { error: res.status };
    return await res.json();
  } catch {
    return { error: 0 };
  }
}
// ไม่มีระบบกลุ่มบนเซิร์ฟเวอร์ (เปิดในเครื่อง หรือยังไม่ได้ต่อ Redis) = ใช้แบบเดิม
const groupUnavailable = (r) => [404, 405, 501, 503].includes(r.error);

function leaveGroup() {
  groupId = null;
  groupState = null;
  store.set(GROUP_KEY, null);
  clearTimeout(pollTimer);
  history.replaceState(null, '', location.pathname);
  updateGroupUi();
}

const agoText = (at) => {
  const min = Math.round((Date.now() - at) / 60000);
  if (min < 1) return 'เมื่อสักครู่';
  if (min < 60) return `${min} นาทีที่แล้ว`;
  return `${Math.round(min / 60)} ชม.ที่แล้ว`;
};

function updateGroupUi() {
  const shareLabel = groupId ? 'ส่งลิงก์กลุ่ม' : 'แชร์ให้เพื่อน';
  $('share').setAttribute('aria-label', shareLabel);
  $('share').title = shareLabel;
  $('preview').hidden = !!groupId; // ในกลุ่ม ทุกคนเห็นหน้าเดียวกับเราอยู่แล้ว
  const clearLabel = groupId ? 'ยกเลิกโต๊ะของทั้งกลุ่ม' : 'ยกเลิกการจอง';
  $('clear').setAttribute('aria-label', clearLabel);
  $('clear').title = clearLabel;
  if (mode === 'owner') {
    $('hint').textContent = groupId
      ? '👥 ใครในกลุ่มก็เลือกหรือเปลี่ยนโต๊ะได้ ทุกคนเห็นเหมือนกัน'
      : 'แตะโต๊ะที่จะนั่ง กดจอง แล้วแชร์ให้เพื่อน';
  }
}

// รับโต๊ะล่าสุดของกลุ่มมาแสดง (announce = มีคนอื่นเพิ่งเปลี่ยน ให้แจ้งเตือน)
function applyGroup(state, announce) {
  groupState = state;
  const id = state.date === today() && tableById.has(state.table) ? state.table : null;
  if (id === confirmedId) {
    if (id && !sheetPending) {
      setSelected(id); // อัปเดตชื่อคนเลือกบนป้าย
      fillSheet(id, false);
      setPanel();
    }
    return;
  }
  confirmedId = id;
  store.set('torim:pick', id ? { id, date: today() } : null);
  if (announce) {
    toast(id ? `โต๊ะเปลี่ยนเป็น ${id} แล้ว` : 'โต๊ะของกลุ่มถูกยกเลิกแล้ว');
    if (tab !== 'table') $('badge-table').hidden = false;
  }
  if (sheetPending) return; // กำลังเลือกโต๊ะอยู่ ไม่ขัดจังหวะ
  setSelected(id);
  if (id) fillSheet(id, false);
  setPanel();
  if (announce && id) flyToRoute(tableById.get(id)); // พาไปดูโต๊ะใหม่ที่เพื่อนเลือก
}

async function pollGroup(first = false) {
  clearTimeout(pollTimer);
  if (!groupId || mode !== 'owner') return;
  if (!document.hidden) {
    const state = await groupApi('GET');
    if (groupUnavailable(state)) return leaveGroup();
    if (!state.error) applyMeal(state.meal, !first);
    if (!state.error) applyPhotoMeta(state.photo, !first);
    if (!state.error && (first || state.at !== groupState?.at)) {
      applyGroup(state, !first && groupState !== null);
      const t = tableById.get(confirmedId);
      if (first && t) setTimeout(() => flyToRoute(t), 300);
    }
  }
  pollTimer = setTimeout(pollGroup, 6000);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) pollGroup(); });

// ตั้งโต๊ะของกลุ่ม (สร้างกลุ่มใหม่ให้เองถ้ายังไม่มี) คืนค่า false ถ้าบันทึกไม่สำเร็จ
async function saveGroupTable(table) {
  const creating = !groupId;
  if (creating) groupId = newGroupId();
  const state = await groupApi('POST', { table, date: today() });
  if (state.error !== undefined) {
    if (creating || groupUnavailable(state)) {
      leaveGroup();
      return creating; // ไม่มีระบบกลุ่ม: เก็บในเครื่องแบบเดิมไปก่อน
    }
    toast('บันทึกไม่สำเร็จ ลองอีกครั้ง');
    return false;
  }
  groupState = state;
  if (creating) {
    store.set(GROUP_KEY, groupId);
    history.replaceState(null, '', `${location.pathname}?g=${groupId}`);
    updateGroupUi();
    pollGroup();
  }
  return true;
}

function fillSheet(id, pending) {
  sheetPending = pending;
  const t = tableById.get(id);
  $('sel-id').textContent = id;
  const byLine = groupId && groupState?.table === id && groupState.at
    ? ` · อัปเดต ${agoText(groupState.at)}`
    : '';
  $('sel-sub').textContent = pending && confirmedId
    ? `เปลี่ยนจากโต๊ะ ${confirmedId}${groupId ? ' · ทุกคนในกลุ่มจะเห็น' : ''}`
    : `${pending ? describe(id) : describeShort(id)}${byLine}`;
  $('sheet-confirm').hidden = !pending;
  $('sheet-share').hidden = pending;
  $('head-actions').hidden = pending;
  renderPhotoRow();
}

function ownerPick(id) {
  if (!id) return;
  setSelected(id);
  fillSheet(id, id !== confirmedId);
  switchTab('table');
  setPanel();
  flyToRoute(tableById.get(id)); // เลื่อนซ้าย/ขวาให้เห็นเส้นทางจากประตูถึงโต๊ะ
}

async function confirmPick() {
  const id = selectedId;
  $('pick-ok').disabled = true;
  const ok = await saveGroupTable(id);
  $('pick-ok').disabled = false;
  if (!ok || selectedId !== id) return;
  confirmedId = id;
  store.set('torim:pick', { id, date: today() });
  setSelected(id); // อัปเดตชื่อคนเลือกบนป้าย
  fillSheet(id, false);
  toast(groupId ? `ตั้งโต๊ะ ${id} ให้กลุ่มแล้ว ✓` : `จองโต๊ะ ${id} แล้ว ✓`);
  celebrate();
}

function cancelPick() {
  sheetPending = false;
  setSelected(confirmedId);
  if (confirmedId) fillSheet(confirmedId, false);
  setPanel();
}

$('pick-ok').addEventListener('click', confirmPick);
$('pick-cancel').addEventListener('click', cancelPick);

function enterOwner() {
  mode = 'owner';
  history.replaceState(null, '', groupId ? `${location.pathname}?g=${groupId}` : location.pathname);
  $('hint').hidden = false;
  updateGroupUi();
  // จำโต๊ะที่จองไว้ของวันนี้ เปิดเว็บใหม่ก็ยังปักหมุดอยู่ (แสดงเป็นป้ายย่อ)
  const last = store.get('torim:pick');
  confirmedId = last?.date === today() && tableById.has(last.id) ? last.id : null;
  cancelPick();
  flyHome();
  pollGroup(true);
}

$('clear').addEventListener('click', async () => {
  const ask = groupId ? `ยกเลิกโต๊ะ ${confirmedId} ของทั้งกลุ่มใช่ไหม?` : `ยกเลิกการจองโต๊ะ ${confirmedId} ใช่ไหม?`;
  if (!window.confirm(ask)) return;
  if (groupId && !(await saveGroupTable(null))) return;
  confirmedId = null;
  store.set('torim:pick', null);
  cancelPick();
});

// ---------- 📷 รูปโต๊ะ: ถ่ายของบนโต๊ะไว้ให้เพื่อนสังเกตง่าย ----------
// ในกลุ่ม: เก็บใน Redis ของเว็บแค่วันเดียว (ลบเองหลัง 24 ชม.) ไม่มีกลุ่ม: เก็บไว้ในเครื่องนี้
const PHOTO_KEY = 'torim:photo';
let photo = groupId ? null : store.get(PHOTO_KEY); // { table, date, at, data }
let photoMetaAt = 0;
let myPhotoAt = 0;

const currentPhoto = () => (photo?.data && photo.date === today() && photo.table === confirmedId ? photo : null);

function renderPhotoRow() {
  const p = currentPhoto();
  const hero = $('photo-row');
  hero.classList.toggle('has', !!p);
  hero.style.backgroundImage = p ? `url("${p.data}")` : '';
  $('photo-album').hidden = !!p; // มีรูปแล้ว เปลี่ยน/เลือกใหม่ได้จากหน้าดูรูปเต็มจอ
  $('photo-badge').innerHTML = p ? `${icon('camera', 14)} ${agoText(p.at)} · แตะดูเต็มจอ` : '';
  $('photo-sub').textContent = groupId ? 'ถ่ายของบนโต๊ะไว้ เพื่อนจะหาเจอง่าย' : 'ถ่ายของบนโต๊ะไว้ให้เพื่อนสังเกตง่าย';
}

// ย่อรูปในเครื่องก่อนส่ง (ด้านยาวไม่เกิน ~1000px, JPEG) ให้ไฟล์เล็กและโหลดเร็ว
async function shrinkPhoto(file) {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = src;
    });
    let side = 1000;
    let quality = 0.75;
    let data = '';
    for (let k = 0; k < 6; k++) {
      const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale);
      c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      data = c.toDataURL('image/jpeg', quality);
      if (data.length <= 380000) break;
      side *= 0.8;
      quality = Math.max(0.5, quality - 0.07);
    }
    return data;
  } finally {
    URL.revokeObjectURL(src);
  }
}

async function savePhoto(data) {
  const row = $('photo-row');
  row.classList.add('loading');
  row.disabled = true;
  if (groupId) {
    const res = await groupApi('POST', { photo: data, table: confirmedId, date: today() });
    if (res.photo) {
      photo = data ? { ...res.photo, data } : null;
      myPhotoAt = photoMetaAt = res.photo.at;
      toast(data ? 'เพิ่มรูปโต๊ะแล้ว เพื่อนในกลุ่มเห็นแล้ว 📷' : 'ลบรูปแล้ว');
    } else {
      toast(res.error === 413 ? 'รูปใหญ่เกินไป ลองรูปอื่นนะ' : 'ส่งรูปไม่สำเร็จ ลองอีกครั้ง');
    }
  } else {
    photo = data ? { table: confirmedId, date: today(), at: Date.now(), data } : null;
    store.set(PHOTO_KEY, photo);
    toast(data ? 'เก็บรูปไว้ในเครื่องนี้แล้ว 📷' : 'ลบรูปแล้ว');
  }
  row.classList.remove('loading');
  row.disabled = false;
  renderPhotoRow();
}

$('photo-row').addEventListener('click', () => (currentPhoto() ? openPhoto() : $('photo-input').click()));
$('photo-album').addEventListener('click', () => $('photo-pick').click());
async function onPhotoChosen(e) {
  const file = e.target.files?.[0];
  e.target.value = ''; // เลือกรูปเดิมซ้ำได้
  if (!file || !confirmedId) return;
  closePhoto();
  try {
    await savePhoto(await shrinkPhoto(file));
  } catch {
    toast('เปิดรูปนี้ไม่ได้ ลองรูปอื่นนะ');
  }
}
// ช่องแรกเปิดกล้องหลังทันที (capture) ช่องที่สองเลือกจากอัลบั้ม
$('photo-input').addEventListener('change', onPhotoChosen);
$('photo-pick').addEventListener('change', onPhotoChosen);

function openPhoto() {
  const p = currentPhoto();
  if (!p) return;
  $('photo-img').src = p.data;
  $('photo-view-title').textContent = `โต๊ะ ${p.table}`;
  $('photo-view-sub').textContent = `อัปเดต ${agoText(p.at)}`;
  $('photo-view').hidden = false;
}
function closePhoto() {
  $('photo-view').hidden = true;
}
$('photo-close').addEventListener('click', closePhoto);
$('photo-retake').addEventListener('click', () => $('photo-input').click());
$('photo-repick').addEventListener('click', () => $('photo-pick').click());
$('photo-delete').addEventListener('click', async () => {
  if (!window.confirm('ลบรูปโต๊ะนี้ใช่ไหม?')) return;
  closePhoto();
  await savePhoto(null);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePhoto(); });

// รูปจากกลุ่ม: ตอนเช็กปกติได้แค่เวลาอัปเดต ถ้าเปลี่ยนค่อยโหลดตัวรูป
async function applyPhotoMeta(meta, announce) {
  if (!meta || meta.date !== today() || meta.at === photoMetaAt) return;
  photoMetaAt = meta.at;
  if (!meta.table) {
    photo = null;
    renderPhotoRow();
    return;
  }
  if (meta.at === myPhotoAt) return;
  try {
    const res = await fetch(`api/group?g=${groupId}&photo=1`, { cache: 'no-store' });
    const body = res.ok ? await res.json() : null;
    if (!body?.photo?.data) return;
    photo = body.photo;
    renderPhotoRow();
    if (announce && photo.table === confirmedId) toast('📷 เพื่อนเพิ่มรูปโต๊ะแล้ว แตะดูได้ในแท็บโต๊ะ');
  } catch {}
}

let toastTimer;
// ฉลองตอนทำสำเร็จ: พลุกระดาษสีของแอปโปรยลงมา ตัวละครกระโดดดีใจ
const CONFETTI = ['#007aff', '#ff3b30', '#ffcc00', '#34c759', '#ff9500'];
function celebrate() {
  navigator.vibrate?.(30);
  for (const el of [$('walker'), calloutEl.querySelector('.callout-char'), $('mascot-btn')]) {
    el.classList.remove('hop');
    void el.offsetWidth;
    el.classList.add('hop');
  }
  setTimeout(() => document.querySelectorAll('.hop').forEach((el) => el.classList.remove('hop')), 1100);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div');
  box.className = 'confetti';
  box.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 46; i++) {
    const bit = document.createElement('i');
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = CONFETTI[i % CONFETTI.length];
    bit.style.setProperty('--dx', `${(Math.random() - 0.5) * 120}px`);
    bit.style.setProperty('--r', `${(Math.random() - 0.5) * 900}deg`);
    bit.style.animationDelay = `${Math.random() * 0.25}s`;
    bit.style.animationDuration = `${1.1 + Math.random() * 0.7}s`;
    if (i % 3 === 0) bit.style.borderRadius = '50%';
    box.append(bit);
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 2300);
}

function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2500);
}

// ---------- 🎲 วันนี้กินอะไรดี ----------
// สุ่มเมนูอาหารตามสั่ง แก้รายการเองได้ (เก็บในเครื่อง) ถ้าอยู่ในกลุ่ม เพื่อนจะเห็นเมนูที่สุ่มได้ด้วย
const DEFAULT_MENU = [
  'กะเพราหมูสับไข่ดาว', 'กะเพราไก่', 'ข้าวผัดหมู', 'ข้าวผัดกุ้ง', 'ผัดซีอิ๊ว', 'ราดหน้า',
  'สุกี้แห้ง', 'สุกี้น้ำ', 'ข้าวไข่เจียวหมูสับ', 'หมูกระเทียม', 'ผัดพริกแกงหมู', 'คะน้าหมูกรอบ',
  'ข้าวมันไก่', 'ก๋วยเตี๋ยว', 'ผัดไทย', 'ข้าวหมูทอด',
];
const MENU_KEY = 'torim:menu';
let menu = Array.isArray(store.get(MENU_KEY)) && store.get(MENU_KEY).length ? store.get(MENU_KEY) : DEFAULT_MENU.slice();
let spinning = false;
let groupMeal = null; // { name, date, at } เมนูล่าสุดที่กลุ่มสุ่มได้วันนี้
let myMealAt = 0;

function foodSub() {
  if (groupMeal && !spinning) return `กลุ่มสุ่มได้เมนูนี้ · ${agoText(groupMeal.at)}`;
  return groupId ? 'สุ่มแล้วเพื่อนในกลุ่มจะเห็นด้วย' : 'ลังเลอยู่ใช่ไหม ให้ดวงช่วยเลือก';
}

function renderFood() {
  $('food-sub').textContent = foodSub();
  if (!spinning && groupMeal) {
    $('food-slot').textContent = groupMeal.name;
    $('food-slot').classList.add('done');
  }
  $('food-spin').innerHTML = `${icon('dice', 18)} ${$('food-slot').classList.contains('done') ? 'สุ่มใหม่' : 'สุ่มเลย'}`;
  $('food-spin').disabled = spinning || !menu.length;
  const chips = $('food-chips');
  chips.replaceChildren(...menu.map((name, i) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.setAttribute('aria-label', `ลบ ${name}`);
    chip.append(name, Object.assign(document.createElement('b'), { textContent: '✕' }));
    chip.addEventListener('click', () => { menu.splice(i, 1); saveMenu(); });
    return chip;
  }));
}

function saveMenu() {
  store.set(MENU_KEY, menu);
  renderFood();
}

function spinFood() {
  if (spinning || !menu.length) return;
  spinning = true;
  const slot = $('food-slot');
  const prev = slot.textContent;
  let pick;
  do pick = menu[Math.floor(Math.random() * menu.length)]; while (menu.length > 1 && pick === prev);
  slot.classList.remove('done');
  renderFood();
  let i = Math.floor(Math.random() * menu.length);
  let delay = 45;
  const step = () => {
    if (delay > 280) return finish();
    slot.textContent = menu[i++ % menu.length];
    slot.classList.remove('tick');
    void slot.offsetWidth; // เริ่มแอนิเมชันใหม่ทุกครั้งที่เปลี่ยนชื่อ
    slot.classList.add('tick');
    delay *= 1.13;
    setTimeout(step, delay);
  };
  const finish = async () => {
    slot.classList.remove('tick');
    slot.textContent = pick;
    slot.classList.add('done');
    celebrate();
    spinning = false;
    groupMeal = null;
    renderFood();
    if (!groupId) return;
    const res = await groupApi('POST', { meal: pick, date: today() });
    if (res.meal) {
      myMealAt = res.meal.at;
      groupMeal = res.meal;
      $('food-sub').textContent = 'ส่งให้เพื่อนในกลุ่มแล้ว ✓';
    }
  };
  step();
}

// เมนูจากกลุ่ม (announce = เพื่อนเพิ่งสุ่ม ให้แจ้งเตือน)
function applyMeal(meal, announce) {
  if (!meal || meal.date !== today() || meal.at === groupMeal?.at) return;
  groupMeal = meal;
  if (announce && meal.at !== myMealAt) toast(`🎲 เพื่อนสุ่มได้: ${meal.name}`);
  if (tab === 'food' && !spinning) renderFood();
  else if (announce && meal.at !== myMealAt) $('badge-food').hidden = false;
}

$('food-spin').addEventListener('click', spinFood);
// แก้เมนู: สลับช่องสุ่มเป็นรายการเมนู (ความสูงแถบเท่าเดิม)
$('food-edit-toggle').addEventListener('click', () => {
  const editing = $('food-edit').hidden;
  $('food-edit').hidden = !editing;
  $('food-main').hidden = editing;
  $('food-reset').hidden = !editing;
  $('food-head').hidden = editing;
  $('food-spin').hidden = editing;
  $('food-edit-toggle').innerHTML = editing ? `${icon('check', 18)} เสร็จ` : `${icon('pencil', 18)} แก้เมนู`;
  $('food-edit-toggle').className = editing ? 'primary' : 'ghost';
});
$('food-reset').addEventListener('click', () => { menu = DEFAULT_MENU.slice(); saveMenu(); });
function addMenu() {
  const name = $('food-new').value.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 30);
  if (!name) return;
  if (!menu.includes(name)) menu.push(name);
  $('food-new').value = '';
  saveMenu();
}
$('food-add').addEventListener('click', addMenu);
$('food-new').addEventListener('keydown', (e) => { if (e.key === 'Enter') addMenu(); });

// ---------- ผองเพื่อนตัวละคร (แมว หมา หมี กระต่าย): ผลัดกันให้คำแนะนำในแท็บโต๊ะ ----------
const TIPS = [
  'ลากซ้าย–ขวาเพื่อดูทั้งโรงอาหารได้นะ 👈👉',
  'ลูกศรสีฟ้าคือทางเดินจากประตูทางเข้าไปถึงโต๊ะ',
  'หิวแต่คิดไม่ออก? แตะแท็บ 🎲 กินอะไรดี ด้านล่าง เดี๋ยวช่วยสุ่มเมนูให้',
  'จองโต๊ะแล้วถ่ายรูปโต๊ะไว้ 📷 เพื่อนจะหาเจอง่ายขึ้น',
];
let tipIndex = -1; // -1 = คำแนะนำตามสถานการณ์ตอนนี้
let lastMascotText = '';
let lastContext = '';
let charIndex = 0;
paintCharacters();
paintIcons();

function mascotLine() {
  if (mode === 'friend') {
    if (params.has('preview')) return '👀 นี่คือหน้าที่เพื่อนจะเห็น กด “← กลับ” เพื่อกลับไปหน้าเรา';
    return selectedId ? `เพื่อนรออยู่ที่โต๊ะ ${selectedId} เดินตามลูกศรสีฟ้าไปได้เลย 🏃` : 'เปิดลิงก์จากเพื่อนแล้ว แต่ไม่เจอโต๊ะนี้ในผัง ลองถามเพื่อนอีกทีนะ';
  }
  if (sheetPending && selectedId) return `โต๊ะ ${selectedId} ใช่ไหม? ถ้าใช่ กด “จองโต๊ะนี้” ได้เลย`;
  if (confirmedId) {
    return groupId
      ? `ทุกคนในกลุ่มเห็นโต๊ะ ${confirmedId} แล้ว รอเจอกันนะ 👋`
      : `จองโต๊ะ ${confirmedId} แล้ว! แตะป้ายด้านล่างเพื่อแชร์ให้เพื่อน`;
  }
  return groupId ? 'ใครในกลุ่มก็เลือกโต๊ะได้ แตะโต๊ะที่อยากนั่งเลย' : 'สวัสดี! แตะโต๊ะที่จะนั่ง เดี๋ยวพาเดินจากประตูให้ 🐾';
}

// อยู่ในแท็บโต๊ะตอนยังไม่ได้เลือกโต๊ะ
function updateMascot() {
  document.body.classList.toggle('mascot-on', mode !== 'admin' && !params.has('preview'));
  // สถานการณ์เปลี่ยน กลับมาพูดเรื่องที่ต้องทำตอนนี้ก่อน
  const context = mascotLine();
  if (context !== lastContext) {
    lastContext = context;
    tipIndex = -1;
  }
  const text = tipIndex < 0 ? context : TIPS[tipIndex];
  const bubble = $('mascot-bubble');
  if (text !== lastMascotText) {
    const who = CHARACTERS[charIndex];
    $('mascot-btn').dataset.char = who.id;
    paintCharacters($('table-empty'));
    $('mascot-name').textContent = who.name;
    $('mascot-text').textContent = lastMascotText = text;
    bubble.classList.remove('pop');
    void bubble.offsetWidth;
    bubble.classList.add('pop');
  }
}

function nextTip() {
  tipIndex = tipIndex + 1 >= TIPS.length ? -1 : tipIndex + 1;
  charIndex = (charIndex + 1) % CHARACTERS.length; // แตะแล้วเพื่อนตัวถัดไปมาพูดแทน
  const art = $('mascot-btn');
  art.classList.remove('hop');
  void art.offsetWidth;
  art.classList.add('hop');
  updateMascot();
}
$('mascot-btn').addEventListener('click', nextTip);
$('mascot-bubble').addEventListener('click', nextTip);

// เพื่อนตัวเล็กที่เดินไปมาบนขอบการ์ด: เดินครบหนึ่งรอบแล้วสลับเป็นตัวถัดไป
let walkerIndex = 1;
$('walker').addEventListener('animationiteration', (e) => {
  if (e.animationName !== 'walk') return;
  walkerIndex = (walkerIndex + 1) % CHARACTERS.length;
  $('walker').querySelector('.walker-art').dataset.char = CHARACTERS[walkerIndex].id;
  paintCharacters($('walker'));
});

function shareUrl() {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('openExternalBrowser', '1'); // เปิดจาก LINE แล้วให้เด้งไปเบราว์เซอร์จริง (เบราว์เซอร์ใน LINE บางเครื่องเปิด 3D ไม่ได้)
  if (groupId) {
    url.searchParams.set('g', groupId);
    return url;
  }
  url.searchParams.set('t', selectedId);
  url.searchParams.set('d', today());
  return url;
}

// เปิดลิงก์เดียวกับที่ส่งให้เพื่อน ดูว่าเพื่อนจะเห็นอะไร (มีปุ่มกลับ)
$('preview').addEventListener('click', () => {
  const url = shareUrl();
  url.searchParams.set('preview', '1');
  location.href = url.href;
});

$('share').addEventListener('click', async () => {
  const url = shareUrl();
  const text = groupId
    ? `วันนี้นั่งโต๊ะ ${selectedId} ที่โรงอาหาร 📍 ใครได้โต๊ะอื่นก่อน กดเปลี่ยนในลิงก์นี้ได้เลย`
    : `วันนี้นั่งโต๊ะ ${selectedId} ที่โรงอาหาร 📍`;

  if (navigator.share) {
    try {
      await navigator.share({ title: 'วันนี้นั่งตรงไหนดี', text, url: url.href });
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
    setPanel();
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
  setSelected(t.id);
  setPanel();
  setTimeout(() => flyToRoute(t), 500);
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
      for (const t of tables) t.type = type;
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
let saved = clone(layout.tables);
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
  saved = clone(layout.tables);
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
  published.tables = clone(data.tables);
  saved = clone(data.tables);
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
  layout.tables = clone(saved);
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
  const tables = scopeTables();
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
// เข้าโหมดแอดมิน: กดค้างที่ชื่อเว็บ (ไม่มีปุ่มให้คนทั่วไปเห็น) หรือเปิด ?admin ตรงๆ
let adminPress;
const titleEl = document.querySelector('.title');
titleEl.addEventListener('pointerdown', () => {
  if (mode === 'admin') return;
  adminPress = setTimeout(() => { location.href = `${location.pathname}?admin`; }, 800);
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
  titleEl.addEventListener(ev, () => clearTimeout(adminPress));
}
titleEl.addEventListener('contextmenu', (e) => e.preventDefault());

$('adm-reset').addEventListener('click', () => {
  if (!window.confirm('ทิ้งการแก้ไขทั้งหมด แล้วกลับไปใช้ผังที่เผยแพร่อยู่?')) return;
  layout.tables = clone(published.tables);
  saved = clone(published.tables);
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
  setPanel();
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
  // จอเปลี่ยนขนาด (หมุนจอ) คำนวณระยะล็อกใหม่ แล้ววางกล้องให้ตรง
  updateLock();
  syncZoomLimits();
  if (!flight) {
    keepInRoom();
    camera.position.copy(viewFrom(controls.target, lock.d));
  }
  updateMascot();
}
window.addEventListener('resize', resize);
resize();

const clock = new THREE.Clock();
window.torimReady = true; // บอกตัวเช็กใน index.html ว่าเปิดสำเร็จ
renderer.setAnimationLoop(() => {
  const time = clock.getElapsedTime();

  if (flight) {
    const k = Math.min(1, (performance.now() - flight.start) / flight.ms);
    const e = ease(k);
    camera.position.lerpVectors(flight.fromPos, flight.pos, e);
    controls.target.lerpVectors(flight.fromTarget, flight.target, e);
    if (k === 1) flight = null;
  }

  // ไม่ขึ้นเลขโต๊ะลอยบนแผนที่ (ไม่บังแมว): เมาส์ชี้ = โต๊ะเปลี่ยนสี ส่วนโต๊ะที่จองใช้ป้ายลอยสีแดง
  for (const t of tableList) t.tag.visible = false;
  callout.visible = marker.visible && !!selectedId;

  people.update(time);
  updateChats(performance.now());
  for (const p of purrPool) if (p.obj.visible && (performance.now() > p.until || mode === 'admin')) p.obj.visible = false;
  chevrons.offset.x = -((time * 0.7) % 1); // รอยเท้าแมวเดินจากประตูไปหาโต๊ะ
  const bob = Math.sin(time * 2.2) * 0.12;
  callout.position.y = CALLOUT_Y + bob;
  stem.scale.y = CALLOUT_Y + bob - 0.95;
  const pulse = (time % 1.5) / 1.5;
  ring.scale.setScalar(1 + pulse * 0.35);
  ring.material.opacity = 1 - pulse;

  controls.update();
  keepInRoom();
  updateRecenter();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
});

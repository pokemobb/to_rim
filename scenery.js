import * as THREE from 'three';

// ฉากรอบโรงอาหาร: พื้น กำแพง ร้านค้า ที่วางจาน ห้องน้ำ ประตู ต้นไม้
// ทุกชิ้นสร้างในพิกัดของตัวเอง โดยให้ +z คือด้านหน้าที่หันเข้าหาห้อง แล้วค่อยหมุนไปวางที่จริง

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...opts });

const M = {
  wall: mat(0xf9f9fb),
  wallCap: mat(0xd1d1d6),
  wood: mat(0xb9825a, { roughness: 0.6 }),
  counterTop: mat(0xf6f3ee, { roughness: 0.35 }),
  shelf: mat(0xfafafa, { roughness: 0.5 }),
  item: mat(0xffffff, { roughness: 0.6 }), // สีมาจาก instance color
  steel: mat(0xc7cdd3, { metalness: 0.6, roughness: 0.35 }),
  dark: mat(0x3b4350),
  glass: new THREE.MeshStandardMaterial({ color: 0xa9d8f2, transparent: true, opacity: 0.35, roughness: 0.1 }),
  frame: mat(0x59616d, { metalness: 0.5, roughness: 0.4 }),
  tileWhite: mat(0xf4f7f9),
  toiletWall: mat(0xcfe5e2),
  roof: mat(0xe4e8eb),
  white: mat(0xffffff),
  pot: mat(0xc56a3d),
  trunk: mat(0x7a5236),
  leaf: mat(0x5fa35a, { flatShading: true }),
  leafDark: mat(0x3f8a4a, { flatShading: true }),
};

const WALL_H = 2.35;
const DOOR_H = 2.2;
const unit = new THREE.BoxGeometry(1, 1, 1);

// กล่องที่ฐานวางบนพื้น (y0 = ความสูงของฐาน)
function block(w, h, d, material, x = 0, z = 0, y0 = 0) {
  const m = new THREE.Mesh(unit, material);
  m.scale.set(w, h, d);
  m.position.set(x, y0 + h / 2, z);
  m.castShadow = m.receiveShadow = material !== M.glass;
  return m;
}

function floorPatch(w, d, color) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color, { roughness: 0.95 }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.006;
  m.receiveShadow = true;
  return m;
}

// ของชิ้นเล็กจำนวนมาก (สินค้า ถาด) รวมเป็น InstancedMesh เดียวให้ลื่นบนมือถือ
// แต่ละชิ้น: { x, y (กึ่งกลาง), z, w, h, d, color, rx }
function instanced(material, list) {
  const im = new THREE.InstancedMesh(unit, material, list.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  list.forEach((b, i) => {
    q.setFromEuler(e.set(b.rx ?? 0, 0, 0));
    im.setMatrixAt(i, m4.compose(new THREE.Vector3(b.x, b.y, b.z), q, new THREE.Vector3(b.w, b.h, b.d)));
    if (b.color != null) im.setColorAt(i, c.set(b.color));
  });
  im.castShadow = im.receiveShadow = true;
  return im;
}

// สุ่มแบบกำหนด seed ให้ของบนชั้นออกมาเหมือนเดิมทุกครั้งที่เปิด
let seed = 7;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

const SNACKS = [0xe85d5d, 0xf2b134, 0x4fb286, 0x4f8fe0, 0xa070d6, 0xf28fb1, 0xffffff];

function shop(W, D) {
  const g = new THREE.Group();
  g.add(floorPatch(W, D, 0xeadfcd));
  g.add(block(W, WALL_H, 0.15, M.wall, 0, -D / 2 + 0.075));
  for (const s of [-1, 1]) g.add(block(0.15, WALL_H, D, M.wall, s * (W / 2 - 0.075), 0));

  // ชั้นวางสินค้าชิดผนังหลัง
  const boards = [];
  const items = [];
  const n = Math.max(1, Math.floor((W - 0.6) / 1.5));
  const sw = (W - 0.6) / n;
  const backZ = -D / 2 + 0.15;
  for (let i = 0; i < n; i++) {
    const sx = -W / 2 + 0.3 + sw * (i + 0.5);
    boards.push({ x: sx, y: 1.0, z: backZ + 0.03, w: sw - 0.08, h: 2.0, d: 0.05 });
    for (const by of [0.45, 1.05, 1.65]) {
      boards.push({ x: sx, y: by, z: backZ + 0.25, w: sw - 0.08, h: 0.04, d: 0.42 });
      let cx = sx - sw / 2 + 0.08;
      while (cx < sx + sw / 2 - 0.3) {
        const w = 0.14 + rand() * 0.16;
        const h = 0.18 + rand() * 0.2;
        items.push({ x: cx + w / 2, y: by + 0.02 + h / 2, z: backZ + 0.25, w, h, d: 0.22 + rand() * 0.1, color: SNACKS[Math.floor(rand() * SNACKS.length)] });
        cx += w + 0.04;
      }
    }
  }

  // เคาน์เตอร์ขายของด้านหน้า + ตู้กระจกโชว์ขนม
  const cz = D / 2 - 0.45;
  g.add(block(W - 0.8, 0.95, 0.6, M.wood, 0, cz));
  g.add(block(W - 0.7, 0.05, 0.75, M.counterTop, 0, cz, 0.95));
  const cases = Math.max(1, Math.floor(W / 4));
  for (let i = 0; i < cases; i++) {
    const x = -W / 2 + (W / cases) * (i + 0.5);
    g.add(block(1.3, 0.45, 0.5, M.glass, x, cz, 1.0));
    for (let k = 0; k < 5; k++) {
      items.push({ x: x - 0.5 + k * 0.25, y: 1.07, z: cz, w: 0.18, h: 0.12, d: 0.3, color: SNACKS[Math.floor(rand() * SNACKS.length)] });
    }
  }
  g.add(instanced(M.shelf, boards), instanced(M.item, items));

  return g;
}

function dishes(W, D) {
  const g = new THREE.Group();
  g.add(floorPatch(W, D, 0xdfe7ec));
  g.add(block(W, WALL_H, 0.15, M.tileWhite, 0, -D / 2 + 0.075));
  for (const s of [-1, 1]) g.add(block(0.15, WALL_H, D, M.tileWhite, s * (W / 2 - 0.075), 0));

  // อ่างล้างจานชิดผนังหลัง
  const bz = -D / 2 + 0.55;
  g.add(block(W - 0.6, 0.9, 0.7, M.steel, 0, bz));
  const sinks = Math.max(1, Math.floor((W - 0.6) / 2));
  for (let i = 0; i < sinks; i++) {
    const x = -W / 2 + 0.3 + ((W - 0.6) / sinks) * (i + 0.5);
    g.add(block(0.9, 0.02, 0.5, M.dark, x, bz, 0.9));
    g.add(block(0.05, 0.35, 0.05, M.steel, x, bz - 0.28, 0.9));
    g.add(block(0.05, 0.05, 0.2, M.steel, x, bz - 0.2, 1.22));
  }

  // ชั้นคว่ำจาน + จาน
  const plates = [];
  g.add(block(W - 0.6, 0.04, 0.32, M.steel, 0, -D / 2 + 0.3, 1.6));
  for (let x = -W / 2 + 0.5; x < W / 2 - 0.5; x += 0.09) {
    plates.push({ x, y: 1.74, z: -D / 2 + 0.3, w: 0.02, h: 0.24, d: 0.24, color: 0xffffff });
  }

  // เคาน์เตอร์ส่งถาดด้านหน้า + ถาดซ้อน
  const fz = D / 2 - 0.45;
  g.add(block(W - 1.2, 0.9, 0.6, M.steel, 0, fz));
  for (let s = 0; s < 4; s++) {
    const x = -W / 2 + 1.2 + s * 0.9;
    for (let k = 0; k < 8; k++) {
      plates.push({ x, y: 0.92 + k * 0.035, z: fz, w: 0.45, h: 0.025, d: 0.34, color: k % 2 ? 0xf0c987 : 0xe9a95e });
    }
  }
  g.add(instanced(M.item, plates));

  // ถังแยกขยะหน้าเคาน์เตอร์
  const binGeo = new THREE.CylinderGeometry(0.24, 0.21, 0.75, 16);
  const lidGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.05, 16);
  [0x4fb286, 0x4f8fe0, 0xf2b134].forEach((color, i) => {
    const x = W / 2 - 0.6 - i * 0.6;
    const bin = new THREE.Mesh(binGeo, mat(color, { roughness: 0.5 }));
    bin.position.set(x, 0.375, D / 2 + 0.35);
    const lid = new THREE.Mesh(lidGeo, M.dark);
    lid.position.set(x, 0.775, D / 2 + 0.35);
    bin.castShadow = lid.castShadow = true;
    g.add(bin, lid);
  });
  return g;
}

function toilet(W, D) {
  const g = new THREE.Group();
  const H = 2.6;
  const t = 0.15;
  g.add(block(W, H, t, M.toiletWall, 0, -D / 2 + t / 2));
  for (const s of [-1, 1]) g.add(block(t, H, D, M.toiletWall, s * (W / 2 - t / 2), 0));

  // ผนังหน้ามีประตูชาย/หญิง
  const doorW = Math.min(0.8, W / 2 - 0.3);
  const doors = [{ x: -W / 4, color: 0x4f8fe0 }, { x: W / 4, color: 0xe0709b }];
  const fz = D / 2 - t / 2;
  for (const [a, b] of segments(-W / 2, W / 2, doors.map((d) => [d.x - doorW / 2, d.x + doorW / 2]))) {
    g.add(block(b - a, 2.1, t, M.toiletWall, (a + b) / 2, fz));
  }
  g.add(block(W, H - 2.1, t, M.toiletWall, 0, fz, 2.1));
  for (const d of doors) {
    g.add(block(doorW - 0.04, 2.05, 0.05, mat(d.color, { roughness: 0.5 }), d.x, fz - 0.03));
    g.add(block(0.3, 0.3, 0.03, M.white, d.x, D / 2 + 0.01, 2.15));
    g.add(block(0.18, 0.18, 0.02, mat(d.color), d.x, D / 2 + 0.03, 2.21));
  }
  g.add(block(W + 0.2, 0.12, D + 0.2, M.roof, 0, 0, H));
  return g;
}

function door(W) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) g.add(block(0.1, DOOR_H + 0.14, 0.18, M.frame, s * (W / 2 + 0.05), 0));
  g.add(block(W + 0.2, 0.14, 0.18, M.frame, 0, 0, DOOR_H));

  const leaves = W > 1.6 ? 2 : 1;
  const lw = W / leaves;
  for (let i = 0; i < leaves; i++) {
    const x = -W / 2 + lw * (i + 0.5);
    g.add(block(lw - 0.06, DOOR_H - 0.1, 0.04, M.glass, x, 0, 0.05));
    g.add(block(lw - 0.02, 0.1, 0.06, M.frame, x, 0, 0));
    g.add(block(lw - 0.02, 0.06, 0.06, M.frame, x, 0, DOOR_H - 0.06));
    const hx = leaves === 2 && i === 1 ? x - lw / 2 + 0.12 : x + lw / 2 - 0.12;
    g.add(block(0.04, 0.5, 0.12, M.steel, hx, 0, 0.85));
  }

  // พรมเช็ดเท้าด้านใน
  const rug = floorPatch(Math.min(W, 3), 0.9, 0x4a4f57);
  rug.position.z = 0.7;
  g.add(rug);
  return g;
}

const leafGeo = new THREE.IcosahedronGeometry(1, 1);
const potGeo = new THREE.CylinderGeometry(0.28, 0.2, 0.5, 16);

function plant() {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(potGeo, M.pot);
  pot.position.y = 0.25;
  g.add(pot, block(0.06, 0.5, 0.06, M.trunk, 0, 0, 0.5));
  for (const [x, y, z, r, m] of [
    [0, 0.95, 0, 0.42, M.leaf],
    [0.18, 1.25, 0.05, 0.32, M.leafDark],
    [-0.15, 1.2, -0.08, 0.3, M.leaf],
    [0.02, 1.5, 0, 0.24, M.leafDark],
  ]) {
    const s = new THREE.Mesh(leafGeo, m);
    s.position.set(x, y, z);
    s.scale.setScalar(r);
    g.add(s);
  }
  g.traverse((o) => { o.castShadow = true; });
  return g;
}

const BUILDERS = { shop, dishes, toilet, door, plant };

// ช่วง [from, to] ที่เหลือหลังเว้นช่อง gaps ออก
function segments(from, to, gaps) {
  const out = [];
  let cur = from;
  for (const [a, b] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (a > cur) out.push([cur, Math.min(a, to)]);
    cur = Math.max(cur, b);
  }
  if (cur < to) out.push([cur, to]);
  return out;
}

function tileTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#ededf0';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// สร้างฉากทั้งหมด คืนพื้นห้องไว้ใช้หาตำแหน่งที่แตะ
export function buildScenery(scene, layout) {
  const { room } = layout;
  const cx = (room.minX + room.maxX) / 2;
  const cz = (room.minZ + room.maxZ) / 2;

  // พื้นรอบอาคารโปร่งใส ให้เห็นพื้นหลังสีพาสเทลของหน้าเว็บ เหลือแค่เงาจางๆ ของอาคาร
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  // พื้นกระเบื้องในอาคาร: ต่อจากแผ่นสี่เหลี่ยมย่อยๆ เว้นส่วนที่กำแพงเว้าเข้ามา (room.cutouts)
  const cutouts = room.cutouts ?? [];
  const xs = [...new Set([room.minX, room.maxX, ...cutouts.flatMap((c) => [c.minX, c.maxX])])].sort((a, b) => a - b);
  const zs = [...new Set([room.minZ, room.maxZ, ...cutouts.flatMap((c) => [c.minZ, c.maxZ])])].sort((a, b) => a - b);
  const pieces = [];
  for (let i = 0; i < xs.length - 1; i++) {
    for (let k = 0; k < zs.length - 1; k++) {
      const mx = (xs[i] + xs[i + 1]) / 2;
      const mz = (zs[k] + zs[k + 1]) / 2;
      if (cutouts.some((c) => mx > c.minX && mx < c.maxX && mz > c.minZ && mz < c.maxZ)) continue;
      const g = new THREE.PlaneGeometry(xs[i + 1] - xs[i], zs[k + 1] - zs[k]).rotateX(-Math.PI / 2).translate(mx, 0, mz);
      // ลายกระเบื้องตามพิกัดจริง แผ่นย่อยต่อกันจึงไม่เห็นรอย (กระเบื้อง 80 ซม.)
      const pos = g.attributes.position;
      const uv = g.attributes.uv;
      for (let n = 0; n < pos.count; n++) uv.setXY(n, (pos.getX(n) - room.minX) / 0.8, (pos.getZ(n) - room.minZ) / 0.8);
      pieces.push(g.toNonIndexed());
    }
  }
  const floorGeo = new THREE.BufferGeometry();
  floorGeo.setAttribute('position', new THREE.Float32BufferAttribute(pieces.flatMap((g) => [...g.attributes.position.array]), 3));
  floorGeo.setAttribute('normal', new THREE.Float32BufferAttribute(pieces.flatMap((g) => [...g.attributes.normal.array]), 3));
  floorGeo.setAttribute('uv', new THREE.Float32BufferAttribute(pieces.flatMap((g) => [...g.attributes.uv.array]), 2));
  const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ map: tileTexture(), roughness: 0.6 }));
  floor.receiveShadow = true;
  scene.add(floor);

  // กำแพง เว้นช่องตรงประตูที่อยู่บนแนวกำแพง
  const doors = layout.landmarks.filter((l) => l.kind === 'door');
  for (const wall of layout.walls ?? []) {
    const alongX = wall.from[1] === wall.to[1];
    const at = alongX ? wall.from[1] : wall.from[0];
    const [from, to] = alongX
      ? [Math.min(wall.from[0], wall.to[0]), Math.max(wall.from[0], wall.to[0])]
      : [Math.min(wall.from[1], wall.to[1]), Math.max(wall.from[1], wall.to[1])];
    const gaps = doors
      .filter((d) => (alongX ? Math.abs(d.z - at) < 0.5 && d.w > d.d : Math.abs(d.x - at) < 0.5 && d.d > d.w))
      .map((d) => (alongX ? [d.x - d.w / 2 - 0.1, d.x + d.w / 2 + 0.1] : [d.z - d.d / 2 - 0.1, d.z + d.d / 2 + 0.1]));
    for (const [a, b] of segments(from, to, gaps)) {
      const len = b - a;
      const mid = (a + b) / 2;
      scene.add(alongX ? block(len, WALL_H, 0.2, M.wall, mid, at) : block(0.2, WALL_H, len, M.wall, at, mid));
      scene.add(alongX ? block(len, 0.06, 0.26, M.wallCap, mid, at, WALL_H) : block(0.26, 0.06, len, M.wallCap, at, mid, WALL_H));
    }
  }

  for (const lm of layout.landmarks) {
    const build = BUILDERS[lm.kind];
    if (!build) {
      scene.add(block(lm.w, lm.h ?? 1, lm.d, mat(lm.color ?? 0xcccccc), lm.x, lm.z));
      continue;
    }
    // ประตูวางตามแนวที่ยาวกว่า ส่วนร้าน/ห้องน้ำหันหน้าตามแกน z เสมอ (ใส่ "facing" เป็นองศาเพื่อหมุนเองได้)
    const alongX = lm.kind === 'door' ? lm.w >= lm.d : true;
    const obj = build(alongX ? lm.w : lm.d, alongX ? lm.d : lm.w);
    obj.position.set(lm.x, 0, lm.z);
    // หันด้านหน้า (+z ของชิ้นงาน) เข้าหากลางห้อง
    obj.rotation.y = lm.facing != null
      ? THREE.MathUtils.degToRad(lm.facing)
      : alongX ? (cz >= lm.z ? 0 : Math.PI) : (cx >= lm.x ? Math.PI / 2 : -Math.PI / 2);
    scene.add(obj);
  }

  return floor;
}

// ความสูงของป้ายชื่อเหนือแต่ละแบบ
export const LABEL_HEIGHT = { shop: 3.0, dishes: 2.7, toilet: 3.1, door: 2.8, plant: 1.9 };

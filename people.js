import * as THREE from 'three';

// น้องชิบะหุ่นยนต์ในโรงอาหาร: นั่งกินข้าว เลียอุ้งเท้า นอนขดหลับ บิดขี้เกียจ เดินเล่น และเฝ้าโต๊ะที่เราจองไว้
// ใช้ InstancedMesh ทั้งหมด หลายร้อยตัวก็ยังลื่นบนมือถือ
// (ชื่อไฟล์/ฟังก์ชันยังเป็น people เพื่อให้ main.js เรียกได้เหมือนเดิม)

const C = (c) => new THREE.Color(c);
const EAR_IN = C('#fff1e0'); // ในหูสีครีม แบบชิบะ
const NOSE = C('#2b2030');
const EYE = C('#2b2030');
const FOOD = [C('#f4a259'), C('#e9c46a'), C('#bc4b51'), C('#8cb369'), C('#f6e7cb')];
const DRINK = [C('#e76f51'), C('#2a9d8f'), C('#f4d35e'), C('#6d597a')];
const WHITE = C('#fbfbf8');
const FACE = C('#fff4e6'); // แก้ม/ปากสีครีม
const BLUSH = C('#ffb3b8');
const SUIT = C('#f6f1ea'); // ตัวหุ่นยนต์สีขาวครีม
const JOINT = C('#4a4a50'); // ขา ข้อต่อ อุ้งเท้า สีเทาเข้ม
const PHONE = C('#9a9aa0'); // หูฟังหุ่นยนต์ข้างหัว
const GLOW = C('#ff9f0a'); // วงไฟสีส้มที่หูฟัง/ป้ายอุ้งเท้าบนอก
const TAN = C('#e8a96a');

// น้องชิบะหุ่นยนต์: หัว หู หางม้วน เป็นสีขน / ตัวเป็นชุดหุ่นยนต์ขาวครีม ขาเทาเข้ม / หูฟังมีไฟส้ม
// ลายตัว [สี, [ข้าง, หลัง, แนวกระดูกสันหลัง], ขนาด] เทียบกับขนาดตัว ใช้ได้ทั้งท่านั่งและท่าเดิน
// ลายหน้า [สี, [x, y, z], ขนาด] เทียบกับขนาดหัว (z ชี้ไปทางหน้า)
const SHIBA_FACE = [
  [FACE, [0, -0.38, 0.42], [0.86, 0.6, 0.62]], // แก้มขาวป่องๆ
  ...[1, -1].flatMap((s) => [
    [BLUSH, [0.6 * s, -0.22, 0.74], [0.17, 0.1, 0.08]], // แก้มแดง
    [PHONE, [1.0 * s, 0.02, -0.08], [0.16, 0.46, 0.46]], // หูฟัง
    [GLOW, [1.13 * s, 0.02, -0.08], [0.06, 0.26, 0.26]],
  ]),
];
function coat(o) {
  return {
    ears: [o.fur, o.fur], suit: SUIT, patch: C('#ffffff'), leg: JOINT, paw: JOINT, tail: o.fur, muzzle: FACE, eye: EYE,
    body: [[GLOW, [0, -1.15, 0.25], [0.2, 0.08, 0.2]]], // ป้ายอุ้งเท้าสีส้มกลางอก
    face: SHIBA_FACE, ...o,
  };
}
const RED = coat({ fur: C('#f39a4a') });
const FURS = [
  RED, RED, RED, // ชิบะสีแดงส้ม (เยอะสุด เหมือนน้องในรูป)
  coat({ fur: C('#f3d5aa') }), // ชิบะครีม
  coat({ fur: C('#c98a52') }), // ชิบะงา
  coat({ // ชิบะดำแทน มีคิ้วจุดสีแทน
    fur: C('#3d3539'),
    face: [...SHIBA_FACE, ...[1, -1].map((s) => [TAN, [0.36 * s, 0.36, 0.86], [0.11, 0.07, 0.06]])],
  }),
];
const GUARD = RED;

const pick = (rand, list) => list[Math.floor(rand() * list.length)];
const hash = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;
function seeded(n) {
  let s = (n % 2147483646) + 1;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 4; i++) next(); // seed ใกล้กันให้ผลต่างกันจริงๆ
  return next;
}

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const FWD = new THREE.Vector3(0, 0, 1);
const SEAT_Y = 0.47; // ความสูงที่นั่งเก้าอี้ใน main.js
const TABLE_Y = 0.77; // ความสูงท็อปโต๊ะ

export function createPeople(scene, grid, types) {
  // สีสดตลอด ไม่จางลงตอนโฟกัสโต๊ะที่จอง
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const geo = {
    ball: new THREE.SphereGeometry(1, 16, 12), // ทรงกลมหน่วยเดียว แล้วยืด/หดด้วย scale
    ear: new THREE.ConeGeometry(0.06, 0.12, 8),
    earIn: new THREE.ConeGeometry(0.034, 0.075, 8),
    leg: new THREE.CapsuleGeometry(0.045, 0.12, 3, 8).translate(0, -0.1, 0), // จุดหมุนอยู่ที่สะโพก/ไหล่
    tail: new THREE.SphereGeometry(0.085, 14, 10).scale(1, 1.1, 0.9).translate(0, 0.07, 0), // หางม้วนกลมฟูแบบชิบะ
    plate: new THREE.CylinderGeometry(0.15, 0.12, 0.025, 16),
    food: new THREE.SphereGeometry(0.095, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    cup: new THREE.CylinderGeometry(0.045, 0.038, 0.12, 10),
  };

  const group = new THREE.Group();
  scene.add(group);

  function mesh(g, n, shadow = false) {
    const m = new THREE.InstancedMesh(g, mat, Math.max(1, n));
    m.castShadow = shadow;
    m.frustumCulled = false;
    m.count = 0;
    group.add(m);
    return m;
  }
  // ชุดชิ้นส่วนแมว n ตัว
  const catMeshes = (n) => ({
    body: mesh(geo.ball, n * 2, true), // ตัว + หัว
    soft: mesh(geo.ball, n * 5), // อก อุ้งเท้า ปาก จมูก (ชิ้นเล็กไม่ต้องมีเงา)
    mark: mesh(geo.ball, n * 12), // แก้ม หูฟัง ป้ายบนอก
    eye: mesh(geo.ball, n * 2),
    ear: mesh(geo.ear, n * 2),
    earIn: mesh(geo.earIn, n * 2),
    leg: mesh(geo.leg, n * 4),
    tail: mesh(geo.tail, n),
    plate: mesh(geo.plate, n),
    food: mesh(geo.food, n),
    cup: mesh(geo.cup, n),
  });
  const dropSet = (set) => Object.values(set).forEach((m) => { group.remove(m); m.dispose(); });

  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tv = new THREE.Vector3();
  const hc = new THREE.Vector3();
  const bc = new THREE.Vector3();
  const tmpQ = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  function put(m, pos, quat, color, scale = one) {
    const i = m.count++;
    m.setMatrixAt(i, m4.compose(pos, quat, scale));
    if (color) m.setColorAt(i, color);
  }
  const flush = (set) => Object.values(set).forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  const rot = (quat, axis, angle) => quat.clone().multiply(tmpQ.setFromAxisAngle(axis, angle));
  const offset = (center, quat, x, y, z) => tv.set(x, y, z).applyQuaternion(quat).add(center);
  // ตัวช่วยวางตำแหน่งตามทิศที่แมวหันหน้า: at(fwd, y, side)
  function frame(px, pz, yaw) {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    return {
      q: new THREE.Quaternion().setFromAxisAngle(UP, yaw),
      at: (f, y, side) => v.set(px + fx * f + fz * side, y, pz + fz * f - fx * side),
    };
  }

  // หัวแมว: หัวกลม หูแหลมมีสีชมพูข้างใน ตาโต ปาก จมูกชมพู (closed = หลับตา)
  function head(set, at, f, y, cat, q, tilt = 0, closed = false) {
    const hq = rot(q, FWD, tilt);
    hc.copy(at(f, y, 0));
    const o = (x, yy, z) => offset(hc, hq, x, yy, z);
    put(set.body, hc, hq, cat.fur, sc.set(0.17, 0.15, 0.155));
    for (const [col, d, s] of cat.face) put(set.mark, o(d[0] * 0.17, d[1] * 0.15, d[2] * 0.155), hq, col, sc.set(s[0] * 0.17, s[1] * 0.15, s[2] * 0.155));
    put(set.soft, o(0, -0.04, 0.125), hq, cat.muzzle, sc.set(0.075, 0.05, 0.05));
    put(set.soft, o(0, -0.018, 0.172), hq, NOSE, sc.set(0.018, 0.014, 0.014));
    for (const s of [1, -1]) {
      put(set.eye, o(0.062 * s, 0.025, 0.128), hq, closed ? EYE : cat.eye, closed ? sc.set(0.026, 0.007, 0.02) : sc.set(0.024, 0.03, 0.02));
      const eq = rot(hq, FWD, -0.32 * s);
      put(set.ear, o(0.092 * s, 0.15, -0.01), eq, cat.ears[s > 0 ? 0 : 1]);
      put(set.earIn, o(0.09 * s, 0.142, 0.012), eq, EAR_IN);
    }
  }

  // ลายบนตัว: upright = ตัวตั้ง (ท่านั่ง) แนวกระดูกสันหลังชี้ขึ้น หลังหันไปด้านหลัง
  function bodyMarks(set, cat, center, quat, S, upright) {
    for (const [col, [ds, dd, da], [ss, sd, sa]] of cat.body) {
      const x = ds;
      const y = upright ? da : dd;
      const z = upright ? -dd : da;
      put(set.mark, offset(center, quat, x * S[0], y * S[1], z * S[2]), quat, col,
        sc.set(ss * S[0], (upright ? sa : sd) * S[1], (upright ? sd : sa) * S[2]));
    }
  }

  // ---------- ท่าต่างๆ (dy = ยกตัวขึ้นตอนกระโดดดึ๋งเวลาโดนแตะ) ----------
  const SIT = [0.2, 0.23, 0.2];
  // นั่งตั้งตรงบนเก้าอี้ (lick > 0 = ยกอุ้งเท้าขึ้นมาเลีย)
  function drawSit(set, p, dy = 0, lick = 0, time = 0) {
    const { at, q, cat } = p;
    bc.copy(at(-0.02, SEAT_Y + 0.21 + dy, 0));
    put(set.body, bc, q, cat.suit, sc.set(...SIT));
    bodyMarks(set, cat, bc, q, SIT, true);
    put(set.soft, at(0.13, SEAT_Y + 0.2 + dy, 0), q, cat.patch, sc.set(0.11, 0.14, 0.08));
    for (const k of [1, -1]) {
      if (lick && k === 1) {
        const lap = Math.sin(time * 14) * 0.022 * lick;
        put(set.soft, at(0.14 + 0.08 * lick, SEAT_Y + 0.04 + 0.38 * lick + lap + dy, 0.07 - 0.03 * lick), q, cat.paw, sc.set(0.05, 0.045, 0.05));
      } else {
        put(set.soft, at(0.14, SEAT_Y + 0.04 + dy, 0.07 * k), q, cat.paw, sc.set(0.05, 0.04, 0.06));
      }
    }
    head(set, at, 0.05 + 0.03 * lick, SEAT_Y + 0.53 + dy - 0.04 * lick, cat, lick ? rot(q, RIGHT, 0.3 * lick) : q, p.tilt * (1 - lick), lick > 0.5);
    put(set.tail, at(-0.12, SEAT_Y + 0.05 + dy, 0.13 * p.side), rot(rot(q, UP, 0.5 * p.side), RIGHT, Math.PI / 2), cat.tail);
  }

  // นอนขดหลับบนพื้น หายใจขึ้นลงช้าๆ หางพันรอบตัว
  function drawSleep(set, p, dy, time) {
    const { at, q, cat, side } = p;
    const S = [0.2, 0.12 * (1 + Math.sin(time * 2 + p.ph) * 0.06), 0.25];
    bc.copy(at(0, 0.12 + dy, 0));
    put(set.body, bc, q, cat.suit, sc.set(...S));
    bodyMarks(set, cat, bc, q, S, false);
    put(set.soft, at(0.25, 0.04 + dy, -0.07 * side), q, cat.paw, sc.set(0.05, 0.035, 0.06));
    head(set, at, 0.2, 0.15 + dy, cat, rot(q, UP, -0.5 * side), 0.45 * side, true);
    put(set.tail, at(-0.14, 0.05 + dy, 0.19 * side), rot(rot(q, UP, -0.3 * side), RIGHT, Math.PI / 2), cat.tail);
  }

  // บิดขี้เกียจ: ก้มหน้า ยืดขาหน้า ก้นโด่ง แล้วกลับมายืน วนไปเรื่อยๆ
  const WALK = [0.15, 0.14, 0.27];
  function drawStretch(set, p, dy, time) {
    const { at, q, cat } = p;
    const cyc = ((time + p.ph) % 6) / 6;
    const s = Math.pow(Math.max(0, Math.sin(cyc * Math.PI * 2)), 0.7);
    const bq = rot(q, RIGHT, 0.38 * s);
    bc.copy(at(-0.03 * s, 0.34 - 0.07 * s + dy, 0));
    put(set.body, bc, bq, cat.suit, sc.set(...WALK));
    put(set.soft, offset(bc, bq, 0, -0.05, 0.06), bq, cat.patch, sc.set(0.1, 0.08, 0.17));
    bodyMarks(set, cat, bc, bq, WALK, false);
    head(set, at, 0.3, 0.5 - 0.24 * s + dy, cat, q, 0, s > 0.6);
    for (const [f, side, front] of [[0.15, 0.08, 1], [0.15, -0.08, 1], [-0.15, 0.08, 0], [-0.15, -0.08, 0]]) {
      if (front) put(set.leg, at(f + 0.02 * s, 0.27 - 0.15 * s + dy, side), rot(q, RIGHT, -1.25 * s), cat.leg);
      else put(set.leg, at(f, 0.27 + 0.03 * s + dy, side), q, cat.leg);
    }
    put(set.tail, offset(bc, bq, 0, 0.06, -0.24), rot(rot(bq, RIGHT, -0.35 + 0.25 * s), FWD, Math.sin(time * 2) * 0.2), cat.tail); // หางชูขึ้นติดก้น
  }

  // เดินสี่ขา ก้าวสลับแบบทแยง หางชี้ขึ้นแกว่งซ้ายขวา
  function drawWalk(set, at, q, cat, step, swing, dy) {
    bc.copy(at(0, 0.34 + dy, 0));
    put(set.body, bc, q, cat.suit, sc.set(...WALK));
    put(set.soft, at(0.06, 0.29 + dy, 0), q, cat.patch, sc.set(0.1, 0.08, 0.17));
    bodyMarks(set, cat, bc, q, WALK, false);
    head(set, at, 0.3, 0.5 + dy, cat, q, Math.sin(step * 0.5) * 0.08);
    for (const [f, side, ph] of [[0.15, 0.08, 1], [0.15, -0.08, -1], [-0.15, 0.08, -1], [-0.15, -0.08, 1]]) {
      put(set.leg, at(f, 0.27 + dy, side), rot(q, RIGHT, swing * ph), cat.leg);
    }
    put(set.tail, at(-0.25, 0.4 + dy, 0), rot(rot(q, RIGHT, -0.45), FWD, Math.sin(step * 0.5) * 0.35), cat.tail);
  }

  // แมวเฝ้าโต๊ะที่จอง: หมอบบนโต๊ะ หันหน้าหากล้อง ส่ายหัวมองหาเรา กระพริบตา หางกระดิก
  const LOAF = [0.18, 0.12, 0.23];
  function drawGuard(set, p, dy, time) {
    const { at, q, cat } = p;
    bc.copy(at(0, TABLE_Y + 0.11 + dy, 0));
    put(set.body, bc, q, cat.suit, sc.set(...LOAF));
    bodyMarks(set, cat, bc, q, LOAF, false);
    put(set.soft, at(0.17, TABLE_Y + 0.1 + dy, 0), q, cat.patch, sc.set(0.1, 0.08, 0.08));
    for (const k of [1, -1]) put(set.soft, at(0.22, TABLE_Y + 0.03 + dy, 0.07 * k), q, cat.paw, sc.set(0.05, 0.035, 0.06));
    const look = Math.sin(time * 0.7) * 0.5;
    head(set, at, 0.2, TABLE_Y + 0.27 + dy, cat, rot(q, UP, look), Math.sin(time * 0.9) * 0.15, time % 3.2 < 0.15);
    put(set.tail, at(-0.2, TABLE_Y + 0.05 + dy, 0), rot(rot(q, UP, Math.sin(time * 3) * 0.7), RIGHT, -Math.PI / 2), cat.tail);
  }

  // กระโดดดึ๋งสองที ตอนโดนแตะ
  let now = 0;
  function hopDy(c) {
    if (!c.hopAt) return 0;
    const u = (now - c.hopAt) / 0.9;
    if (u >= 1 || u < 0) { c.hopAt = 0; return 0; }
    return Math.abs(Math.sin(u * Math.PI * 2)) * 0.28 * (1 - u * 0.4);
  }

  // ---------- แมวตามโต๊ะ ----------
  let seated = null; // แมวนั่งนิ่งๆ วาดครั้งเดียว
  let capacity = 0;
  let live = null; // แมวที่ขยับทุกเฟรม (เลียอุ้งเท้า หลับ บิดขี้เกียจ เฝ้าโต๊ะ)
  let liveCap = 0;
  let sitters = [];
  let movers = [];
  let spots = []; // ตำแหน่งเหนือหัวแมวที่นั่งอยู่ ไว้ให้ main.js วางป้ายคำพูด
  const hopping = new Set();

  function snapshot(set) {
    const s = {};
    for (const k in set) s[k] = set[k].count;
    return s;
  }
  // วาดแมวนิ่งตัวเดิมซ้ำที่ช่องเดิม (ตอนกระโดด) โดยไม่ต้องวาดทั้งโรงอาหารใหม่
  function redraw(set, starts, fn) {
    const saved = snapshot(set);
    for (const k in set) set[k].count = starts[k];
    fn();
    for (const k in set) set[k].count = saved[k];
    flush(set);
  }

  function floorCat(t, kind, rand) {
    // ช่องว่างระหว่างแถวโต๊ะ (หลังพนักเก้าอี้) ตัวแมวหันตามแนวแถว
    const side = rand() < 0.5 ? 1 : -1;
    const x = t.x + (rand() - 0.5) * 1.4;
    const z = t.z + side * grid.rowSpacing / 2;
    const yaw = (rand() < 0.5 ? 1 : -1) * Math.PI / 2 + (rand() - 0.5) * 0.3;
    return {
      kind, ...frame(x, z, yaw), cat: pick(rand, FURS), side: rand() < 0.5 ? 1 : -1, ph: rand() * 10,
      pos: new THREE.Vector3(x, kind === 'sleep' ? 0.28 : 0.5, z),
    };
  }

  function seat(tables, skipId) {
    const seats = tables.reduce((n, t) => n + (types[t.type] ?? types.long6).seats.length, 0);
    if (seats > capacity) {
      if (seated) dropSet(seated);
      capacity = seats;
      seated = catMeshes(seats);
    }
    for (const m of Object.values(seated)) m.count = 0;
    sitters = [];
    movers = [];
    spots = [];
    hopping.clear();

    for (const t of tables) {
      const type = types[t.type] ?? types.long6;
      const r = THREE.MathUtils.degToRad(t.rot ?? 0);
      const c = Math.cos(r);
      const s = Math.sin(r);
      if (t.id === skipId) {
        // โต๊ะที่จองไว้: ไม่มีใครนั่ง มีแมวส้มตัวเดียวหมอบเฝ้าอยู่บนโต๊ะ (หลบก้านหมุดตรงกลาง)
        const lx = Math.max(0.28, type.w / 2 - 0.45);
        const px = t.x + lx * c;
        const pz = t.z - lx * s;
        movers.push({ kind: 'guard', ...frame(px, pz, Math.PI), cat: GUARD, pos: new THREE.Vector3(px, TABLE_Y + 0.3, pz) });
        continue;
      }
      const rand = seeded(hash(t.id));
      const busy = rand(); // บางโต๊ะว่าง บางโต๊ะแน่น
      for (const [sx, sz] of type.seats) {
        if (rand() > 0.04 + busy * 0.24) continue; // เฉลี่ยราว 1 ใน 6 ของที่นั่ง โปร่งตา
        // หันหน้าเข้าหาโต๊ะ
        const lx = Math.abs(sz) >= Math.abs(sx) ? 0 : -Math.sign(sx);
        const lz = Math.abs(sz) >= Math.abs(sx) ? -Math.sign(sz) : 0;
        const px = t.x + sx * c + sz * s;
        const pz = t.z - sx * s + sz * c;
        const fx = lx * c + lz * s;
        const fz = -lx * s + lz * c;
        const p = {
          kind: 'sit', ...frame(px, pz, Math.atan2(fx, fz)), cat: pick(rand, FURS),
          tilt: (rand() - 0.5) * 0.5, side: rand() < 0.5 ? 1 : -1, ph: rand() * 10,
          pos: new THREE.Vector3(px, SEAT_Y + 0.6, pz),
        };
        spots.push(new THREE.Vector3(px, SEAT_Y + 0.78, pz));
        if (rand() < 0.22) {
          p.kind = 'lick';
          movers.push(p);
        } else {
          p.starts = snapshot(seated);
          drawSit(seated, p);
          sitters.push(p);
        }
        // จานข้าว + แก้วน้ำบนโต๊ะ
        put(seated.plate, p.at(0.55, 0.815, 0), p.q, WHITE);
        put(seated.food, p.at(0.55, 0.825, 0), p.q, pick(rand, FOOD));
        if (rand() < 0.6) put(seated.cup, p.at(0.52, 0.86, rand() < 0.5 ? 0.24 : -0.24), p.q, pick(rand, DRINK));
      }
      // แมวนอนหลับ / บิดขี้เกียจ อยู่บนพื้นระหว่างแถว
      const floor = rand();
      if (floor < 0.1) movers.push(floorCat(t, 'sleep', rand));
      else if (floor < 0.15) movers.push(floorCat(t, 'stretch', rand));
    }
    flush(seated);
    if (movers.length > liveCap) {
      if (live) dropSet(live);
      liveCap = movers.length + 8;
      live = catMeshes(liveCap);
    }
  }

  // ---------- แมวเดินสี่ขาตามทางเดิน ----------
  const rows = grid.rows;
  const front = grid.z0 - grid.rowSpacing * 0.8;
  const back = grid.z0 + (rows - 1) * grid.rowSpacing + grid.rowSpacing * 0.6;
  const rand = seeded(20251104);
  const walkers = [];
  for (let i = 0; i < 9; i++) {
    const alongX = i < 2;
    let from;
    let to;
    if (alongX) {
      // ทางเดินหน้าแถวแรก เดินขวางห้อง
      const z = front + (rand() - 0.5) * 0.4;
      from = new THREE.Vector2(grid.x0 - 1, z);
      to = new THREE.Vector2(grid.x0 + (grid.cols - 1) * grid.colSpacing + 1, z);
    } else {
      // ทางเดินระหว่างหัวโต๊ะ เดินตามยาว
      const col = 2 + Math.floor(rand() * (grid.cols - 2)); // ทางเดินแรกชิดกำแพงที่เว้าเข้ามา
      const x = grid.x0 + (col - 0.5) * grid.colSpacing;
      from = new THREE.Vector2(x, front);
      to = new THREE.Vector2(x, back);
    }
    walkers.push({
      kind: 'walk', from, to, len: from.distanceTo(to), speed: 0.45 + rand() * 0.4, phase: rand() * 2,
      cat: pick(rand, FURS), pos: new THREE.Vector3(),
    });
  }
  const walking = catMeshes(walkers.length);
  const pos2 = new THREE.Vector2();

  let prev = 0;
  function update(time) {
    const dt = Math.min(0.1, Math.max(0, time - prev));
    prev = time;
    now = time;
    if (!group.visible) return;
    for (const m of Object.values(walking)) m.count = 0;
    for (const w of walkers) {
      // เดินไป-กลับ ตามช่วงทางเดินของตัวเอง (หยุดเดินตอนกระโดด)
      const dy = hopDy(w);
      if (!dy) w.t = (w.t ?? 0) + dt;
      const k = ((w.t ?? 0) * w.speed / w.len + w.phase) % 2;
      const forward = k < 1;
      pos2.lerpVectors(w.from, w.to, forward ? k : 2 - k);
      const yaw = Math.atan2((w.to.x - w.from.x) * (forward ? 1 : -1), (w.to.y - w.from.y) * (forward ? 1 : -1));
      const { at, q } = frame(pos2.x, pos2.y, yaw);
      w.pos.set(pos2.x, 0.55, pos2.y);
      const step = (w.t ?? 0) * w.speed * 9 + w.phase * 10;
      drawWalk(walking, at, q, w.cat, step, dy ? 0 : Math.sin(step) * 0.55, dy + Math.abs(Math.cos(step)) * 0.02);
    }
    flush(walking);

    if (live) {
      for (const m of Object.values(live)) m.count = 0;
      for (const p of movers) {
        const dy = hopDy(p);
        if (p.kind === 'lick') {
          const cyc = ((time + p.ph) % 5) / 5; // เลียอุ้งเท้าสักพัก แล้ววางลง
          const lick = cyc < 0.55 ? Math.min(1, Math.sin((cyc / 0.55) * Math.PI) * 3) : 0;
          drawSit(live, p, dy, dy ? 0 : lick, time);
        } else if (p.kind === 'sleep') drawSleep(live, p, dy, time);
        else if (p.kind === 'stretch') drawStretch(live, p, dy, time);
        else if (p.kind === 'guard') drawGuard(live, p, dy, time);
      }
      flush(live);
    }

    for (const p of hopping) {
      const dy = hopDy(p);
      redraw(seated, p.starts, () => drawSit(seated, p, dy));
      if (!p.hopAt) hopping.delete(p);
    }
  }

  return {
    seat,
    update,
    setVisible(on) { group.visible = on; },
    setFocus() {}, // แมวสีสดตลอด ไม่จางตามโต๊ะ
    spots: () => (group.visible ? spots : []),
    // แมวทุกตัวที่แตะได้ (ตำแหน่งเหนือหัว)
    cats: () => (group.visible ? [...movers, ...sitters, ...walkers] : []),
    // แตะแมว: กระโดดดึ๋ง แล้วบอก main.js ว่าแมวท่าไหน อยู่ตรงไหน
    poke(c) {
      c.hopAt = now;
      if (c.starts) hopping.add(c);
      return { pos: c.pos, kind: c.kind };
    },
  };
}

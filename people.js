import * as THREE from 'three';

// แมวเหมียวสีพาสเทลในโรงอาหาร: นั่งบนเก้าอี้กินข้าว และเดินสี่ขาไปมาตามทางเดิน
// ใช้ InstancedMesh ทั้งหมด แมวหลายร้อยตัวก็ยังลื่นบนมือถือ
// (ชื่อไฟล์/ฟังก์ชันยังเป็น people เพื่อให้ main.js เรียกได้เหมือนเดิม)

const C = (c) => new THREE.Color(c);
// สีขนแมวแบบสุ่ม: สีแมวจริงปนสีพาสเทลสดใส (ไม่มีสีเขียวทีล จะได้ไม่กลืนกับโต๊ะ)
const FURS = [
  { fur: C('#f7a24b'), patch: C('#fff8ef') }, // ส้ม
  { fur: C('#ffd59e'), patch: C('#fffaf3') }, // ครีม
  { fur: C('#fffaf4'), patch: C('#ffe3cc') }, // ขาว
  { fur: C('#a9adb8'), patch: C('#ffffff') }, // เทา
  { fur: C('#4a4453'), patch: C('#ffffff') }, // ดำ
  { fur: C('#ffb3c7'), patch: C('#fff5f8') }, // ชมพู
  { fur: C('#c6b3ff'), patch: C('#fbf8ff') }, // ม่วงลาเวนเดอร์
  { fur: C('#9fd0ff'), patch: C('#f6fbff') }, // ฟ้า
  { fur: C('#ffe27a'), patch: C('#fffdf2') }, // เหลืองเนย
];
const EAR_IN = C('#ff9fb5');
const NOSE = C('#ff7f9e');
const EYE = C('#2b2030');
const FOOD = [C('#f4a259'), C('#e9c46a'), C('#bc4b51'), C('#8cb369'), C('#f6e7cb')];
const DRINK = [C('#e76f51'), C('#2a9d8f'), C('#f4d35e'), C('#6d597a')];
const WHITE = C('#fbfbf8');

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

export function createPeople(scene, grid, types) {
  // สีสดตลอด ไม่จางลงตอนโฟกัสโต๊ะที่จอง
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.7 });
  const geo = {
    ball: new THREE.SphereGeometry(1, 16, 12), // ทรงกลมหน่วยเดียว แล้วยืด/หดด้วย scale
    ear: new THREE.ConeGeometry(0.06, 0.12, 8),
    earIn: new THREE.ConeGeometry(0.034, 0.075, 8),
    leg: new THREE.CapsuleGeometry(0.045, 0.12, 3, 8).translate(0, -0.1, 0), // จุดหมุนอยู่ที่สะโพก/ไหล่
    tail: new THREE.CapsuleGeometry(0.034, 0.28, 3, 8).translate(0, 0.17, 0), // จุดหมุนที่โคนหาง
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
    eye: mesh(geo.ball, n * 2),
    ear: mesh(geo.ear, n * 2),
    earIn: mesh(geo.earIn, n * 2),
    leg: mesh(geo.leg, n * 4),
    tail: mesh(geo.tail, n),
    plate: mesh(geo.plate, n),
    food: mesh(geo.food, n),
    cup: mesh(geo.cup, n),
  });

  const m4 = new THREE.Matrix4();
  const v = new THREE.Vector3();
  const sc = new THREE.Vector3();
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

  // หัวแมว: หัวกลม หูแหลมมีสีชมพูข้างใน ตาดำโต ปากขาว จมูกชมพู
  // at(fwd, y, side) แปลงตำแหน่งตามทิศที่แมวหันหน้า เป็นตำแหน่งในโลก
  function head(set, at, f, y, cat, q, tilt = 0) {
    const hq = rot(q, FWD, tilt);
    put(set.body, at(f, y, 0), hq, cat.fur, sc.set(0.17, 0.15, 0.155));
    put(set.soft, at(f + 0.125, y - 0.04, 0), hq, cat.patch, sc.set(0.075, 0.05, 0.05));
    put(set.soft, at(f + 0.172, y - 0.018, 0), hq, NOSE, sc.set(0.018, 0.014, 0.014));
    for (const s of [1, -1]) {
      put(set.eye, at(f + 0.128, y + 0.025, 0.062 * s), hq, EYE, sc.set(0.024, 0.03, 0.02));
      const eq = rot(hq, FWD, -0.32 * s);
      put(set.ear, at(f - 0.01, y + 0.15, 0.092 * s), eq, cat.fur);
      put(set.earIn, at(f + 0.012, y + 0.142, 0.09 * s), eq, EAR_IN);
    }
  }

  // ---------- แมวนั่งบนเก้าอี้ ----------
  let seated = null;
  let capacity = 0;

  function seat(tables, skipId) {
    const seats = tables.reduce((n, t) => n + (types[t.type] ?? types.long6).seats.length, 0);
    if (seats > capacity) {
      if (seated) Object.values(seated).forEach((m) => { group.remove(m); m.dispose(); });
      capacity = seats;
      seated = catMeshes(seats);
    }
    for (const m of Object.values(seated)) m.count = 0;

    for (const t of tables) {
      if (t.id === skipId) continue; // โต๊ะที่จองไว้ปล่อยว่าง ให้เห็นหมุดชัดๆ
      const rand = seeded(hash(t.id));
      const busy = rand(); // บางโต๊ะว่าง บางโต๊ะแน่น
      const type = types[t.type] ?? types.long6;
      const r = THREE.MathUtils.degToRad(t.rot ?? 0);
      const c = Math.cos(r);
      const s = Math.sin(r);
      for (const [sx, sz] of type.seats) {
        if (rand() > 0.06 + busy * 0.34) continue; // เฉลี่ยราว 1 ใน 4 ของที่นั่ง
        // หันหน้าเข้าหาโต๊ะ
        const lx = Math.abs(sz) >= Math.abs(sx) ? 0 : -Math.sign(sx);
        const lz = Math.abs(sz) >= Math.abs(sx) ? -Math.sign(sz) : 0;
        const px = t.x + sx * c + sz * s;
        const pz = t.z - sx * s + sz * c;
        const fx = lx * c + lz * s;
        const fz = -lx * s + lz * c;
        const q = new THREE.Quaternion().setFromAxisAngle(UP, Math.atan2(fx, fz));
        const at = (f, y, side) => v.set(px + fx * f + fz * side, y, pz + fz * f - fx * side);
        const cat = pick(rand, FURS);
        const tilt = (rand() - 0.5) * 0.5; // เอียงคอนิดๆ ให้แต่ละตัวไม่เหมือนกัน

        // ตัวนั่งตั้งตรง อกขาว อุ้งเท้าหน้าสองข้าง
        put(seated.body, at(-0.02, SEAT_Y + 0.21, 0), q, cat.fur, sc.set(0.2, 0.23, 0.2));
        put(seated.soft, at(0.13, SEAT_Y + 0.2, 0), q, cat.patch, sc.set(0.11, 0.14, 0.08));
        for (const k of [1, -1]) put(seated.soft, at(0.14, SEAT_Y + 0.04, 0.07 * k), q, cat.patch, sc.set(0.05, 0.04, 0.06));
        head(seated, at, 0.05, SEAT_Y + 0.53, cat, q, tilt);
        // หางวางพาดข้างตัวบนเก้าอี้
        const side = rand() < 0.5 ? 1 : -1;
        put(seated.tail, at(-0.12, SEAT_Y + 0.05, 0.13 * side), rot(rot(q, UP, 0.5 * side), RIGHT, Math.PI / 2), cat.fur);
        // จานข้าว + แก้วน้ำบนโต๊ะ
        put(seated.plate, at(0.55, 0.815, 0), q, WHITE);
        put(seated.food, at(0.55, 0.825, 0), q, pick(rand, FOOD));
        if (rand() < 0.6) put(seated.cup, at(0.52, 0.86, rand() < 0.5 ? 0.24 : -0.24), q, pick(rand, DRINK));
      }
    }
    flush(seated);
  }

  // ---------- แมวเดินสี่ขาตามทางเดิน ----------
  const rows = grid.rows;
  const front = grid.z0 - grid.rowSpacing * 0.8;
  const back = grid.z0 + (rows - 1) * grid.rowSpacing + grid.rowSpacing * 0.6;
  const rand = seeded(20251104);
  const walkers = [];
  for (let i = 0; i < 14; i++) {
    const alongX = i < 3;
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
    walkers.push({ from, to, len: from.distanceTo(to), speed: 0.45 + rand() * 0.4, phase: rand() * 2, cat: pick(rand, FURS) });
  }
  const walking = catMeshes(walkers.length);
  const pos2 = new THREE.Vector2();

  function update(time) {
    if (!group.visible) return;
    for (const m of Object.values(walking)) m.count = 0;
    for (const w of walkers) {
      // เดินไป-กลับ ตามช่วงทางเดินของตัวเอง
      const k = (time * w.speed / w.len + w.phase) % 2;
      const forward = k < 1;
      pos2.lerpVectors(w.from, w.to, forward ? k : 2 - k);
      const dx = (w.to.x - w.from.x) * (forward ? 1 : -1);
      const dz = (w.to.y - w.from.y) * (forward ? 1 : -1);
      const yaw = Math.atan2(dx, dz);
      const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const at = (f, y, side) => v.set(pos2.x + fx * f + fz * side, y, pos2.y + fz * f - fx * side);
      const step = time * w.speed * 9 + w.phase * 10;
      const swing = Math.sin(step) * 0.55;
      const bob = Math.abs(Math.cos(step)) * 0.02;
      const cat = w.cat;

      // ตัวยาวแนวนอน ท้องขาว
      put(walking.body, at(0, 0.34 + bob, 0), q, cat.fur, sc.set(0.15, 0.14, 0.27));
      put(walking.soft, at(0.06, 0.29 + bob, 0), q, cat.patch, sc.set(0.1, 0.08, 0.17));
      head(walking, at, 0.3, 0.5 + bob, cat, q, Math.sin(step * 0.5) * 0.08);
      // ขาสี่ขา ก้าวสลับแบบทแยง
      for (const [f, side, ph] of [[0.15, 0.08, 1], [0.15, -0.08, -1], [-0.15, 0.08, -1], [-0.15, -0.08, 1]]) {
        put(walking.leg, at(f, 0.27 + bob, side), rot(q, RIGHT, swing * ph), cat.fur);
      }
      // หางชี้ขึ้น แกว่งซ้ายขวา
      put(walking.tail, at(-0.25, 0.4 + bob, 0), rot(rot(q, RIGHT, -0.45), FWD, Math.sin(step * 0.5) * 0.35), cat.fur);
    }
    flush(walking);
  }

  return {
    seat,
    update,
    setVisible(on) { group.visible = on; },
    setFocus() {}, // แมวสีสดตลอด ไม่จางตามโต๊ะ
  };
}

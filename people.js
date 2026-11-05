import * as THREE from 'three';

// สวนสัตว์จิ๋วในโรงอาหาร: แมว หมา หมี กระต่าย นั่งกินข้าวตามโต๊ะ และเดินเล่นไปมาตามทางเดิน
// ใช้ InstancedMesh ทั้งหมด สัตว์หลายร้อยตัวก็ยังลื่นบนมือถือ

const palette = (list) => list.map((c) => new THREE.Color(c));
// เสื้อสีพาสเทลสดใส (ไม่มีสีเขียวมิ้นต์ จะได้ไม่กลืนกับโต๊ะ)
const SHIRTS = palette(['#ff9fb5', '#ffd36e', '#9cc8ff', '#c7a8ff', '#ffb38a', '#ffffff']);
// สัตว์แต่ละชนิด: สีขน สีหู และแบบหู
const SPECIES = [
  { ear: 'cat', fur: palette(['#ffcf9e', '#f7b27a', '#fff3e4', '#d4d4d8']) },
  { ear: 'dog', fur: palette(['#f6dcb6', '#e2b07a', '#fff7ee']), earFur: palette(['#a8744d', '#8a5a3a']) },
  { ear: 'bear', fur: palette(['#c99670', '#a8754f', '#e8c3a0']) },
  { ear: 'bunny', fur: palette(['#fff6f1', '#f3e9ff', '#ffe6ec']) },
];
const MUZZLE = new THREE.Color('#fff4e6');
const EYE = new THREE.Color('#2b2030');
const FOOD = palette(['#f4a259', '#e9c46a', '#bc4b51', '#8cb369', '#f6e7cb']);
const DRINK = palette(['#e76f51', '#2a9d8f', '#f4d35e', '#6d597a']);
const WHITE = new THREE.Color('#fbfbf8');

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

// สุ่มสัตว์หนึ่งตัว: ชนิด สีขน สีหู สีเสื้อ
function animal(rand) {
  const sp = pick(rand, SPECIES);
  const fur = pick(rand, sp.fur);
  return { ear: sp.ear, fur, earFur: sp.earFur ? pick(rand, sp.earFur) : fur, shirt: pick(rand, SHIRTS) };
}

export function createPeople(scene, grid, types) {
  // emissive สีขาว = ทำให้คนดูจางลง ตอนโฟกัสโต๊ะที่จอง
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, emissive: 0xffffff, emissiveIntensity: 0 });
  let focus = 0;
  let focusTarget = 0;
  const geo = {
    torso: new THREE.CapsuleGeometry(0.17, 0.3, 4, 10),
    head: new THREE.SphereGeometry(0.12, 14, 10),
    eye: new THREE.SphereGeometry(0.026, 8, 6),
    muzzle: new THREE.SphereGeometry(0.07, 12, 8),
    earCat: new THREE.ConeGeometry(0.06, 0.12, 4),
    earBear: new THREE.SphereGeometry(0.055, 10, 8),
    earBunny: new THREE.CapsuleGeometry(0.035, 0.16, 3, 8).translate(0, 0.1, 0),
    earDog: new THREE.SphereGeometry(0.07, 10, 8),
    leg: new THREE.CapsuleGeometry(0.065, 0.36, 3, 6).translate(0, -0.24, 0), // จุดหมุนอยู่ที่สะโพก
    arm: new THREE.CapsuleGeometry(0.05, 0.32, 3, 6).translate(0, -0.21, 0), // จุดหมุนอยู่ที่ไหล่
    plate: new THREE.CylinderGeometry(0.15, 0.12, 0.025, 16),
    food: new THREE.SphereGeometry(0.095, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    cup: new THREE.CylinderGeometry(0.045, 0.038, 0.12, 10),
  };

  const group = new THREE.Group();
  scene.add(group);

  function mesh(g, n, shadow = true) {
    const m = new THREE.InstancedMesh(g, mat, Math.max(1, n));
    m.castShadow = shadow;
    m.frustumCulled = false;
    m.count = 0;
    group.add(m);
    return m;
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tilt = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  function put(m, pos, quat, color, scale = one) {
    const i = m.count++;
    m.setMatrixAt(i, m4.compose(pos, quat, scale));
    if (color) m.setColorAt(i, color);
  }
  const flush = (list) => list.forEach((m) => {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });


  // หัวสัตว์ตัวโต (หัวใหญ่กว่าตัว ดูน่ารัก) + หู + ตา + ปาก
  // at(y, side, fwd) คืนตำแหน่งในโลก ตามทิศที่สัตว์หันหน้า
  const HEAD = new THREE.Vector3(1.55, 1.45, 1.5);
  const MUZ = new THREE.Vector3(1, 0.75, 0.8);
  const DOG_EAR = new THREE.Vector3(0.55, 1.25, 0.9);
  const earQ = new THREE.Quaternion();
  const EAR_KEY = { cat: 'earCat', bear: 'earBear', bunny: 'earBunny', dog: 'earDog' };
  function putHead(set, at, y, a, quat) {
    put(set.head, at(y, 0, 0), quat, a.fur, HEAD);
    put(set.muzzle, at(y - 0.05, 0, 0.13), quat, MUZZLE, MUZ);
    const ears = set[EAR_KEY[a.ear]];
    for (const s of [1, -1]) {
      put(set.eye, at(y + 0.03, 0.075 * s, 0.165), quat, EYE);
      if (a.ear === 'cat') {
        earQ.setFromAxisAngle(FWD, -0.35 * s);
        put(ears, at(y + 0.17, 0.1 * s, 0), quat.clone().multiply(earQ), a.earFur);
      } else if (a.ear === 'bear') {
        put(ears, at(y + 0.15, 0.13 * s, -0.01), quat, a.earFur);
      } else if (a.ear === 'bunny') {
        earQ.setFromAxisAngle(FWD, -0.18 * s);
        put(ears, at(y + 0.13, 0.07 * s, -0.02), quat.clone().multiply(earQ), a.earFur);
      } else {
        put(ears, at(y - 0.02, 0.19 * s, 0), quat, a.earFur, DOG_EAR);
      }
    }
  }
  const headMeshes = (n) => ({
    head: mesh(geo.head, n),
    muzzle: mesh(geo.muzzle, n, false),
    eye: mesh(geo.eye, n * 2, false),
    earCat: mesh(geo.earCat, n * 2),
    earBear: mesh(geo.earBear, n * 2),
    earBunny: mesh(geo.earBunny, n * 2),
    earDog: mesh(geo.earDog, n * 2),
  });

  // ---------- สัตว์นั่งกินข้าว ----------
  let seated = null;
  let capacity = 0;

  function seat(tables, skipId) {
    const seats = tables.reduce((n, t) => n + (types[t.type] ?? types.long6).seats.length, 0);
    if (seats > capacity) {
      if (seated) Object.values(seated).forEach((m) => { group.remove(m); m.dispose(); });
      capacity = seats;
      seated = {
        torso: mesh(geo.torso, seats),
        ...headMeshes(seats),
        leg: mesh(geo.leg, seats * 2),
        arm: mesh(geo.arm, seats * 2),
        plate: mesh(geo.plate, seats, false),
        food: mesh(geo.food, seats, false),
        cup: mesh(geo.cup, seats, false),
      };
    }
    for (const m of Object.values(seated)) m.count = 0;

    for (const t of tables) {
      if (t.id === skipId) continue; // โต๊ะที่จองไว้ปล่อยว่าง ให้เห็นหมุดชัดๆ
      const rand = seeded(hash(t.id));
      const busy = rand(); // บางโต๊ะว่าง บางโต๊ะแน่น
      const type = types[t.type] ?? types.long6;
      const rot = THREE.MathUtils.degToRad(t.rot ?? 0);
      for (const [sx, sz] of type.seats) {
        if (rand() > 0.06 + busy * 0.34) continue; // เฉลี่ยราว 1 ใน 4 ของที่นั่ง
        // หันหน้าเข้าหาโต๊ะ
        const lx = Math.abs(sz) >= Math.abs(sx) ? 0 : -Math.sign(sx);
        const lz = Math.abs(sz) >= Math.abs(sx) ? -Math.sign(sz) : 0;
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        const px = t.x + sx * c + sz * s;
        const pz = t.z - sx * s + sz * c;
        const fx = lx * c + lz * s;
        const fz = -lx * s + lz * c;
        const yaw = Math.atan2(fx, fz);
        q.setFromAxisAngle(UP, yaw);
        const side = new THREE.Vector3(fz, 0, -fx);
        const at = (fwd, y, sideways = 0) => v.set(px + fx * fwd + side.x * sideways, y, pz + fz * fwd + side.z * sideways);

        const a = animal(rand);
        const lean = (rand() - 0.3) * 0.25;
        tilt.setFromAxisAngle(RIGHT, lean);
        const body = q.clone().multiply(tilt);
        put(seated.torso, at(0.02 + lean * 0.2, 0.8), body, a.shirt);
        const headFwd = 0.06 + lean * 0.5;
        putHead(seated, (y, sd, f) => at(headFwd + f, y, sd), 1.22, a, q);
        // ต้นขายื่นไปใต้โต๊ะ
        tilt.setFromAxisAngle(RIGHT, -Math.PI / 2);
        const thigh = q.clone().multiply(tilt);
        put(seated.leg, at(0, 0.52, 0.09), thigh, a.fur);
        put(seated.leg, at(0, 0.52, -0.09), thigh, a.fur);
        // แขนยื่นไปหาจาน
        tilt.setFromAxisAngle(RIGHT, -0.9 - rand() * 0.3);
        const reach = q.clone().multiply(tilt);
        put(seated.arm, at(0.05, 0.98, 0.2), reach, a.fur);
        put(seated.arm, at(0.05, 0.98, -0.2), reach, a.fur);
        // จานข้าว + แก้วน้ำ
        put(seated.plate, at(0.52, 0.815), q, WHITE);
        put(seated.food, at(0.52, 0.825), q, pick(rand, FOOD));
        if (rand() < 0.6) put(seated.cup, at(0.5, 0.86, rand() < 0.5 ? 0.24 : -0.24), q, pick(rand, DRINK));
      }
    }
    flush(Object.values(seated));
  }

  // ---------- สัตว์เดินเล่นตามทางเดิน ----------
  const rows = grid.rows;
  const front = grid.z0 - grid.rowSpacing * 0.8;
  const back = grid.z0 + (rows - 1) * grid.rowSpacing + grid.rowSpacing * 0.6;
  const rand = seeded(20251104);
  const walkers = [];
  for (let i = 0; i < 12; i++) {
    const alongX = i < 2;
    let from;
    let to;
    if (alongX) {
      // ทางเดินหน้าแถวแรก เดินขวางห้อง
      const z = front + (rand() - 0.5) * 0.3;
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
      from,
      to,
      len: from.distanceTo(to),
      speed: 0.8 + rand() * 0.5,
      phase: rand() * 2,
      a: animal(rand),
      tray: rand() < 0.4,
    });
  }
  const walking = {
    torso: mesh(geo.torso, walkers.length),
    ...headMeshes(walkers.length),
    leg: mesh(geo.leg, walkers.length * 2),
    arm: mesh(geo.arm, walkers.length * 2),
    plate: mesh(geo.plate, walkers.length, false),
    food: mesh(geo.food, walkers.length, false),
  };
  const pos2 = new THREE.Vector2();
  const swingQ = new THREE.Quaternion();

  function update(time) {
    if (!group.visible) return;
    focus += (focusTarget - focus) * 0.08;
    mat.emissiveIntensity = focus * 0.6;
    for (const m of Object.values(walking)) m.count = 0;
    for (const w of walkers) {
      // เดินไป-กลับ ตามช่วงทางเดินของตัวเอง
      const k = (time * w.speed / w.len + w.phase) % 2;
      const forward = k < 1;
      const u = forward ? k : 2 - k;
      pos2.lerpVectors(w.from, w.to, u);
      const dx = (w.to.x - w.from.x) * (forward ? 1 : -1);
      const dz = (w.to.y - w.from.y) * (forward ? 1 : -1);
      const yaw = Math.atan2(dx, dz);
      q.setFromAxisAngle(UP, yaw);
      const step = time * w.speed * 6 + w.phase * 10;
      const swing = Math.sin(step) * 0.5;
      const bob = Math.abs(Math.cos(step)) * 0.035;
      const sx = Math.cos(yaw);
      const sz = -Math.sin(yaw);
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const at = (y, side = 0, fwd = 0) => v.set(pos2.x + sx * side + fx * fwd, y, pos2.y + sz * side + fz * fwd);

      const a = w.a;
      put(walking.torso, at(1.08 + bob), q, a.shirt);
      putHead(walking, at, 1.5 + bob, a, q);
      for (const s of [1, -1]) {
        swingQ.setFromAxisAngle(RIGHT, swing * s);
        put(walking.leg, at(0.84 + bob, 0.09 * s), q.clone().multiply(swingQ), a.fur);
      }
      if (w.tray) {
        // ถือจานข้าวด้วยสองมือ
        swingQ.setFromAxisAngle(RIGHT, -1.2);
        for (const s of [1, -1]) put(walking.arm, at(1.28 + bob, 0.21 * s), q.clone().multiply(swingQ), a.fur);
        put(walking.plate, at(1.06 + bob, 0, 0.36), q, WHITE);
        put(walking.food, at(1.07 + bob, 0, 0.36), q, FOOD[0]);
      } else {
        for (const s of [1, -1]) {
          swingQ.setFromAxisAngle(RIGHT, -swing * s * 0.8);
          put(walking.arm, at(1.28 + bob, 0.21 * s), q.clone().multiply(swingQ), a.fur);
        }
      }
    }
    flush(Object.values(walking));
  }

  return {
    seat,
    update,
    setVisible(on) { group.visible = on; },
    setFocus(on) { focusTarget = on ? 1 : 0; },
  };
}

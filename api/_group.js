// โต๊ะของกลุ่ม: ใครในกลุ่มก็เปลี่ยนโต๊ะได้ ทุกคนเห็นโต๊ะเดียวกัน
// เก็บใน Upstash Redis (ต่อจาก Vercel → Storage → Upstash for Redis แล้วจะได้ env มาเอง)
// แยกตรรกะจาก handler ให้ทดสอบได้โดยไม่ต้องมีเซิร์ฟเวอร์ (ไฟล์ขึ้นต้นด้วย _ ไม่เป็น endpoint)

const GROUP_RE = /^[a-z0-9]{6,16}$/;
const TABLE_RE = /^\d{1,2}-\d{1,2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEEP_SECONDS = 60 * 60 * 24 * 60; // กลุ่มที่ไม่มีใครแตะเลย 60 วันจะหายไปเอง
const PHOTO_SECONDS = 60 * 60 * 18; // รูปโต๊ะใช้แค่วันนั้น ลบเองหลัง 18 ชม.
const PHOTO_MAX = 400_000; // รูป JPEG ที่ย่อในเครื่องแล้ว (base64) ไม่เกินราว 300 KB
const PHOTO_RE = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;

function redisConfig(env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ''), token } : null;
}

async function redis(config, command, fetchImpl) {
  const res = await fetchImpl(config.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return (await res.json()).result;
}

const empty = { table: null, date: null, by: '', at: 0 };
const cleanName = (name, max = 20) => String(name ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);

// GET: { g }  → โต๊ะล่าสุดของกลุ่ม
// POST: { g, table, date, by } → ตั้งโต๊ะใหม่ (table = null คือยกเลิก)
// POST: { g, meal, date }      → เมนูที่สุ่มได้วันนี้ (เก็บแยก key ไม่ไปทับโต๊ะ)
// GET:  { g, photo: 1 }         → รูปโต๊ะของวันนี้ (แยกจาก GET ปกติ เพราะรูปใหญ่ ไม่ให้ดึงทุกครั้งที่เช็ก)
// POST: { g, photo, table, date } → ตั้งรูปโต๊ะ (photo = null คือลบรูป)
export async function handleGroup(method, input, env, fetchImpl = fetch) {
  const config = redisConfig(env);
  if (!config) return { status: 503, body: { error: 'not-configured' } };

  const g = String(input.g ?? '');
  if (!GROUP_RE.test(g)) return { status: 400, body: { error: 'bad-group' } };
  const key = `torim:group:${g}`;
  const mealKey = `torim:meal:${g}`;
  const photoKey = `torim:photo:${g}`;
  const photoMetaKey = `torim:photometa:${g}`;

  try {
    if (method === 'GET' && input.photo) {
      const raw = await redis(config, ['GET', photoKey], fetchImpl);
      return { status: 200, body: { photo: raw ? JSON.parse(raw) : null } };
    }
    if (method === 'GET') {
      const [raw, rawMeal, rawPhoto] = await redis(config, ['MGET', key, mealKey, photoMetaKey], fetchImpl);
      const meal = rawMeal ? JSON.parse(rawMeal) : null;
      const photo = rawPhoto ? JSON.parse(rawPhoto) : null; // แค่ { table, date, at } ไม่มีตัวรูป
      return { status: 200, body: { ...empty, ...(raw ? JSON.parse(raw) : {}), meal, photo } };
    }

    if ('photo' in input) {
      const date = String(input.date ?? '');
      if (!DATE_RE.test(date)) return { status: 400, body: { error: 'bad-date' } };
      if (input.photo === null) {
        const meta = { table: null, date, at: Date.now() };
        await redis(config, ['DEL', photoKey], fetchImpl);
        await redis(config, ['SET', photoMetaKey, JSON.stringify(meta), 'EX', PHOTO_SECONDS], fetchImpl);
        return { status: 200, body: { photo: meta } };
      }
      const data = String(input.photo);
      const table = String(input.table ?? '');
      if (data.length > PHOTO_MAX) return { status: 413, body: { error: 'photo-too-big' } };
      if (!PHOTO_RE.test(data)) return { status: 400, body: { error: 'bad-photo' } };
      if (!TABLE_RE.test(table)) return { status: 400, body: { error: 'bad-table' } };
      const meta = { table, date, at: Date.now() };
      await redis(config, ['SET', photoKey, JSON.stringify({ ...meta, data }), 'EX', PHOTO_SECONDS], fetchImpl);
      await redis(config, ['SET', photoMetaKey, JSON.stringify(meta), 'EX', PHOTO_SECONDS], fetchImpl);
      return { status: 200, body: { photo: meta } };
    }

    if ('meal' in input) {
      const name = cleanName(input.meal, 40);
      const date = String(input.date ?? '');
      if (!name) return { status: 400, body: { error: 'bad-meal' } };
      if (!DATE_RE.test(date)) return { status: 400, body: { error: 'bad-date' } };
      const meal = { name, date, at: Date.now() };
      await redis(config, ['SET', mealKey, JSON.stringify(meal), 'EX', KEEP_SECONDS], fetchImpl);
      return { status: 200, body: { meal } };
    }

    const table = input.table == null ? null : String(input.table);
    if (table !== null && !TABLE_RE.test(table)) return { status: 400, body: { error: 'bad-table' } };
    const date = String(input.date ?? '');
    if (!DATE_RE.test(date)) return { status: 400, body: { error: 'bad-date' } };

    const state = { table, date, by: cleanName(input.by), at: Date.now() };
    await redis(config, ['SET', key, JSON.stringify(state), 'EX', KEEP_SECONDS], fetchImpl);
    return { status: 200, body: state };
  } catch {
    return { status: 502, body: { error: 'storage-failed' } };
  }
}

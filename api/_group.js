// โต๊ะของกลุ่ม: ใครในกลุ่มก็เปลี่ยนโต๊ะได้ ทุกคนเห็นโต๊ะเดียวกัน
// เก็บใน Upstash Redis (ต่อจาก Vercel → Storage → Upstash for Redis แล้วจะได้ env มาเอง)
// แยกตรรกะจาก handler ให้ทดสอบได้โดยไม่ต้องมีเซิร์ฟเวอร์ (ไฟล์ขึ้นต้นด้วย _ ไม่เป็น endpoint)

const GROUP_RE = /^[a-z0-9]{6,16}$/;
const TABLE_RE = /^\d{1,2}-\d{1,2}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEEP_SECONDS = 60 * 60 * 24 * 60; // กลุ่มที่ไม่มีใครแตะเลย 60 วันจะหายไปเอง

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
export async function handleGroup(method, input, env, fetchImpl = fetch) {
  const config = redisConfig(env);
  if (!config) return { status: 503, body: { error: 'not-configured' } };

  const g = String(input.g ?? '');
  if (!GROUP_RE.test(g)) return { status: 400, body: { error: 'bad-group' } };
  const key = `torim:group:${g}`;
  const mealKey = `torim:meal:${g}`;

  try {
    if (method === 'GET') {
      const [raw, rawMeal] = await redis(config, ['MGET', key, mealKey], fetchImpl);
      const meal = rawMeal ? JSON.parse(rawMeal) : null;
      return { status: 200, body: { ...empty, ...(raw ? JSON.parse(raw) : {}), meal } };
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

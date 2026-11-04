import { toJson } from '../layout-format.js';

// ตรรกะการบันทึกผังโต๊ะขึ้น GitHub แยกออกมาจากตัว handler ให้ทดสอบได้โดยไม่ต้องมีเซิร์ฟเวอร์
// (ไฟล์ที่ขึ้นต้นด้วย _ ในโฟลเดอร์ api จะไม่ถูกเปิดเป็น endpoint บน Vercel)

const TABLE_TYPES = new Set(['long6', 'square4']); // ต้องตรงกับ TYPES ใน main.js

const enc = new TextEncoder();

// เทียบรหัสผ่านโดยใช้เวลาเท่ากันทุกครั้ง ไม่ให้เดารหัสจากเวลาตอบได้
async function samePassword(given, expected) {
  const [a, b] = await Promise.all([given, expected].map(async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))));
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const fromBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, '')), (c) => c.charCodeAt(0)));

function toBase64(text) {
  const bytes = enc.encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// รับเฉพาะโต๊ะที่อยู่ในตารางผัง แบบที่รู้จัก และไม่ซ้ำช่อง แล้วจัดรูปให้สะอาด
function cleanTables(tables, grid) {
  if (!Array.isArray(tables) || tables.length > grid.cols * grid.rows) return null;
  const seen = new Set();
  const out = [];
  for (const t of tables) {
    if (!t || !Number.isInteger(t.col) || !Number.isInteger(t.row)) return null;
    if (t.col < 1 || t.row < 1 || t.col > grid.cols || t.row > grid.rows) return null;
    if (!TABLE_TYPES.has(t.type)) return null;
    if (t.rot !== undefined && t.rot !== 0 && t.rot !== 90) return null;
    const key = `${t.col}-${t.row}`;
    if (seen.has(key)) return null;
    seen.add(key);
    out.push({ col: t.col, row: t.row, type: t.type, ...(t.rot === 90 ? { rot: 90 } : {}) });
  }
  return out.sort((a, b) => a.row - b.row || a.col - b.col);
}

// คืน { status, body } — body ส่งกลับไปให้หน้าเว็บเป็น JSON
export async function saveLayout({ password, tables } = {}, env = {}, fetchImpl = fetch) {
  if (!env.GITHUB_TOKEN || !env.ADMIN_PASSWORD) return { status: 503, body: { error: 'not-configured' } };
  if (typeof password !== 'string' || !(await samePassword(password, env.ADMIN_PASSWORD))) {
    return { status: 401, body: { error: 'wrong-password' } };
  }

  const repo = env.GITHUB_REPO || 'pokemobb/to_rim';
  const branch = env.GITHUB_BRANCH || 'main';
  const url = `https://api.github.com/repos/${repo}/contents/layout.json`;
  const headers = {
    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'torim-layout-saver',
  };

  // อ่านไฟล์ปัจจุบันก่อน แล้วแทนแค่ส่วน tables (ห้อง กำแพง ร้านค้า ไม่ให้แก้ผ่านหน้าเว็บ)
  const current = await fetchImpl(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
  if (!current.ok) return { status: 502, body: { error: 'github-read', detail: current.status } };
  const file = await current.json();
  const layout = JSON.parse(fromBase64(file.content));

  const clean = cleanTables(tables, layout.grid);
  if (!clean) return { status: 400, body: { error: 'invalid-tables' } };
  layout.tables = clean;

  const put = await fetchImpl(url, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'อัปเดตผังโต๊ะจากโหมดแอดมิน',
      content: toBase64(toJson(layout)),
      sha: file.sha,
      branch,
    }),
  });
  if (!put.ok) return { status: put.status === 409 ? 409 : 502, body: { error: 'github-write', detail: put.status } };
  const result = await put.json();
  return { status: 200, body: { ok: true, commit: result.commit?.html_url ?? null, tables: clean } };
}

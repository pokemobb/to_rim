import { saveLayout } from './_core.js';

// POST /api/save-layout  { password, tables }
// ต้องตั้ง Environment Variables บน Vercel: GITHUB_TOKEN, ADMIN_PASSWORD (ดูวิธีใน README)
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method-not-allowed' });
  }

  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
  } catch {
    return res.status(400).json({ error: 'bad-json' });
  }

  const { status, body: out } = await saveLayout(body, process.env);
  // รหัสผิดให้รอนิดหนึ่ง กันการสุ่มเดารหัสรัวๆ
  if (status === 401) await new Promise((r) => setTimeout(r, 800));
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(out);
}

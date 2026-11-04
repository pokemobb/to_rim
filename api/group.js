import { handleGroup } from './_group.js';

// GET  /api/group?g=<กลุ่ม>              → โต๊ะของกลุ่มตอนนี้
// POST /api/group  { g, table, date, by } → เปลี่ยนโต๊ะของกลุ่ม
export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method-not-allowed' });
  }

  let input = req.query ?? {};
  if (req.method === 'POST') {
    try {
      input = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
    } catch {
      return res.status(400).json({ error: 'bad-json' });
    }
  }

  const { status, body } = await handleGroup(req.method, input, process.env);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

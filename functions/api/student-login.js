const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }
});

function toBase64Url(bytes) {
  let binary = '';
  bytes.forEach(byte => binary += String.fromCharCode(byte));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sign(payload, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return toBase64Url(new Uint8Array(signature));
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ message: 'قاعدة البيانات غير مربوطة بعد.' }, 503);
  if (!env.SESSION_SECRET) return json({ message: 'إعدادات الجلسة غير مكتملة لدى مسؤول الموقع.' }, 503);
  let input;
  try { input = await request.json(); } catch { return json({ message: 'بيانات الطلب غير صحيحة.' }, 400); }
  const name = String(input.name || '').trim();
  const phone = String(input.phone || '').replace(/[\s-]/g, '');
  const studentCode = String(input.studentCode || '').trim();
  if (!name || !phone || !studentCode) return json({ message: 'يرجى إدخال البيانات الثلاثة.' }, 400);
  if (name.length > 120 || phone.length > 25 || studentCode.length > 80) return json({ message: 'بعض البيانات أطول من المسموح.' }, 400);

  const student = await env.DB.prepare(
    'SELECT id, full_name, student_code, group_id FROM students WHERE full_name = ? COLLATE NOCASE AND phone = ? AND student_code = ? AND is_active = 1 LIMIT 1'
  ).bind(name, phone, studentCode).first();
  if (!student) return json({ message: 'البيانات غير متطابقة أو الحساب غير مفعل. راجع الإدارة.' }, 401);

  const sessionData = { sub: student.id, name: student.full_name, code: student.student_code, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 8 };
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify(sessionData)));
  const token = `${payload}.${await sign(payload, env.SESSION_SECRET)}`;
  const cookie = `student_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=28800`;
  return json({ ok: true, message: 'تم التحقق من بياناتك بنجاح.' }, 200, { 'Set-Cookie': cookie });
}

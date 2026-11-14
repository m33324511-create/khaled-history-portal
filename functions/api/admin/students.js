import { json, requireAdmin, sameOrigin } from "../../_lib/auth.js";

const clean = value => String(value ?? "").trim();
async function audit(env, admin, action, targetId, details = {}) {
  await env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), admin.id, action, "student", targetId, JSON.stringify(details)).run();
}
async function groupExists(env, groupId) {
  if (!groupId) return true;
  return !!(await env.DB.prepare("SELECT id FROM study_groups WHERE id=?").bind(groupId).first());
}
export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ message: "يلزم تسجيل دخول الإدارة." }, 401);
  const url = new URL(request.url);
  const q = clean(url.searchParams.get("q")).slice(0, 100);
  const status = url.searchParams.get("status") === "all" ? "all" : "active";
  const search = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
  const where = status === "all" ? "" : " AND s.is_active=1";
  const result = await env.DB.prepare(
    "SELECT s.id,s.full_name,s.phone,s.student_code,s.group_id,s.is_active,s.created_at,g.name AS group_name FROM students s LEFT JOIN study_groups g ON g.id=s.group_id WHERE (s.full_name LIKE ? ESCAPE '\\' OR s.phone LIKE ? ESCAPE '\\' OR s.student_code LIKE ? ESCAPE '\\')" + where + " ORDER BY s.created_at DESC LIMIT 500"
  ).bind(search, search, search).all();
  const groups = await env.DB.prepare("SELECT id,name FROM study_groups WHERE is_active=1 ORDER BY name").all();
  return json({ students: result.results || [], groups: groups.results || [] });
}
export async function onRequestPost({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ message: "يلزم تسجيل دخول الإدارة." }, 401);
  if (!sameOrigin(request)) return json({ message: "طلب غير مسموح." }, 403);
  let body; try { body = await request.json(); } catch { return json({ message: "بيانات غير صحيحة." }, 400); }
  const fullName = clean(body.full_name), phone = clean(body.phone), studentCode = clean(body.student_code), groupId = clean(body.group_id);
  if (fullName.length < 3 || fullName.length > 120) return json({ message: "اسم الطالب يجب أن يكون بين 3 و120 حرفًا." }, 400);
  if (phone.length < 6 || phone.length > 30) return json({ message: "أدخل رقم هاتف صحيحًا." }, 400);
  if (!/^[A-Za-z0-9_-]{2,40}$/.test(studentCode)) return json({ message: "الرقم التعريفي يجب أن يتكون من 2 إلى 40 حرفًا أو رقمًا، دون مسافات." }, 400);
  if (!(await groupExists(env, groupId))) return json({ message: "المجموعة المحددة غير موجودة أو غير مفعّلة." }, 400);
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare("INSERT INTO students (id,full_name,phone,student_code,group_id) VALUES (?,?,?,?,?)")
      .bind(id, fullName, phone, studentCode, groupId || null).run();
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error))) return json({ message: "هذا الرقم التعريفي مستخدم بالفعل." }, 409);
    throw error;
  }
  await audit(env, admin, "student_created", id, { student_code: studentCode });
  return json({ ok: true, id }, 201);
}
export async function onRequestPut({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ message: "يلزم تسجيل دخول الإدارة." }, 401);
  if (!sameOrigin(request)) return json({ message: "طلب غير مسموح." }, 403);
  let body; try { body = await request.json(); } catch { return json({ message: "بيانات غير صحيحة." }, 400); }
  const id = clean(body.id), fullName = clean(body.full_name), phone = clean(body.phone), studentCode = clean(body.student_code), groupId = clean(body.group_id);
  if (!id) return json({ message: "معرّف الطالب غير موجود." }, 400);
  if (body.is_active !== undefined && body.full_name === undefined) {
    const active = body.is_active ? 1 : 0;
    const result = await env.DB.prepare("UPDATE students SET is_active=? WHERE id=?").bind(active, id).run();
    if (!result.meta?.changes) return json({ message: "الطالب غير موجود." }, 404);
    await audit(env, admin, active ? "student_activated" : "student_deactivated", id);
    return json({ ok: true });
  }
  if (fullName.length < 3 || fullName.length > 120 || phone.length < 6 || phone.length > 30 || !/^[A-Za-z0-9_-]{2,40}$/.test(studentCode))
    return json({ message: "راجع الاسم ورقم الهاتف والرقم التعريفي." }, 400);
  if (!(await groupExists(env, groupId))) return json({ message: "المجموعة المحددة غير موجودة أو غير مفعّلة." }, 400);
  try {
    const result = await env.DB.prepare("UPDATE students SET full_name=?,phone=?,student_code=?,group_id=? WHERE id=?")
      .bind(fullName, phone, studentCode, groupId || null, id).run();
    if (!result.meta?.changes) return json({ message: "الطالب غير موجود." }, 404);
  } catch (error) {
    if (/UNIQUE|constraint/i.test(String(error))) return json({ message: "هذا الرقم التعريفي مستخدم بالفعل." }, 409);
    throw error;
  }
  await audit(env, admin, "student_updated", id, { student_code: studentCode });
  return json({ ok: true });
}
export async function onRequestDelete({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (!admin) return json({ message: "يلزم تسجيل دخول الإدارة." }, 401);
  if (!sameOrigin(request)) return json({ message: "طلب غير مسموح." }, 403);
  const id = clean(new URL(request.url).searchParams.get("id"));
  if (!id) return json({ message: "معرّف الطالب غير موجود." }, 400);
  const result = await env.DB.prepare("UPDATE students SET is_active=0 WHERE id=?").bind(id).run();
  if (!result.meta?.changes) return json({ message: "الطالب غير موجود." }, 404);
  await audit(env, admin, "student_deactivated", id);
  return json({ ok: true, preserved: true });
}

import { json, requireAdmin, sameOrigin } from "../../_lib/auth.js";

const clean = value => String(value ?? "").trim();
async function audit(env, admin, action, targetId, details = {}) {
  await env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), admin.id, action, "study_group", targetId, JSON.stringify(details)).run();
}
async function getAdmin(request, env) {
  const admin = await requireAdmin(request, env);
  return admin || null;
}
export async function onRequestGet({ request, env }) {
  const admin = await getAdmin(request, env);
  if (!admin) return json({ message: "يلزم تسجيل دخول الإدارة." }, 401);
  const url = new URL(request.url);
  const q = clean(url.searchParams.get("q")).slice(0, 100);
  const status = url.searchParams.get("status") || "all";
  const where = status === "active" ? "WHERE g.is_active=1" : status === "inactive" ? "WHERE g.is_active=0" : "";
  const result = await env.DB.prepare(
    "SELECT g.id,g.name,g.description,g.is_active,g.created_at,COUNT(s.id) AS student_count FROM study_groups g LEFT JOIN students s ON s.group_id=g.id " +
    where + " GROUP BY g.id ORDER BY g.is_active DESC,g.name COLLATE NOCASE LIMIT 300"
  ).all();
  const groups = (result.results || []).filter(g => !q || g.name.toLowerCase().includes(q.toLowerCase()) || String(g.description || "").toLowerCase().includes(q.toLowerCase()));
  return json({ groups });
}
export async function onRequestPost({ request, env }) {
  const admin = await getAdmin(request, env);
  if (!admin) return json({ message: "يلزم تسجيل دخول الإدارة." }, 401);
  if (!sameOrigin(request)) return json({ message: "طلب غير مسموح." }, 403);
  let body; try { body = await request.json(); } catch { return json({ message: "بيانات غير صحيحة." }, 400); }
  const name = clean(body.name), description = clean(body.description);
  if (name.length < 2 || name.length > 80) return json({ message: "اسم المجموعة يجب أن يكون بين حرفين و80 حرفًا." }, 400);
  if (description.length > 500) return json({ message: "وصف المجموعة طويل جدًا (الحد 500 حرف)." }, 400);
  const duplicate = await env.DB.prepare("SELECT id FROM study_groups WHERE name=? COLLATE NOCASE LIMIT 1").bind(name).first();
  if (duplicate) return json({ message: "اسم المجموعة مستخدم بالفعل." }, 409);
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO study_groups (id,name,description) VALUES (?,?,?)").bind(id, name, description || null).run();
  await audit(env, admin, "study_group_created", id, { name });
  return json({ ok: true, id }, 201);
}
export async function onRequestPut({ request, env }) {
  const admin = await getAdmin(request, env);
  if (!admin) return json({ message: "يلزم تسجيل دخول الإدارة." }, 401);
  if (!sameOrigin(request)) return json({ message: "طلب غير مسموح." }, 403);
  let body; try { body = await request.json(); } catch { return json({ message: "بيانات غير صحيحة." }, 400); }
  const id = clean(body.id);
  if (!id) return json({ message: "معرّف المجموعة غير موجود." }, 400);
  const current = await env.DB.prepare("SELECT id,name FROM study_groups WHERE id=?").bind(id).first();
  if (!current) return json({ message: "المجموعة غير موجودة." }, 404);
  if (body.is_active !== undefined && body.name === undefined) {
    const active = body.is_active ? 1 : 0;
    await env.DB.prepare("UPDATE study_groups SET is_active=? WHERE id=?").bind(active, id).run();
    await audit(env, admin, active ? "study_group_activated" : "study_group_deactivated", id, { name: current.name });
    return json({ ok: true, preserved_students: true });
  }
  const name = clean(body.name), description = clean(body.description);
  if (name.length < 2 || name.length > 80) return json({ message: "اسم المجموعة يجب أن يكون بين حرفين و80 حرفًا." }, 400);
  if (description.length > 500) return json({ message: "وصف المجموعة طويل جدًا (الحد 500 حرف)." }, 400);
  const duplicate = await env.DB.prepare("SELECT id FROM study_groups WHERE name=? COLLATE NOCASE AND id<>? LIMIT 1").bind(name, id).first();
  if (duplicate) return json({ message: "اسم المجموعة مستخدم بالفعل." }, 409);
  await env.DB.prepare("UPDATE study_groups SET name=?,description=? WHERE id=?").bind(name, description || null, id).run();
  await audit(env, admin, "study_group_updated", id, { name });
  return json({ ok: true });
}
export async function onRequestDelete({ request, env }) {
  const admin = await getAdmin(request, env);
  if (!admin) return json({ message: "يلزم تسجيل دخول الإدارة." }, 401);
  if (!sameOrigin(request)) return json({ message: "طلب غير مسموح." }, 403);
  const id = clean(new URL(request.url).searchParams.get("id"));
  if (!id) return json({ message: "معرّف المجموعة غير موجود." }, 400);
  const group = await env.DB.prepare("SELECT id,name FROM study_groups WHERE id=?").bind(id).first();
  if (!group) return json({ message: "المجموعة غير موجودة." }, 404);
  await env.DB.prepare("UPDATE study_groups SET is_active=0 WHERE id=?").bind(id).run();
  await audit(env, admin, "study_group_deactivated", id, { name: group.name });
  return json({ ok: true, preserved_students: true });
}

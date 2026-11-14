import { json, requireAdmin, sameOrigin } from "../../_lib/auth.js";

const grades = new Set(["الصف الأول الثانوي","الصف الثاني الثانوي","الصف الثالث الثانوي"]);
const clean = value => String(value ?? "").trim();
function photoValid(value) {
  if (!value) return true;
  if (value.length > 1500) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  try { const url = new URL(value); return url.protocol === "https:"; } catch { return false; }
}
async function audit(env, admin, action, id, details = {}) {
  await env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), admin.id, action, "honor_student", id, JSON.stringify(details)).run();
}
async function getAdmin(request, env) {
  const admin = await requireAdmin(request, env);
  return admin || null;
}
export async function onRequestGet({ request, env }) {
  const admin = await getAdmin(request, env);
  if (!admin) return json({ message: "يلزم تسجيل دخول الإدارة." }, 401);
  const result = await env.DB.prepare(
    "SELECT h.id,h.full_name,h.grade,h.group_id,h.achievement,h.photo_url,h.is_active,h.sort_order,h.created_at,g.name AS group_name FROM honor_students h LEFT JOIN study_groups g ON g.id=h.group_id ORDER BY h.is_active DESC,CASE h.grade WHEN 'الصف الأول الثانوي' THEN 1 WHEN 'الصف الثاني الثانوي' THEN 2 ELSE 3 END,h.sort_order,h.created_at DESC"
  ).all();
  const groups = await env.DB.prepare("SELECT id,name FROM study_groups ORDER BY is_active DESC,name").all();
  return json({ students: result.results || [], groups: groups.results || [] });
}
export async function onRequestPost({ request, env }) {
  const admin = await getAdmin(request, env);
  if (!admin) return json({ message: "يلزم تسجيل دخول الإدارة." }, 401);
  if (!sameOrigin(request)) return json({ message: "طلب غير مسموح." }, 403);
  let body; try { body = await request.json(); } catch { return json({ message: "بيانات غير صحيحة." }, 400); }
  const fullName=clean(body.full_name), grade=clean(body.grade), groupId=clean(body.group_id), achievement=clean(body.achievement), photo=clean(body.photo_url), sort=Number(body.sort_order||0);
  if(fullName.length<3||fullName.length>120) return json({message:"اسم الطالب يجب أن يكون بين 3 و120 حرفًا."},400);
  if(!grades.has(grade)) return json({message:"اختر الصف الأول أو الثاني أو الثالث الثانوي."},400);
  if(achievement.length>1000) return json({message:"وصف الإنجاز طويل جدًا."},400);
  if(!photoValid(photo)) return json({message:"رابط الصورة يجب أن يبدأ بـ https:// أو يكون مسارًا محليًا يبدأ بـ /."},400);
  if(!Number.isInteger(sort)||sort<0||sort>9999) return json({message:"ترتيب العرض غير صحيح."},400);
  if(groupId && !(await env.DB.prepare("SELECT id FROM study_groups WHERE id=?").bind(groupId).first())) return json({message:"المجموعة المحددة غير موجودة."},400);
  const id=crypto.randomUUID();
  await env.DB.prepare("INSERT INTO honor_students (id,full_name,grade,group_id,achievement,photo_url,sort_order) VALUES (?,?,?,?,?,?,?)")
    .bind(id,fullName,grade,groupId||null,achievement||null,photo||null,sort).run();
  await audit(env,admin,"honor_student_created",id,{full_name:fullName,grade});
  return json({ok:true,id},201);
}
export async function onRequestPut({ request, env }) {
  const admin = await getAdmin(request, env);
  if (!admin) return json({ message: "يلزم تسجيل دخول الإدارة." }, 401);
  if (!sameOrigin(request)) return json({ message: "طلب غير مسموح." }, 403);
  let body; try { body = await request.json(); } catch { return json({ message: "بيانات غير صحيحة." }, 400); }
  const id=clean(body.id);
  if(!id) return json({message:"معرّف الطالب غير موجود."},400);
  if(body.is_active!==undefined && body.full_name===undefined) {
    const active=body.is_active?1:0;
    const result=await env.DB.prepare("UPDATE honor_students SET is_active=?,updated_at=datetime('now') WHERE id=?").bind(active,id).run();
    if(!result.meta?.changes) return json({message:"الطالب غير موجود في لائحة الشرف."},404);
    await audit(env,admin,active?"honor_student_activated":"honor_student_deactivated",id);
    return json({ok:true});
  }
  const fullName=clean(body.full_name),grade=clean(body.grade),groupId=clean(body.group_id),achievement=clean(body.achievement),photo=clean(body.photo_url),sort=Number(body.sort_order||0);
  if(fullName.length<3||fullName.length>120||!grades.has(grade)) return json({message:"راجع اسم الطالب والصف الدراسي."},400);
  if(achievement.length>1000||!photoValid(photo)||!Number.isInteger(sort)||sort<0||sort>9999) return json({message:"راجع وصف الإنجاز ورابط الصورة وترتيب العرض."},400);
  if(groupId && !(await env.DB.prepare("SELECT id FROM study_groups WHERE id=?").bind(groupId).first())) return json({message:"المجموعة المحددة غير موجودة."},400);
  const result=await env.DB.prepare("UPDATE honor_students SET full_name=?,grade=?,group_id=?,achievement=?,photo_url=?,sort_order=?,updated_at=datetime('now') WHERE id=?")
    .bind(fullName,grade,groupId||null,achievement||null,photo||null,sort,id).run();
  if(!result.meta?.changes) return json({message:"الطالب غير موجود في لائحة الشرف."},404);
  await audit(env,admin,"honor_student_updated",id,{full_name:fullName,grade});
  return json({ok:true});
}
export async function onRequestDelete({ request, env }) {
  const admin = await getAdmin(request, env);
  if (!admin) return json({ message: "يلزم تسجيل دخول الإدارة." }, 401);
  if (!sameOrigin(request)) return json({ message: "طلب غير مسموح." }, 403);
  const id=clean(new URL(request.url).searchParams.get("id"));
  if(!id) return json({message:"معرّف الطالب غير موجود."},400);
  const existing=await env.DB.prepare("SELECT full_name,grade FROM honor_students WHERE id=?").bind(id).first();
  if(!existing) return json({message:"الطالب غير موجود في لائحة الشرف."},404);
  await env.DB.prepare("DELETE FROM honor_students WHERE id=?").bind(id).run();
  await audit(env,admin,"honor_student_deleted",id,existing);
  return json({ok:true});
}

import { json } from "../_lib/auth.js";

export async function onRequestGet({ request, env }) {
  const grade = new URL(request.url).searchParams.get("grade") || "";
  const allowed = ["الصف الأول الثانوي","الصف الثاني الثانوي","الصف الثالث الثانوي"];
  if (grade && !allowed.includes(grade)) return json({ message: "الصف الدراسي غير صحيح." }, 400);
  const where = grade ? " AND h.grade=?" : "";
  const query = env.DB.prepare(
    "SELECT h.id,h.full_name,h.grade,h.achievement,h.photo_url,h.sort_order,g.name AS group_name FROM honor_students h LEFT JOIN study_groups g ON g.id=h.group_id WHERE h.is_active=1" + where + " ORDER BY CASE h.grade WHEN 'الصف الأول الثانوي' THEN 1 WHEN 'الصف الثاني الثانوي' THEN 2 ELSE 3 END,h.sort_order ASC,h.created_at DESC"
  );
  const result = grade ? await query.bind(grade).all() : await query.all();
  return json({ students: result.results || [] });
}

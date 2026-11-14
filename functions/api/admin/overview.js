import { json, requireAdmin } from "../../_lib/auth.js";
export async function onRequestGet({request,env}) {
  const admin=await requireAdmin(request,env);
  if (!admin) return json({message:"يلزم تسجيل دخول الإدارة."},401);
  const [students,groups,exams,attempts,admins]=await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM students").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM study_groups").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM exams").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM attempts").first(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM admins").first()
  ]);
  return json({students:students.n,groups:groups.n,exams:exams.n,attempts:attempts.n,admins:admins.n});
}

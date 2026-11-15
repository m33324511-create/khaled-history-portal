import { readSession } from "./auth.js";
export async function requireStudent(request,env){
  if(!env.DB||!env.SESSION_SECRET)return null;
  const session=await readSession(request,"student_session",env.SESSION_SECRET);
  if(!session||session.kind!=="student"||!session.sub)return null;
  const student=await env.DB.prepare("SELECT s.id,s.full_name,s.phone,s.student_code,s.group_id,s.is_active,g.grade FROM students s LEFT JOIN study_groups g ON g.id=s.group_id WHERE s.id=? AND s.is_active=1 LIMIT 1").bind(session.sub).first();
  if (student) {
    try {
      await env.DB.prepare("INSERT INTO account_activity (account_type,account_id,last_seen_at) VALUES ('student',?,CURRENT_TIMESTAMP) ON CONFLICT(account_type,account_id) DO UPDATE SET last_seen_at=CASE WHEN last_seen_at < datetime('now','-1 minute') THEN CURRENT_TIMESTAMP ELSE last_seen_at END").bind(student.id).run();
    } catch {}
  }
  return student||null;
}
export function parseSqliteUtc(value){
  if(!value)return NaN;
  const text=String(value);
  return Date.parse(text.includes("T")?(/Z$|[+-]\d\d:\d\d$/.test(text)?text:text+"Z"):text.replace(" ","T")+"Z");
}

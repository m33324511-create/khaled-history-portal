import { readSession } from "./auth.js";
export async function requireStudent(request,env){
  if(!env.DB||!env.SESSION_SECRET)return null;
  const session=await readSession(request,"student_session",env.SESSION_SECRET);
  if(!session||session.kind!=="student"||!session.sub)return null;
  const student=await env.DB.prepare("SELECT id,full_name,phone,student_code,group_id,is_active FROM students WHERE id=? AND is_active=1 LIMIT 1").bind(session.sub).first();
  return student||null;
}
export function parseSqliteUtc(value){
  if(!value)return NaN;
  const text=String(value);
  return Date.parse(text.includes("T")?(/Z$|[+-]\d\d:\d\d$/.test(text)?text:text+"Z"):text.replace(" ","T")+"Z");
}

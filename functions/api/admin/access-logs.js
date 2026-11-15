import { json, requireAdmin } from "../../_lib/auth.js";
const clean=value=>String(value??"").trim().slice(0,100);
export async function onRequestGet({request,env}){
  const admin=await requireAdmin(request,env);
  if(!admin)return json({message:"يلزم تسجيل دخول الإدارة."},401);
  const q=clean(new URL(request.url).searchParams.get("q"));
  const like="%"+q.replace(/[\\%_]/g,"\\$&")+"%";
  const [activity,attempts]=await Promise.all([
    env.DB.prepare("SELECT aa.account_type,aa.account_id,aa.last_seen_at,COALESCE(a.full_name,s.full_name,a.username,s.student_code) AS account_name FROM account_activity aa LEFT JOIN admins a ON aa.account_type='admin' AND a.id=aa.account_id LEFT JOIN students s ON aa.account_type='student' AND s.id=aa.account_id WHERE (?='' OR COALESCE(a.full_name,s.full_name,a.username,s.student_code,'') LIKE ? ESCAPE '\\') ORDER BY aa.last_seen_at DESC LIMIT 500").bind(q,like).all(),
    env.DB.prepare("SELECT x.id,x.identity,x.ip_address,x.success,x.created_at,CASE WHEN a.id IS NOT NULL THEN 'admin' WHEN s.id IS NOT NULL THEN 'student' ELSE NULL END AS account_type,COALESCE(a.full_name,s.full_name,x.identity) AS account_name FROM auth_attempts x LEFT JOIN admins a ON x.identity=a.username COLLATE NOCASE LEFT JOIN students s ON x.identity=s.student_code WHERE (?='' OR x.identity LIKE ? ESCAPE '\\' OR x.ip_address LIKE ? ESCAPE '\\' OR a.full_name LIKE ? ESCAPE '\\' OR s.full_name LIKE ? ESCAPE '\\') ORDER BY x.created_at DESC LIMIT 500").bind(q,like,like,like,like).all()
  ]);
  return json({activity:activity.results||[],attempts:attempts.results||[]});
}
  
export async function onRequestDelete({request,env}){
  const admin=await requireAdmin(request,env);
  if(!admin)return json({message:"يلزم تسجيل دخول الإدارة."},401);
  let body={};
  try{body=await request.json();}catch{}
  if(body.confirm!=="DELETE_ACCESS_LOGS")return json({message:"تأكيد الحذف غير صالح."},400);
  const results=await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_attempts"),
    env.DB.prepare("DELETE FROM account_activity")
  ]);
  const deletedCount=results.reduce((sum,result)=>sum+Number(result.meta?.changes||0),0);
  return json({success:true,deleted_count:deletedCount,message:"تم حذف سجلات الدخول وآخر الظهور."});
}

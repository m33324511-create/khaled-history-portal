import { json, requireAdmin } from "../../_lib/auth.js";
const clean = value => String(value ?? "").trim();
export async function onRequestGet({request,env}) {
  const admin=await requireAdmin(request,env);
  if(!admin)return json({message:"يلزم تسجيل دخول الإدارة."},401);
  const url=new URL(request.url),q=clean(url.searchParams.get("q")).slice(0,100);
  const like="%"+q.replace(/[\\%_]/g,"\\$&")+"%";
  const result=await env.DB.prepare("SELECT l.id,l.action,l.target_type,l.target_id,l.details_json,l.created_at,a.full_name AS admin_name FROM audit_logs l LEFT JOIN admins a ON a.id=l.actor_admin_id WHERE (?='' OR l.action LIKE ? ESCAPE '\\' OR l.target_type LIKE ? ESCAPE '\\' OR l.target_id LIKE ? ESCAPE '\\' OR l.details_json LIKE ? ESCAPE '\\' OR a.full_name LIKE ? ESCAPE '\\') ORDER BY l.created_at DESC LIMIT 300").bind(q,like,like,like,like,like).all();
  return json({logs:result.results||[]});
}

export async function onRequestDelete({request,env}) {
  const admin=await requireAdmin(request,env);
  if(!admin)return json({message:"يلزم تسجيل دخول الإدارة."},401);
  if(!sameOrigin(request))return json({message:"طلب غير مسموح."},403);
  let body;try{body=await request.json();}catch{return json({message:"تأكيد الحذف مطلوب."},400);}
  if(body.confirm!=="DELETE_ALL_LOGS")return json({message:"لم يتم تأكيد حذف السجلات."},400);
  const deleted=await env.DB.prepare("DELETE FROM audit_logs").run();
  await env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),admin.id,"audit_logs_cleared","audit_logs",null,JSON.stringify({deleted_count:Number(deleted.meta?.changes||0)})).run();
  return json({ok:true,deleted_count:Number(deleted.meta?.changes||0)});
}

import { json, requireAdmin, sameOrigin, hashPassword } from "../../_lib/auth.js";
const clean = value => String(value ?? "").trim();
const roles = new Set(["teacher","supervisor","exam_monitor"]);
export async function onRequestGet({request,env}) {
  const admin=await requireAdmin(request,env);
  if(!admin)return json({message:"يلزم تسجيل دخول الإدارة."},401);
  const result=await env.DB.prepare("SELECT id,full_name,username,role,is_active,created_at FROM admins ORDER BY CASE role WHEN 'super_admin' THEN 0 ELSE 1 END,created_at DESC LIMIT 300").all();
  return json({admins:(result.results||[]).map(a=>({...a,is_self:a.id===admin.id}))});
}
export async function onRequestPost({request,env}) {
  const admin=await requireAdmin(request,env);
  if(!admin)return json({message:"يلزم تسجيل دخول الإدارة."},401);
  if(!sameOrigin(request))return json({message:"طلب غير مسموح."},403);
  let body;try{body=await request.json();}catch{return json({message:"بيانات غير صحيحة."},400);}
  const fullName=clean(body.full_name),username=clean(body.username).toLowerCase(),password=String(body.password||""),role=clean(body.role);
  if(fullName.length<3||fullName.length>100||!/^[a-zA-Z0-9._-]{4,40}$/.test(username)||password.length<12||password.length>128||!roles.has(role))
    return json({message:"راجع الاسم واسم المستخدم وكلمة المرور والدور المحدد."},400);
  const existing=await env.DB.prepare("SELECT id FROM admins WHERE username=? COLLATE NOCASE").bind(username).first();
  if(existing)return json({message:"اسم المستخدم مستخدم بالفعل."},409);
  const id=crypto.randomUUID(),passwordHash=await hashPassword(password,env.SESSION_SECRET);
  try{
    await env.DB.prepare("INSERT INTO admins (id,full_name,username,password_hash,role,permissions_json) VALUES (?,?,?,?,?,'[]')").bind(id,fullName,username,passwordHash,role).run();
  }catch(error){
    if(/UNIQUE|constraint/i.test(String(error)))return json({message:"اسم المستخدم مستخدم بالفعل."},409);
    throw error;
  }
  await env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),admin.id,"admin_created","admin",id,JSON.stringify({username,role})).run();
  return json({ok:true,id},201);
}
export async function onRequestPut({request,env}) {
  const admin=await requireAdmin(request,env);
  if(!admin)return json({message:"يلزم تسجيل دخول الإدارة."},401);
  if(!sameOrigin(request))return json({message:"طلب غير مسموح."},403);
  let body;try{body=await request.json();}catch{return json({message:"بيانات غير صحيحة."},400);}
  const id=clean(body.id);
  if(!id||body.is_active===undefined)return json({message:"بيانات التعديل غير مكتملة."},400);
  if(id===admin.id)return json({message:"لا يمكنك تعطيل حسابك الحالي."},409);
  const target=await env.DB.prepare("SELECT id,role,is_active,username FROM admins WHERE id=?").bind(id).first();
  if(!target)return json({message:"الحساب غير موجود."},404);
  if(target.role==="super_admin")return json({message:"لا يمكن تعطيل حساب المدير الرئيسي من هذه الشاشة."},403);
  const active=body.is_active?1:0;
  const result=await env.DB.prepare("UPDATE admins SET is_active=? WHERE id=? AND role<>'super_admin'").bind(active,id).run();
  if(!result.meta?.changes)return json({message:"لم يتم تحديث حالة الحساب."},409);
  await env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),admin.id,active?"admin_activated":"admin_deactivated","admin",id,JSON.stringify({username:target.username})).run();
  return json({ok:true});
}

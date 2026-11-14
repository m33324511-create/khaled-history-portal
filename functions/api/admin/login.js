import { json, verifyPassword, issueSession, cookie, sameOrigin } from "../../_lib/auth.js";
export async function onRequestPost({request,env}) {
  if (!sameOrigin(request)) return json({message:"طلب غير مسموح."},403);
  if (!env.DB || !env.SESSION_SECRET) return json({message:"الخدمة غير جاهزة."},503);
  let body; try { body=await request.json(); } catch { return json({message:"بيانات غير صحيحة."},400); }
  const username=String(body.username||"").trim().toLowerCase();
  const password=String(body.password||"");
  if (!username || !password || username.length>40 || password.length>128) return json({message:"أدخل اسم المستخدم وكلمة المرور."},400);
  const ip=(request.headers.get("CF-Connecting-IP")||"unknown").slice(0,64);
  const recent=await env.DB.prepare("SELECT COUNT(*) AS n FROM auth_attempts WHERE ip_address=? AND created_at >= datetime('now','-15 minutes') AND success=0").bind(ip).first();
  if ((recent?.n||0)>=8) return json({message:"محاولات كثيرة. انتظر 15 دقيقة ثم حاول مجددًا."},429);
  const admin=await env.DB.prepare("SELECT * FROM admins WHERE username=? COLLATE NOCASE AND is_active=1 LIMIT 1").bind(username).first();
  const valid=admin ? await verifyPassword(password,admin.password_hash) : false;
  await env.DB.prepare("INSERT INTO auth_attempts (id,ip_address,identity,success) VALUES (?,?,?,?)")
    .bind(crypto.randomUUID(),ip,username,valid?1:0).run();
  if (!valid) return json({message:"بيانات الدخول غير صحيحة."},401);
  await env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),admin.id,"admin_login","admin",admin.id,JSON.stringify({ip})).run();
  const token=await issueSession({sub:admin.id,kind:"admin",exp:Math.floor(Date.now()/1000)+8*60*60},env.SESSION_SECRET);
  return json({ok:true,admin:{id:admin.id,full_name:admin.full_name,username:admin.username,role:admin.role}},200,{"Set-Cookie":cookie("admin_session",token,28800)});
}

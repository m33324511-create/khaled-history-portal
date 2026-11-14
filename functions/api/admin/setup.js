import { json, hashPassword, issueSession, cookie, sameOrigin } from "../../_lib/auth.js";

export async function onRequestPost({request,env}) {
  let stage = "request";
  try {
    if (!sameOrigin(request)) return json({message:"طلب غير مسموح."},403);
    stage = "configuration";
    if (!env.DB || !env.SESSION_SECRET || !env.ADMIN_SETUP_KEY) return json({message:"إعدادات الخادم غير مكتملة."},503);

    stage = "parse_body";
    let body;
    try { body=await request.json(); } catch { return json({message:"بيانات غير صحيحة."},400); }

    const setupKey=String(body.setupKey||"");
    const name=String(body.fullName||"").trim();
    const username=String(body.username||"").trim().toLowerCase();
    const password=String(body.password||"");

    if (setupKey !== env.ADMIN_SETUP_KEY) return json({message:"رمز التهيئة غير صحيح."},403);

    stage = "check_existing_admin";
    const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM admins").first();
    if (count?.n) return json({message:"تم إنشاء حساب الإدارة بالفعل. استخدم تسجيل الدخول."},409);

    if (name.length<3 || name.length>100 || !/^[a-zA-Z0-9._-]{4,40}$/.test(username) || password.length<12 || password.length>128)
      return json({message:"أدخل اسمًا صحيحًا، واسم مستخدم من 4 أحرف على الأقل، وكلمة مرور لا تقل عن 12 حرفًا."},400);

    stage = "password_hash";
    const id=crypto.randomUUID();
    const passwordHash=await hashPassword(password);

    stage = "insert_admin";
    try {
      await env.DB.prepare("INSERT INTO admins (id,full_name,username,password_hash,role,permissions_json) VALUES (?,?,?,?,?,?)")
        .bind(id,name,username,passwordHash,"super_admin",'["*"]').run();
    } catch (error) {
      console.error("Admin setup insert failed:", error);
      return json({message:"تعذر إنشاء الحساب. تحقق من اسم المستخدم ثم حاول مجددًا."},409);
    }

    stage = "audit_log";
    try {
      await env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?)")
        .bind(crypto.randomUUID(),id,"initial_admin_created","admin",id,JSON.stringify({username})).run();
    } catch (error) {
      console.error("Admin setup audit log failed:", error);
      // The administrator account has already been created; do not report setup as failed.
    }

    stage = "create_session";
    const token=await issueSession({sub:id,kind:"admin",exp:Math.floor(Date.now()/1000)+8*60*60},env.SESSION_SECRET);
    return json({ok:true,admin:{id,full_name:name,username,role:"super_admin"}},200,{"Set-Cookie":cookie("admin_session",token,28800)});
  } catch (error) {
    console.error("Admin setup failed at stage:", stage, error);
    return json({message:"تعذر إكمال إنشاء الحساب داخل الخادم.",stage,requestId:crypto.randomUUID()},500);
  }
}

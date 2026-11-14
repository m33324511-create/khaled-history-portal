import { json, requireAdmin } from "../../_lib/auth.js";
export async function onRequestGet({request,env}) {
  if (!env.DB) return json({message:"قاعدة البيانات غير متاحة."},503);
  const admin=await requireAdmin(request,env);
  if (!admin) {
    const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM admins").first();
    return json({authenticated:false,setupRequired:!(count?.n)},200);
  }
  return json({authenticated:true,admin:{id:admin.id,full_name:admin.full_name,username:admin.username,role:admin.role,permissions:JSON.parse(admin.permissions_json||"[]")}});
}

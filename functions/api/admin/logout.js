import { json, clearCookie, sameOrigin } from "../../_lib/auth.js";
export async function onRequestPost({request}) {
  if (!sameOrigin(request)) return json({message:"طلب غير مسموح."},403);
  return json({ok:true},200,{"Set-Cookie":clearCookie("admin_session")});
}

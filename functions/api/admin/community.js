import { json, sameOrigin, requireAdmin } from "../../_lib/auth.js";

const clean = (v, max=100) => String(v ?? "").trim().slice(0,max);

export async function onRequestGet({request,env}) {
  const admin = await requireAdmin(request,env);
  if (!admin) return json({message:"يلزم تسجيل دخول الإدارة."},401);
  const url = new URL(request.url);
  const q = clean(url.searchParams.get("q"),120);
  const like = "%"+q+"%";
  const [posts,replies,chat,reports] = await Promise.all([
    env.DB.prepare("SELECT p.id,p.title,p.body,p.grade,p.created_at,p.is_hidden,p.student_id,s.full_name,(SELECT COUNT(*) FROM community_replies r WHERE r.post_id=p.id) AS reply_count FROM community_posts p LEFT JOIN students s ON s.id=p.student_id WHERE (?='' OR p.title LIKE ? OR p.body LIKE ? OR p.grade LIKE ? OR s.full_name LIKE ?) ORDER BY p.created_at DESC LIMIT 300").bind(q,like,like,like,like).all(),
    env.DB.prepare("SELECT r.id,r.post_id,r.body,r.grade,r.created_at,r.is_hidden,r.student_id,s.full_name,p.title AS post_title FROM community_replies r LEFT JOIN students s ON s.id=r.student_id LEFT JOIN community_posts p ON p.id=r.post_id WHERE (?='' OR r.body LIKE ? OR r.grade LIKE ? OR s.full_name LIKE ? OR p.title LIKE ?) ORDER BY r.created_at DESC LIMIT 500").bind(q,like,like,like,like).all(),
    env.DB.prepare("SELECT c.id,c.body,c.grade,c.created_at,c.is_hidden,c.student_id,s.full_name FROM community_chat c LEFT JOIN students s ON s.id=c.student_id WHERE (?='' OR c.body LIKE ? OR c.grade LIKE ? OR s.full_name LIKE ?) ORDER BY c.created_at DESC LIMIT 500").bind(q,like,like,like).all(),
    env.DB.prepare("SELECT r.id,r.student_id,r.target_type,r.target_id,r.reason,r.created_at,s.full_name FROM community_reports r LEFT JOIN students s ON s.id=r.student_id WHERE (?='' OR r.reason LIKE ? OR r.target_type LIKE ? OR s.full_name LIKE ?) ORDER BY r.created_at DESC LIMIT 300").bind(q,like,like,like).all()
  ]);
  return json({posts:posts.results||[],replies:replies.results||[],chat:chat.results||[],reports:reports.results||[]});
}

export async function onRequestPost({request,env}) {
  const admin = await requireAdmin(request,env);
  if (!admin) return json({message:"يلزم تسجيل دخول الإدارة."},401);
  if (!sameOrigin(request)) return json({message:"طلب غير مسموح."},403);
  let body;
  try { body=await request.json(); } catch { return json({message:"بيانات غير صحيحة."},400); }
  const action=clean(body.action,20), type=clean(body.target_type,20), id=clean(body.id,100);
  if (!id || !["post","reply","chat","report"].includes(type)) return json({message:"حدد العنصر المطلوب."},400);
  const table={post:"community_posts",reply:"community_replies",chat:"community_chat",report:"community_reports"}[type];
  if (action==="hide" || action==="restore") {
    if (type==="report") return json({message:"البلاغات تُحذف بعد مراجعتها ولا تُخفى."},400);
    const result=await env.DB.prepare("UPDATE "+table+" SET is_hidden=? WHERE id=?").bind(action==="hide"?1:0,id).run();
    if (!Number(result.meta?.changes||0)) return json({message:"العنصر غير موجود."},404);
    return json({success:true});
  }
  if (action==="delete") {
    if(type==="post") {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM community_reports WHERE (target_type='reply' AND target_id IN (SELECT id FROM community_replies WHERE post_id=?)) OR (target_type='post' AND target_id=?)").bind(id,id),
        env.DB.prepare("DELETE FROM community_replies WHERE post_id=?").bind(id),
        env.DB.prepare("DELETE FROM community_posts WHERE id=?").bind(id)
      ]);
    } else {
      await env.DB.batch([
        env.DB.prepare("DELETE FROM community_reports WHERE target_type=? AND target_id=?").bind(type,id),
        env.DB.prepare("DELETE FROM "+table+" WHERE id=?").bind(id)
      ]);
    }
    return json({success:true});
  }
  return json({message:"العملية غير معروفة."},400);
}

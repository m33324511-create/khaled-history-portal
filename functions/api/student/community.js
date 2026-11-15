import { json, sameOrigin } from "../../_lib/auth.js";
import { requireStudent } from "../../_lib/student-auth.js";
const clean=v=>String(v??"").trim();
export async function onRequestGet({request,env}){
 const s=await requireStudent(request,env);if(!s)return json({message:"سجّل دخولك أولًا."},401);
 if(!s.grade)return json({message:"لم يتم تحديد الصف الدراسي لمجموعتك بعد. تواصل مع الإدارة."},409);
 const mode=new URL(request.url).searchParams.get("mode")||"forum";
 if(mode==="chat"){
  const r=await env.DB.prepare("SELECT c.id,c.body,c.created_at,s.full_name,c.student_id FROM community_chat c JOIN students s ON s.id=c.student_id WHERE c.grade=? AND c.is_hidden=0 ORDER BY c.created_at DESC LIMIT 100").bind(s.grade).all();
  return json({messages:(r.results||[]).reverse(),student_id:s.id,grade:s.grade});
 }
 const r=await env.DB.prepare("SELECT p.id,p.title,p.body,p.created_at,p.student_id,s.full_name FROM community_posts p JOIN students s ON s.id=p.student_id WHERE p.grade=? AND p.is_hidden=0 ORDER BY p.created_at DESC LIMIT 60").bind(s.grade).all();
 const posts=[];
 for(const p of r.results||[]){const rr=await env.DB.prepare("SELECT r.id,r.body,r.created_at,r.student_id,s.full_name FROM community_replies r JOIN students s ON s.id=r.student_id WHERE r.post_id=? AND r.grade=? AND r.is_hidden=0 ORDER BY r.created_at ASC LIMIT 100").bind(p.id,s.grade).all();posts.push({...p,replies:rr.results||[]});}
 return json({posts,student_id:s.id,grade:s.grade});
}
export async function onRequestPost({request,env}){
 const s=await requireStudent(request,env);if(!s)return json({message:"سجّل دخولك أولًا."},401);
 if(!sameOrigin(request))return json({message:"طلب غير مسموح."},403);
 if(!s.grade)return json({message:"لم يتم تحديد الصف الدراسي لمجموعتك بعد."},409);
 let b;try{b=await request.json()}catch{return json({message:"بيانات غير صحيحة."},400)}
 const mode=clean(b.mode),body=clean(b.body);
 if(mode==="post"){
  const title=clean(b.title);if(title.length<4||title.length>140||body.length<3||body.length>3000)return json({message:"اكتب عنوانًا ومحتوى مناسبين."},400);
  const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO community_posts(id,student_id,grade,title,body) VALUES(?,?,?,?,?)").bind(id,s.id,s.grade,title,body).run();return json({ok:true,id},201);
 }
 if(mode==="reply"){
  const postId=clean(b.post_id);if(!postId||body.length<1||body.length>2000)return json({message:"اكتب ردًا صحيحًا."},400);
  const p=await env.DB.prepare("SELECT id FROM community_posts WHERE id=? AND grade=? AND is_hidden=0").bind(postId,s.grade).first();if(!p)return json({message:"الموضوع غير موجود في صفك."},404);
  const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO community_replies(id,post_id,student_id,grade,body) VALUES(?,?,?,?,?)").bind(id,postId,s.id,s.grade,body).run();return json({ok:true,id},201);
 }
 if(mode==="chat"){
  if(body.length<1||body.length>1500)return json({message:"الرسالة فارغة أو طويلة."},400);
  const id=crypto.randomUUID();await env.DB.prepare("INSERT INTO community_chat(id,student_id,grade,body) VALUES(?,?,?,?)").bind(id,s.id,s.grade,body).run();return json({ok:true,id},201);
 }
 if(mode==="report"){
  const type=clean(b.target_type),target=clean(b.target_id),reason=clean(b.reason);
  if(!["post","reply","chat"].includes(type)||!target||reason.length<3||reason.length>500)return json({message:"حدد سبب البلاغ."},400);
  await env.DB.prepare("INSERT INTO community_reports(id,student_id,target_type,target_id,reason) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),s.id,type,target,reason).run();return json({ok:true});
 }
 return json({message:"نوع العملية غير معروف."},400);
}
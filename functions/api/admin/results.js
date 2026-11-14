import { json, requireAdmin, sameOrigin } from "../../_lib/auth.js";

const clean = value => String(value ?? "").trim();

export async function onRequestGet({request,env}) {
  const admin=await requireAdmin(request,env);
  if(!admin)return json({message:"يلزم تسجيل دخول الإدارة."},401);
  const attemptId=clean(new URL(request.url).searchParams.get("attempt_id"));
  if(attemptId){
    const attempt=await env.DB.prepare("SELECT a.id,a.exam_id,a.student_id,a.attempt_number,a.started_at,a.submitted_at,a.score,a.status,s.full_name,s.student_code,e.title AS exam_title FROM attempts a JOIN students s ON s.id=a.student_id JOIN exams e ON e.id=a.exam_id WHERE a.id=?").bind(attemptId).first();
    if(!attempt)return json({message:"المحاولة غير موجودة."},404);
    const result=await env.DB.prepare("SELECT q.id AS question_id,q.question_text,q.question_type,q.points,q.sort_order,an.id AS answer_id,an.answer_text,an.awarded_points,an.is_correct FROM questions q LEFT JOIN answers an ON an.question_id=q.id AND an.attempt_id=? WHERE q.exam_id=? ORDER BY q.sort_order,q.id").bind(attemptId,attempt.exam_id).all();
    return json({attempt,items:result.results||[]});
  }
  const result=await env.DB.prepare("SELECT a.id,a.attempt_number,a.started_at,a.submitted_at,a.score,a.status,s.full_name,s.student_code,e.title AS exam_title,(SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id AND q.question_type='essay') AS essay_count,(SELECT COUNT(*) FROM questions q LEFT JOIN answers an ON an.question_id=q.id AND an.attempt_id=a.id WHERE q.exam_id=e.id AND q.question_type='essay' AND an.awarded_points IS NULL) AS pending_essays FROM attempts a JOIN students s ON s.id=a.student_id JOIN exams e ON e.id=a.exam_id ORDER BY COALESCE(a.submitted_at,a.started_at) DESC LIMIT 500").all();
  return json({attempts:result.results||[]});
}

export async function onRequestPut({request,env}) {
  const admin=await requireAdmin(request,env);
  if(!admin)return json({message:"يلزم تسجيل دخول الإدارة."},401);
  if(!sameOrigin(request))return json({message:"طلب غير مسموح."},403);
  let body;try{body=await request.json();}catch{return json({message:"بيانات الطلب غير صحيحة."},400);}
  const attemptId=clean(body.attempt_id);
  if(!attemptId||!Array.isArray(body.grades)||body.grades.length<1||body.grades.length>100)return json({message:"بيانات التصحيح غير مكتملة."},400);
  const attempt=await env.DB.prepare("SELECT id,exam_id,status FROM attempts WHERE id=?").bind(attemptId).first();
  if(!attempt)return json({message:"المحاولة غير موجودة."},404);
  if(attempt.status==="in_progress")return json({message:"لا يمكن تصحيح محاولة لم يسلّمها الطالب بعد."},409);
  const questions=await env.DB.prepare("SELECT id,points FROM questions WHERE exam_id=? AND question_type='essay'").bind(attempt.exam_id).all();
  const essayMap=new Map((questions.results||[]).map(q=>[q.id,Number(q.points)]));
  const seen=new Set(),statements=[];
  for(const grade of body.grades){
    const questionId=clean(grade.question_id),points=Number(grade.awarded_points);
    if(!essayMap.has(questionId)||seen.has(questionId))return json({message:"توجد بيانات سؤال مقالي غير صحيحة أو مكررة."},400);
    if(!Number.isFinite(points)||points<0||points>essayMap.get(questionId))return json({message:"الدرجة المدخلة يجب أن تكون بين صفر والدرجة النهائية للسؤال."},400);
    seen.add(questionId);
    const existing=await env.DB.prepare("SELECT id FROM answers WHERE attempt_id=? AND question_id=? ORDER BY id LIMIT 1").bind(attemptId,questionId).first();
    if(existing){
      statements.push(env.DB.prepare("UPDATE answers SET awarded_points=?,is_correct=NULL WHERE id=? AND attempt_id=?").bind(points,existing.id,attemptId));
    }else{
      statements.push(env.DB.prepare("INSERT INTO answers (id,attempt_id,question_id,answer_text,awarded_points,is_correct) VALUES (?,?,?,NULL,?,NULL)").bind(crypto.randomUUID(),attemptId,questionId,points));
    }
  }
  if(!statements.length)return json({message:"لم يتم إدخال درجات للتصحيح."},400);
  statements.push(env.DB.prepare("UPDATE attempts SET score=(SELECT COALESCE(SUM(awarded_points),0) FROM answers WHERE attempt_id=?),status=CASE WHEN NOT EXISTS (SELECT 1 FROM questions q LEFT JOIN answers an ON an.question_id=q.id AND an.attempt_id=? WHERE q.exam_id=? AND q.question_type='essay' AND an.awarded_points IS NULL) THEN 'graded' ELSE 'submitted' END WHERE id=?").bind(attemptId,attemptId,attempt.exam_id,attemptId));
  statements.push(env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),admin.id,"essay_answers_graded","attempt",attemptId,JSON.stringify({graded_count:seen.size})));
  await env.DB.batch(statements);
  const updated=await env.DB.prepare("SELECT score,status FROM attempts WHERE id=?").bind(attemptId).first();
  return json({ok:true,score:Number(updated?.score||0),status:updated?.status});
}

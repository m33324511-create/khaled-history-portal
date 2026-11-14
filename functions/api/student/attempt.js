import { json, sameOrigin } from "../../_lib/auth.js";
import { requireStudent, parseSqliteUtc } from "../../_lib/student-auth.js";
const clean=v=>String(v??"").trim();
async function getAttempt(env,id,studentId){
  return env.DB.prepare("SELECT a.*,e.title AS exam_title,e.duration_minutes,e.closes_at,e.results_visible FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE a.id=? AND a.student_id=?").bind(id,studentId).first();
}
async function expireIfNeeded(env,a){
  if(a.status!=="in_progress")return a;
  const deadline=parseSqliteUtc(a.started_at)+Number(a.duration_minutes)*60000;
  const close=a.closes_at?Date.parse(String(a.closes_at).replace(" ","T")+"Z"):Infinity;
  if(Date.now()>=Math.min(deadline,close)){
    await env.DB.prepare("UPDATE attempts SET status='expired',submitted_at=CURRENT_TIMESTAMP WHERE id=? AND status='in_progress'").bind(a.id).run();
    return {...a,status:"expired"};
  }
  return a;
}
export async function onRequestGet({request,env}){
  const student=await requireStudent(request,env);
  if(!student)return json({message:"انتهت جلسة الدخول. سجل دخولك مرة أخرى."},401);
  const id=clean(new URL(request.url).searchParams.get("id"));
  if(!id)return json({message:"حدد المحاولة المطلوبة."},400);
  let attempt=await getAttempt(env,id,student.id);
  if(!attempt)return json({message:"المحاولة غير موجودة."},404);
  attempt=await expireIfNeeded(env,attempt);
  const q=await env.DB.prepare("SELECT q.id,q.question_text,q.question_type,q.options_json,q.points,q.sort_order,an.answer_text FROM questions q LEFT JOIN answers an ON an.question_id=q.id AND an.attempt_id=? WHERE q.exam_id=? ORDER BY q.sort_order,q.id").bind(id,attempt.exam_id).all();
  const now=Date.now(),deadline=Math.min(parseSqliteUtc(attempt.started_at)+Number(attempt.duration_minutes)*60000,attempt.closes_at?Date.parse(String(attempt.closes_at).replace(" ","T")+"Z"):Infinity);
  return json({attempt:{id:attempt.id,exam_id:attempt.exam_id,exam_title:attempt.exam_title,started_at:attempt.started_at,status:attempt.status,deadline:new Date(deadline).toISOString(),remaining_seconds:Math.max(0,Math.floor((deadline-now)/1000))},questions:(q.results||[]).map(x=>({...x,options: x.options_json?JSON.parse(x.options_json):[]}))});
}
export async function onRequestPost({request,env}){
  const student=await requireStudent(request,env);
  if(!student)return json({message:"انتهت جلسة الدخول. سجل دخولك مرة أخرى."},401);
  if(!sameOrigin(request))return json({message:"طلب غير مسموح."},403);
  let body;try{body=await request.json()}catch{return json({message:"بيانات غير صحيحة."},400)}
  const examId=clean(body.exam_id);
  if(!examId)return json({message:"حدد الامتحان."},400);
  const exam=await env.DB.prepare("SELECT * FROM exams WHERE id=? AND is_published=1 AND (group_id IS NULL OR group_id=?)").bind(examId,student.group_id||"").first();
  if(!exam)return json({message:"الامتحان غير متاح لحسابك."},404);
  const now=Date.now(),opens=exam.opens_at?Date.parse(String(exam.opens_at).replace(" ","T")+"Z"):0,closes=exam.closes_at?Date.parse(String(exam.closes_at).replace(" ","T")+"Z"):Infinity;
  if(now<opens)return json({message:"لم يحن موعد فتح الامتحان بعد."},409);
  if(now>=closes)return json({message:"انتهى موعد الامتحان."},409);
  const active=await env.DB.prepare("SELECT id,started_at FROM attempts WHERE exam_id=? AND student_id=? AND status='in_progress' ORDER BY started_at DESC LIMIT 1").bind(examId,student.id).first();
  if(active){
    const deadline=parseSqliteUtc(active.started_at)+Number(exam.duration_minutes)*60000;
    if(now<Math.min(deadline,closes))return json({ok:true,attempt_id:active.id,resumed:true});
    await env.DB.prepare("UPDATE attempts SET status='expired',submitted_at=CURRENT_TIMESTAMP WHERE id=? AND status='in_progress'").bind(active.id).run();
  }
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM attempts WHERE exam_id=? AND student_id=?").bind(examId,student.id).first();
  if(Number(count?.n||0)>=Number(exam.max_attempts))return json({message:"استنفدت عدد المحاولات المسموح به لهذا الامتحان."},409);
  const questions=await env.DB.prepare("SELECT COUNT(*) AS n FROM questions WHERE exam_id=?").bind(examId).first();
  if(!Number(questions?.n||0))return json({message:"هذا الامتحان لا يحتوي على أسئلة بعد."},409);
  const id=crypto.randomUUID(),number=Number(count?.n||0)+1;
  await env.DB.prepare("INSERT INTO attempts (id,exam_id,student_id,attempt_number,status) VALUES (?,?,?,?,'in_progress')").bind(id,examId,student.id,number).run();
  return json({ok:true,attempt_id:id,resumed:false},201);
}
export async function onRequestPut({request,env}){
  const student=await requireStudent(request,env);
  if(!student)return json({message:"انتهت جلسة الدخول. سجل دخولك مرة أخرى."},401);
  if(!sameOrigin(request))return json({message:"طلب غير مسموح."},403);
  let body;try{body=await request.json()}catch{return json({message:"بيانات غير صحيحة."},400)}
  const id=clean(body.attempt_id),answers=body.answers;
  if(!id||!Array.isArray(answers)||answers.length>100)return json({message:"بيانات الإجابات غير صحيحة."},400);
  let attempt=await getAttempt(env,id,student.id);
  if(!attempt)return json({message:"المحاولة غير موجودة."},404);
  attempt=await expireIfNeeded(env,attempt);
  if(attempt.status!=="in_progress")return json({message:"انتهى وقت المحاولة أو تم تسليمها بالفعل."},409);
  const deadline=Math.min(parseSqliteUtc(attempt.started_at)+Number(attempt.duration_minutes)*60000,attempt.closes_at?Date.parse(String(attempt.closes_at).replace(" ","T")+"Z"):Infinity);
  if(Date.now()>=deadline){await env.DB.prepare("UPDATE attempts SET status='expired',submitted_at=CURRENT_TIMESTAMP WHERE id=?").bind(id).run();return json({message:"انتهى وقت الامتحان. تم إغلاق المحاولة."},409);}
  const q=await env.DB.prepare("SELECT id,question_type,options_json,correct_answer,points FROM questions WHERE exam_id=?").bind(attempt.exam_id).all();
  const map=new Map((q.results||[]).map(x=>[x.id,x]));
  const seen=new Set(),statements=[];
  for(const item of answers){
    const qid=clean(item.question_id),question=map.get(qid),answer=String(item.answer_text??"").trim();
    if(!question||seen.has(qid)||answer.length>5000)return json({message:"إحدى الإجابات غير صحيحة."},400);
    seen.add(qid);
    let awarded=null,isCorrect=null;
    if(question.question_type!=="essay"){
      isCorrect=answer===String(question.correct_answer)?1:0;
      awarded=isCorrect?Number(question.points):0;
    } else if(answer.length===0){ continue; }
    const existing=await env.DB.prepare("SELECT id FROM answers WHERE attempt_id=? AND question_id=? ORDER BY id LIMIT 1").bind(id,qid).first();
    if(existing)statements.push(env.DB.prepare("UPDATE answers SET answer_text=?,awarded_points=?,is_correct=? WHERE id=?").bind(answer,awarded,isCorrect,existing.id));
    else statements.push(env.DB.prepare("INSERT INTO answers (id,attempt_id,question_id,answer_text,awarded_points,is_correct) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),id,qid,answer,awarded,isCorrect));
  }
  if(body.submit===true){
    for(const question of q.results||[]){
      if(!seen.has(question.id)){
        const existing=await env.DB.prepare("SELECT id FROM answers WHERE attempt_id=? AND question_id=? ORDER BY id LIMIT 1").bind(id,question.id).first();
        if(!existing)statements.push(env.DB.prepare("INSERT INTO answers (id,attempt_id,question_id,answer_text,awarded_points,is_correct) VALUES (?,?,?,NULL,?,?)").bind(crypto.randomUUID(),id,question.id,question.question_type==="essay"?null:0,question.question_type==="essay"?null:0));
      }
    }
    statements.push(env.DB.prepare("UPDATE attempts SET submitted_at=CURRENT_TIMESTAMP,status=?,score=(SELECT COALESCE(SUM(awarded_points),0) FROM answers WHERE attempt_id=?) WHERE id=?").bind((q.results||[]).some(x=>x.question_type==="essay")?"submitted":"graded",id,id));
  }
  if(statements.length)await env.DB.batch(statements);
  const updated=await env.DB.prepare("SELECT status,score FROM attempts WHERE id=?").bind(id).first();
  return json({ok:true,submitted:body.submit===true,status:updated.status,score:updated.score===null?null:Number(updated.score)});
}

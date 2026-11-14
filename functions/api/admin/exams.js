import { json, requireAdmin, sameOrigin } from "../../_lib/auth.js";

const clean = value => String(value ?? "").trim();
const allowedTypes = new Set(["mcq","true_false","essay"]);
function normalizeQuestions(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) throw new Error("أضف سؤالًا واحدًا على الأقل، وبحد أقصى 100 سؤال.");
  return input.map((raw,index)=>{
    const text=clean(raw.question_text);
    const type=clean(raw.question_type);
    const points=Number(raw.points);
    if(text.length<3||text.length>2000) throw new Error("نص السؤال رقم "+(index+1)+" يجب أن يكون بين 3 و2000 حرف.");
    if(!allowedTypes.has(type)) throw new Error("نوع السؤال رقم "+(index+1)+" غير مدعوم.");
    if(!Number.isFinite(points)||points<=0||points>1000) throw new Error("درجة السؤال رقم "+(index+1)+" غير صحيحة.");
    let options=null,correct=null;
    if(type==="mcq"){
      options=Array.isArray(raw.options)?raw.options.map(clean).filter(Boolean):[];
      if(options.length<2||options.length>6||new Set(options).size!==options.length) throw new Error("سؤال الاختيار من متعدد رقم "+(index+1)+" يحتاج من خيارين إلى 6 خيارات مختلفة.");
      correct=clean(raw.correct_answer);
      if(!options.includes(correct)) throw new Error("حدد الإجابة الصحيحة للسؤال رقم "+(index+1)+".");
    } else if(type==="true_false"){
      options=["صحيح","خطأ"];correct=clean(raw.correct_answer);
      if(!options.includes(correct)) throw new Error("حدد إجابة سؤال الصح والخطأ رقم "+(index+1)+".");
    }
    return {id:crypto.randomUUID(),question_text:text,question_type:type,options_json:options?JSON.stringify(options):null,correct_answer:correct,points,sort_order:index};
  });
}
function normalizeExam(body) {
  const title=clean(body.title),description=clean(body.description),groupId=clean(body.group_id);
  const duration=Number(body.duration_minutes),attempts=Number(body.max_attempts);
  if(title.length<3||title.length>160) throw new Error("عنوان الامتحان يجب أن يكون بين 3 و160 حرفًا.");
  if(description.length>2000) throw new Error("وصف الامتحان طويل جدًا.");
  if(!Number.isInteger(duration)||duration<1||duration>360) throw new Error("مدة الامتحان يجب أن تكون من دقيقة إلى 360 دقيقة.");
  if(!Number.isInteger(attempts)||attempts<1||attempts>10) throw new Error("عدد المحاولات يجب أن يكون من 1 إلى 10.");
  const opens=clean(body.opens_at)||null,closes=clean(body.closes_at)||null;
  const validDate=v=>!v||(!Number.isNaN(Date.parse(v))&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v));
  if(!validDate(opens)||!validDate(closes)) throw new Error("صيغة موعد الإتاحة غير صحيحة.");
  if(opens&&closes&&Date.parse(closes)<=Date.parse(opens)) throw new Error("موعد انتهاء الامتحان يجب أن يكون بعد موعد بدايته.");
  return {title,description:description||null,group_id:groupId||null,duration_minutes:duration,max_attempts:attempts,opens_at:opens,closes_at:closes,results_visible:body.results_visible?1:0,is_published:body.is_published?1:0};
}
async function audit(env,admin,action,id,details={}) {
  await env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),admin.id,action,"exam",id,JSON.stringify(details)).run();
}
async function adminFor(request,env) {
  const admin=await requireAdmin(request,env);
  if(!admin) return null;
  return admin;
}
export async function onRequestGet({request,env}) {
  const admin=await adminFor(request,env);
  if(!admin) return json({message:"يلزم تسجيل دخول الإدارة."},401);
  const id=clean(new URL(request.url).searchParams.get("id"));
  if(id){
    const exam=await env.DB.prepare("SELECT e.*,g.name AS group_name,(SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,(SELECT COUNT(*) FROM attempts a WHERE a.exam_id=e.id) AS attempt_count FROM exams e LEFT JOIN study_groups g ON g.id=e.group_id WHERE e.id=?").bind(id).first();
    if(!exam) return json({message:"الامتحان غير موجود."},404);
    const questions=await env.DB.prepare("SELECT id,question_text,question_type,options_json,correct_answer,points,sort_order FROM questions WHERE exam_id=? ORDER BY sort_order,id").bind(id).all();
    return json({exam,questions:questions.results||[]});
  }
  const result=await env.DB.prepare("SELECT e.id,e.title,e.description,e.group_id,e.duration_minutes,e.max_attempts,e.opens_at,e.closes_at,e.results_visible,e.is_published,e.created_at,g.name AS group_name,(SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,(SELECT COUNT(*) FROM attempts a WHERE a.exam_id=e.id) AS attempt_count FROM exams e LEFT JOIN study_groups g ON g.id=e.group_id ORDER BY e.created_at DESC LIMIT 300").all();
  return json({exams:result.results||[]});
}
export async function onRequestPost({request,env}) {
  const admin=await adminFor(request,env);
  if(!admin) return json({message:"يلزم تسجيل دخول الإدارة."},401);
  if(!sameOrigin(request)) return json({message:"طلب غير مسموح."},403);
  let body;try{body=await request.json();}catch{return json({message:"بيانات الطلب غير صحيحة."},400);}
  let exam,questions;
  try{exam=normalizeExam(body);questions=normalizeQuestions(body.questions);}
  catch(e){return json({message:e.message},400);}
  if(exam.group_id){
    const group=await env.DB.prepare("SELECT id FROM study_groups WHERE id=? AND is_active=1").bind(exam.group_id).first();
    if(!group)return json({message:"المجموعة المحددة غير موجودة أو غير مفعّلة."},400);
  }
  const id=crypto.randomUUID();
  const statements=[
    env.DB.prepare("INSERT INTO exams (id,title,description,group_id,duration_minutes,max_attempts,opens_at,closes_at,results_visible,is_published,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,exam.title,exam.description,exam.group_id,exam.duration_minutes,exam.max_attempts,exam.opens_at,exam.closes_at,exam.results_visible,exam.is_published,admin.id),
    ...questions.map(q=>env.DB.prepare("INSERT INTO questions (id,exam_id,question_text,question_type,options_json,correct_answer,points,sort_order) VALUES (?,?,?,?,?,?,?,?)").bind(q.id,id,q.question_text,q.question_type,q.options_json,q.correct_answer,q.points,q.sort_order)),
    env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),admin.id,"exam_created","exam",id,JSON.stringify({title:exam.title,question_count:questions.length}))
  ];
  await env.DB.batch(statements);
  return json({ok:true,id},201);
}
export async function onRequestPut({request,env}) {
  const admin=await adminFor(request,env);
  if(!admin) return json({message:"يلزم تسجيل دخول الإدارة."},401);
  if(!sameOrigin(request)) return json({message:"طلب غير مسموح."},403);
  let body;try{body=await request.json();}catch{return json({message:"بيانات الطلب غير صحيحة."},400);}
  const id=clean(body.id);
  if(!id)return json({message:"معرّف الامتحان غير موجود."},400);
  const current=await env.DB.prepare("SELECT id FROM exams WHERE id=?").bind(id).first();
  if(!current)return json({message:"الامتحان غير موجود."},404);
  let exam,questions;
  try{exam=normalizeExam(body);questions=normalizeQuestions(body.questions);}
  catch(e){return json({message:e.message},400);}
  if(exam.group_id){
    const group=await env.DB.prepare("SELECT id FROM study_groups WHERE id=? AND is_active=1").bind(exam.group_id).first();
    if(!group)return json({message:"المجموعة المحددة غير موجودة أو غير مفعّلة."},400);
  }
  const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM attempts WHERE exam_id=?").bind(id).first();
  if(Number(count?.n||0)>0){
    const existing=await env.DB.prepare("SELECT id,question_text,question_type,options_json,correct_answer,points,sort_order FROM questions WHERE exam_id=? ORDER BY sort_order,id").bind(id).all();
    const stable=JSON.stringify((existing.results||[]).map(q=>({question_text:q.question_text,question_type:q.question_type,options_json:q.options_json,correct_answer:q.correct_answer,points:Number(q.points),sort_order:Number(q.sort_order)})))===JSON.stringify(questions.map(q=>({question_text:q.question_text,question_type:q.question_type,options_json:q.options_json,correct_answer:q.correct_answer,points:q.points,sort_order:q.sort_order})));
    if(!stable)return json({message:"لا يمكن تغيير الأسئلة أو درجاتها بعد بدء الطلاب المحاولات؛ حفاظًا على صحة الإجابات والنتائج. يمكنك تعديل بيانات الامتحان العامة فقط."},409);
  }
  const statements=[
    env.DB.prepare("UPDATE exams SET title=?,description=?,group_id=?,duration_minutes=?,max_attempts=?,opens_at=?,closes_at=?,results_visible=?,is_published=? WHERE id=?")
      .bind(exam.title,exam.description,exam.group_id,exam.duration_minutes,exam.max_attempts,exam.opens_at,exam.closes_at,exam.results_visible,exam.is_published,id)
  ];
  if(Number(count?.n||0)===0){
    statements.push(env.DB.prepare("DELETE FROM questions WHERE exam_id=?").bind(id));
    for(const q of questions)statements.push(env.DB.prepare("INSERT INTO questions (id,exam_id,question_text,question_type,options_json,correct_answer,points,sort_order) VALUES (?,?,?,?,?,?,?,?)").bind(q.id,id,q.question_text,q.question_type,q.options_json,q.correct_answer,q.points,q.sort_order));
  }
  statements.push(env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),admin.id,"exam_updated","exam",id,JSON.stringify({title:exam.title})));
  await env.DB.batch(statements);
  return json({ok:true,questions_locked:Number(count?.n||0)>0});
}
export async function onRequestDelete({request,env}) {
  const admin=await adminFor(request,env);
  if(!admin)return json({message:"يلزم تسجيل دخول الإدارة."},401);
  if(!sameOrigin(request))return json({message:"طلب غير مسموح."},403);
  const id=clean(new URL(request.url).searchParams.get("id"));
  if(!id)return json({message:"معرّف الامتحان غير موجود."},400);
  const exam=await env.DB.prepare("SELECT id,title FROM exams WHERE id=?").bind(id).first();
  if(!exam)return json({message:"الامتحان غير موجود."},404);
  const attempts=await env.DB.prepare("SELECT COUNT(*) AS n FROM attempts WHERE exam_id=?").bind(id).first();
  if(Number(attempts?.n||0)>0)return json({message:"لا يمكن حذف امتحان له محاولات مسجلة. ألغِ نشره بدلًا من ذلك للحفاظ على سجلات الطلاب."},409);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM questions WHERE exam_id=?").bind(id),
    env.DB.prepare("DELETE FROM exams WHERE id=?").bind(id),
    env.DB.prepare("INSERT INTO audit_logs (id,actor_admin_id,action,target_type,target_id,details_json) VALUES (?,?,?,?,?,?)").bind(crypto.randomUUID(),admin.id,"exam_deleted","exam",id,JSON.stringify({title:exam.title}))
  ]);
  return json({ok:true});
}

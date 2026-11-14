import { json } from "../../_lib/auth.js";
import { requireStudent, parseSqliteUtc } from "../../_lib/student-auth.js";
export async function onRequestGet({request,env}){
  const student=await requireStudent(request,env);
  if(!student)return json({message:"انتهت جلسة الدخول. سجل دخولك مرة أخرى."},401);
  const now=new Date().toISOString().slice(0,16);
  const result=await env.DB.prepare("SELECT e.id,e.title,e.description,e.duration_minutes,e.max_attempts,e.opens_at,e.closes_at,e.results_visible,e.group_id,g.name AS group_name,(SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count,(SELECT COUNT(*) FROM attempts a WHERE a.exam_id=e.id AND a.student_id=?) AS attempts_used,(SELECT MAX(a.status) FROM attempts a WHERE a.exam_id=e.id AND a.student_id=? AND a.status='in_progress') AS active_attempt FROM exams e LEFT JOIN study_groups g ON g.id=e.group_id WHERE e.is_published=1 AND (e.group_id IS NULL OR e.group_id=?) ORDER BY COALESCE(e.opens_at,e.created_at) DESC LIMIT 200").bind(student.id,student.id,student.group_id||"").all();
  const exams=(result.results||[]).map(e=>{
    const opens=e.opens_at?parseSqliteUtc(e.opens_at):null;
    const closes=e.closes_at?parseSqliteUtc(e.closes_at):null;
    const current=Date.now();
    const available=(!opens||current>=opens)&&(!closes||current<closes);
    const attemptsLeft=Math.max(0,Number(e.max_attempts)-Number(e.attempts_used||0));
    return {...e,available,attempts_left:attemptsLeft,can_start:available&&(attemptsLeft>0||!!e.active_attempt)};
  });
  const history=await env.DB.prepare("SELECT a.id,a.attempt_number,a.started_at,a.submitted_at,a.status,a.score,e.title AS exam_title,e.results_visible FROM attempts a JOIN exams e ON e.id=a.exam_id WHERE a.student_id=? ORDER BY COALESCE(a.submitted_at,a.started_at) DESC LIMIT 50").bind(student.id).all();
  const attempts=(history.results||[]).map(a=>({...a,score:(Number(a.results_visible)===1&&a.status==="graded"&&a.score!==null)?Number(a.score):null}));
  return json({student:{full_name:student.full_name,student_code:student.student_code,group_id:student.group_id},exams,attempts});
}

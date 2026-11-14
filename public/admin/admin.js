(() => {
 const $=s=>document.querySelector(s), authView=$("#authView"), dashboard=$("#dashboard"), login=$("#loginForm"), setup=$("#setupForm"), msg=$("#authMessage");
 $("#year").textContent=new Date().getFullYear();
 let currentTab="overview", studentCache=[], groupCache=[];
 async function api(url,options={}) {
   const response=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
   const raw=await response.text(); let data;
   try { data=JSON.parse(raw); } catch { throw new Error("استجابة غير متوقعة من الخادم (HTTP "+response.status+")."); }
   if(!response.ok) throw new Error(data.message||("حدث خطأ من الخادم (HTTP "+response.status+")."));
   return data;
 }
 function showAuth(setupNeeded) {
   authView.classList.remove("hidden");dashboard.classList.add("hidden");
   if(setupNeeded){$("#authTitle").textContent="إعداد الإدارة لأول مرة";$("#authDesc").textContent="أنشئ حساب المدير الرئيسي.";setup.classList.remove("hidden");login.classList.add("hidden");}
   else{$("#authTitle").textContent="تسجيل دخول الإدارة";$("#authDesc").textContent="هذه المنطقة مخصصة للمسؤولين المعتمدين فقط.";login.classList.remove("hidden");setup.classList.add("hidden");}
 }
 async function refreshStats(){
   const s=await api("/api/admin/overview");
   $("#stats").innerHTML=[["students","الطلاب"],["groups","المجموعات"],["exams","الامتحانات"],["attempts","المحاولات"],["admins","المسؤولون"]].map(([k,l])=>'<div class="stat"><b>'+Number(s[k]||0)+'</b><span>'+l+'</span></div>').join("");
 }
 async function showDashboard(admin) {
   authView.classList.add("hidden");dashboard.classList.remove("hidden");$("#adminName").textContent=admin.full_name;
   try{await refreshStats();}catch(e){$("#stats").textContent=e.message;}
   if(currentTab==="students") await renderStudents(); else if(currentTab==="groups") await renderGroups(); else if(currentTab==="honors") await renderHonors(); else if(currentTab==="exams") await renderExams(); else if(currentTab==="results") await renderResults();
 }
 function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
 async function renderStudents(q=""){
   currentTab="students";const panel=$("#panel");
   panel.innerHTML='<div class="section-head"><div><h2>إدارة الطلاب</h2><p>إضافة الطلاب وتعديل بياناتهم وربطهم بمجموعات الدروس.</p></div><button id="addStudentBtn" class="primary">＋ إضافة طالب</button></div><div class="student-tools"><input id="studentSearch" placeholder="ابحث بالاسم أو الهاتف أو الرقم التعريفي" value="'+esc(q)+'"><button id="searchStudents" class="ghost">بحث</button><button id="showAllStudents" class="ghost">عرض الكل</button></div><div id="studentFormWrap"></div><div id="studentsNotice" class="notice">جارٍ تحميل بيانات الطلاب…</div><div class="table-wrap"><table class="students-table"><thead><tr><th>الطالب</th><th>الهاتف</th><th>الرقم التعريفي</th><th>المجموعة</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody id="studentsRows"></tbody></table></div>';
   $("#addStudentBtn").onclick=()=>studentForm();
   $("#searchStudents").onclick=()=>loadStudents($("#studentSearch").value.trim());
   $("#studentSearch").addEventListener("keydown",e=>{if(e.key==="Enter")loadStudents(e.target.value.trim());});
   $("#showAllStudents").onclick=()=>{ $("#studentSearch").value="";loadStudents("");};
   await loadStudents(q);
 }
 async function loadStudents(q=""){
   const notice=$("#studentsNotice"),rows=$("#studentsRows");if(!notice||!rows)return;
   notice.textContent="جارٍ تحميل البيانات…";
   try{
     const data=await api("/api/admin/students?q="+encodeURIComponent(q)+"&status=all");studentCache=data.students||[];
     notice.textContent=studentCache.length?"عدد السجلات المعروضة: "+studentCache.length+(studentCache.length===500?" (الحد الأقصى للعرض 500 سجل).":""):"لا يوجد طلاب مطابقون للبحث.";
     rows.innerHTML=studentCache.map(s=>'<tr><td>'+esc(s.full_name)+'</td><td>'+esc(s.phone)+'</td><td><code>'+esc(s.student_code)+'</code></td><td>'+esc(s.group_name||"بدون مجموعة")+'</td><td><span class="state '+(s.is_active?"on":"off")+'">'+(s.is_active?"نشط":"معطّل")+'</span></td><td class="actions"><button class="mini edit-student" data-id="'+esc(s.id)+'">تعديل</button><button class="mini '+(s.is_active?"danger":"activate")+'" data-toggle="'+esc(s.id)+'" data-active="'+(s.is_active?1:0)+'">'+(s.is_active?"تعطيل":"تفعيل")+'</button></td></tr>').join("");
     rows.querySelectorAll(".edit-student").forEach(b=>b.onclick=()=>studentForm(studentCache.find(s=>s.id===b.dataset.id)));
     rows.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>toggleStudent(b.dataset.toggle,b.dataset.active==="1"));
   }catch(e){notice.textContent=e.message;}
 }
 async function studentForm(student=null){
   const wrap=$("#studentFormWrap");if(!wrap)return;
   let groups=[];try{groups=(await api("/api/admin/groups?status=all")).groups||[];}catch(e){$("#studentsNotice").textContent=e.message;return;}
   wrap.innerHTML='<form id="studentEditor" class="student-editor"><div class="section-head"><h3>'+(student?"تعديل بيانات الطالب":"إضافة طالب جديد")+'</h3><button type="button" id="cancelStudent" class="ghost">إغلاق</button></div><div class="student-fields"><label>اسم الطالب<input name="full_name" required minlength="3" maxlength="120" value="'+esc(student?.full_name||"")+'"></label><label>رقم الهاتف<input name="phone" required minlength="6" maxlength="30" value="'+esc(student?.phone||"")+'"></label><label>الرقم التعريفي<input name="student_code" required minlength="2" maxlength="40" pattern="[A-Za-z0-9_-]+" value="'+esc(student?.student_code||"")+'"></label><label>مجموعة الدروس<select name="group_id"><option value="">بدون مجموعة</option>'+groups.map(g=>'<option value="'+esc(g.id)+'" '+(student?.group_id===g.id?"selected":"")+'>'+esc(g.name)+'</option>').join("")+'</select></label></div><div class="form-actions"><button class="primary">'+(student?"حفظ التعديلات":"حفظ الطالب")+'</button><span id="studentFormMsg" role="status"></span></div></form>';
   $("#cancelStudent").onclick=()=>wrap.innerHTML="";
   $("#studentEditor").onsubmit=async e=>{e.preventDefault();const button=e.submitter,form=new FormData(e.currentTarget),body=Object.fromEntries(form);if(student)body.id=student.id;button.disabled=true;$("#studentFormMsg").textContent="جارٍ الحفظ…";
     try{await api("/api/admin/students",{method:student?"PUT":"POST",body:JSON.stringify(body)});wrap.innerHTML="";await loadStudents($("#studentSearch")?.value||"");await refreshStats();}
     catch(err){$("#studentFormMsg").textContent=err.message;button.disabled=false;}
   };
 }
 async function toggleStudent(id,active){
   const action=active?"تعطيل هذا الطالب؟ سيظل سجله ومحاولاته محفوظة.":"إعادة تفعيل هذا الطالب؟";
   if(!confirm(action))return;
   try{await api("/api/admin/students",{method:"PUT",body:JSON.stringify({id,is_active:!active})});await loadStudents($("#studentSearch")?.value||"");await refreshStats();}
   catch(e){alert(e.message);}
 }

 async function renderGroups(q=""){
   currentTab="groups";const panel=$("#panel");
   panel.innerHTML='<div class="section-head"><div><h2>إدارة مجموعات الدروس</h2><p>إنشاء المجموعات وتعديلها وربط الطلاب بها، مع الاحتفاظ بسجلات الطلاب عند تعطيل أي مجموعة.</p></div><button id="addGroupBtn" class="primary">＋ إضافة مجموعة</button></div><div class="student-tools"><input id="groupSearch" placeholder="ابحث باسم المجموعة أو الوصف" value="'+esc(q)+'"><button id="searchGroups" class="ghost">بحث</button><button id="showAllGroups" class="ghost">عرض الكل</button></div><div id="groupFormWrap"></div><div id="groupsNotice" class="notice">جارٍ تحميل المجموعات…</div><div class="table-wrap"><table class="students-table"><thead><tr><th>اسم المجموعة</th><th>الوصف</th><th>عدد الطلاب</th><th>الحالة</th><th>تاريخ الإنشاء</th><th>الإجراءات</th></tr></thead><tbody id="groupsRows"></tbody></table></div>';
   $("#addGroupBtn").onclick=()=>groupForm();
   $("#searchGroups").onclick=()=>loadGroups($("#groupSearch").value.trim());
   $("#groupSearch").addEventListener("keydown",e=>{if(e.key==="Enter")loadGroups(e.target.value.trim());});
   $("#showAllGroups").onclick=()=>{$("#groupSearch").value="";loadGroups("");};
   await loadGroups(q);
 }
 async function loadGroups(q=""){
   const notice=$("#groupsNotice"),rows=$("#groupsRows");if(!notice||!rows)return;
   notice.textContent="جارٍ تحميل المجموعات…";
   try{
     const data=await api("/api/admin/groups?status=all");groupCache=data.groups||[];
     const shown=groupCache.filter(g=>!q||g.name.toLowerCase().includes(q.toLowerCase())||String(g.description||"").toLowerCase().includes(q.toLowerCase()));
     notice.textContent="عدد المجموعات: "+shown.length;
     rows.innerHTML=shown.map(g=>'<tr><td>'+esc(g.name)+'</td><td>'+esc(g.description||"—")+'</td><td>'+Number(g.student_count||0)+'</td><td><span class="state '+(g.is_active?"on":"off")+'">'+(g.is_active?"نشطة":"معطّلة")+'</span></td><td>'+esc(g.created_at||"—")+'</td><td class="actions"><button class="mini edit-group" data-id="'+esc(g.id)+'">تعديل</button><button class="mini '+(g.is_active?"danger":"activate")+'" data-toggle="'+esc(g.id)+'" data-active="'+(g.is_active?1:0)+'">'+(g.is_active?"تعطيل":"تفعيل")+'</button></td></tr>').join("");
     rows.querySelectorAll(".edit-group").forEach(b=>b.onclick=()=>groupForm(groupCache.find(g=>g.id===b.dataset.id)));
     rows.querySelectorAll("[data-toggle]").forEach(b=>b.onclick=()=>toggleGroup(b.dataset.toggle,b.dataset.active==="1"));
   }catch(e){notice.textContent=e.message;}
 }
 function groupForm(group=null){
   const wrap=$("#groupFormWrap");if(!wrap)return;
   wrap.innerHTML='<form id="groupEditor" class="student-editor"><div class="section-head"><h3>'+(group?"تعديل بيانات المجموعة":"إضافة مجموعة جديدة")+'</h3><button type="button" id="cancelGroup" class="ghost">إغلاق</button></div><div class="student-fields"><label>اسم المجموعة<input name="name" required minlength="2" maxlength="80" value="'+esc(group?.name||"")+'"></label><label>وصف المجموعة (اختياري)<input name="description" maxlength="500" value="'+esc(group?.description||"")+'"></label></div><div class="form-actions"><button class="primary">'+(group?"حفظ التعديلات":"حفظ المجموعة")+'</button><span id="groupFormMsg" role="status"></span></div></form>';
   $("#cancelGroup").onclick=()=>wrap.innerHTML="";
   $("#groupEditor").onsubmit=async e=>{e.preventDefault();const button=e.submitter,body=Object.fromEntries(new FormData(e.currentTarget));if(group)body.id=group.id;button.disabled=true;$("#groupFormMsg").textContent="جارٍ الحفظ…";
     try{await api("/api/admin/groups",{method:group?"PUT":"POST",body:JSON.stringify(body)});wrap.innerHTML="";await loadGroups($("#groupSearch")?.value||"");await refreshStats();}
     catch(err){$("#groupFormMsg").textContent=err.message;button.disabled=false;}
   };
 }
 async function toggleGroup(id,active){
   const action=active?"تعطيل المجموعة؟ سيظل الطلاب المرتبطون بها محفوظين، ولن تُحذف سجلاتهم.":"إعادة تفعيل المجموعة؟";
   if(!confirm(action))return;
   try{await api("/api/admin/groups",{method:"PUT",body:JSON.stringify({id,is_active:!active})});await loadGroups($("#groupSearch")?.value||"");await refreshStats();}
   catch(e){alert(e.message);}
 }

 function dateInput(v){if(!v)return "";const d=String(v).replace(" ","T");return d.slice(0,16);}
 function questionCard(q={},index=0){
   const type=q.question_type||"mcq",opts=Array.isArray(q.options)?q.options:(q.options_json?JSON.parse(q.options_json):[]);
   return '<div class="exam-question q-card"><div class="section-head"><b>السؤال <span class="q-number">'+(index+1)+'</span></b><button type="button" class="mini danger remove-question">حذف السؤال</button></div><label>نص السؤال<textarea class="q-text" rows="2" maxlength="2000" required>'+esc(q.question_text||"")+'</textarea></label><div class="student-fields"><label>نوع السؤال<select class="q-type"><option value="mcq" '+(type==="mcq"?"selected":"")+'>اختيار من متعدد</option><option value="true_false" '+(type==="true_false"?"selected":"")+'>صح أو خطأ</option><option value="essay" '+(type==="essay"?"selected":"")+'>مقالي</option></select></label><label>الدرجة<input class="q-points" type="number" min="0.25" max="1000" step="0.25" value="'+esc(q.points??1)+'" required></label></div><div class="q-options-wrap" '+(type==="mcq"?"":"hidden")+'><label>الاختيارات (كل اختيار في سطر منفصل)<textarea class="q-options" rows="4" placeholder="الاختيار الأول\nالاختيار الثاني">'+esc(opts.join("\n"))+'</textarea></label><label>الإجابة الصحيحة<input class="q-correct" value="'+esc(q.correct_answer||"")+'" placeholder="اكتب الإجابة المطابقة لأحد الاختيارات"></label></div><div class="q-true-wrap" '+(type==="true_false"?"":"hidden")+'><label>الإجابة الصحيحة<select class="q-true"><option value="صحيح" '+(q.correct_answer==="صحيح"?"selected":"")+'>صحيح</option><option value="خطأ" '+(q.correct_answer==="خطأ"?"selected":"")+'>خطأ</option></select></label></div><p class="q-essay-note" '+(type==="essay"?"":"hidden")+'>سيحتاج هذا السؤال إلى تصحيح يدوي بعد تسليم الطالب.</p></div>';
 }
 function bindQuestionCards(){
   const wrap=$("#questionsWrap");
   wrap.querySelectorAll(".q-card").forEach(card=>{
     card.querySelector(".remove-question").onclick=()=>{card.remove();renumberQuestions();};
     card.querySelector(".q-type").onchange=e=>{
       const type=e.target.value;
       card.querySelector(".q-options-wrap").hidden=type!=="mcq";
       card.querySelector(".q-true-wrap").hidden=type!=="true_false";
       card.querySelector(".q-essay-note").hidden=type!=="essay";
     };
   });
 }
 function renumberQuestions(){document.querySelectorAll("#questionsWrap .q-number").forEach((n,i)=>n.textContent=i+1);}
 async function renderExams(){
   currentTab="exams";const panel=$("#panel");
   panel.innerHTML='<div class="section-head"><div><h2>إدارة الامتحانات الإلكترونية</h2><p>إنشاء الامتحانات وربطها بالمجموعات وإدارة الأسئلة والوقت والمحاولات.</p></div><button id="newExamBtn" class="primary">＋ إنشاء امتحان</button></div><div id="examEditorWrap"></div><div id="examsNotice" class="notice">جارٍ تحميل الامتحانات…</div><div class="table-wrap"><table class="students-table"><thead><tr><th>الامتحان</th><th>المجموعة</th><th>الأسئلة</th><th>المدة</th><th>المحاولات</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody id="examsRows"></tbody></table></div>';
   $("#newExamBtn").onclick=()=>examForm();
   await loadExams();
 }
 async function loadExams(){
   const notice=$("#examsNotice"),rows=$("#examsRows");if(!notice||!rows)return;
   try{
     const data=await api("/api/admin/exams");const exams=data.exams||[];
     notice.textContent="عدد الامتحانات: "+exams.length;
     rows.innerHTML=exams.map(e=>'<tr><td><b>'+esc(e.title)+'</b><div class="caption">'+esc(e.created_at||"")+'</div></td><td>'+esc(e.group_name||"كل المجموعات")+'</td><td>'+Number(e.question_count||0)+'</td><td>'+Number(e.duration_minutes)+' دقيقة</td><td>'+Number(e.max_attempts)+'</td><td><span class="state '+(e.is_published?"on":"off")+'">'+(e.is_published?"منشور":"مسودة")+'</span></td><td class="actions"><button class="mini edit-exam" data-id="'+esc(e.id)+'">تعديل</button><button class="mini '+(e.is_published?"danger":"activate")+'" data-publish="'+esc(e.id)+'" data-value="'+(e.is_published?1:0)+'">'+(e.is_published?"إلغاء النشر":"نشر")+'</button><button class="mini danger delete-exam" data-id="'+esc(e.id)+'" '+(Number(e.attempt_count)>0?"disabled title='له محاولات محفوظة'":"") +'>حذف</button></td></tr>').join("");
     rows.querySelectorAll(".edit-exam").forEach(b=>b.onclick=()=>editExam(b.dataset.id));
     rows.querySelectorAll("[data-publish]").forEach(b=>b.onclick=()=>toggleExamPublish(b.dataset.publish,b.dataset.value==="1"));
     rows.querySelectorAll(".delete-exam").forEach(b=>b.onclick=()=>deleteExam(b.dataset.id));
   }catch(e){notice.textContent=e.message;}
 }
 async function examForm(exam=null,questions=[]){
   const wrap=$("#examEditorWrap");if(!wrap)return;
   let groups=[];try{groups=(await api("/api/admin/groups?status=active")).groups||[];}catch(e){$("#examsNotice").textContent=e.message;return;}
   const qList=questions.length?questions:[{}];
   wrap.innerHTML='<form id="examEditor" class="student-editor exam-editor"><div class="section-head"><h3>'+(exam?"تعديل الامتحان":"إنشاء امتحان جديد")+'</h3><button type="button" id="cancelExam" class="ghost">إغلاق</button></div><div class="student-fields"><label>عنوان الامتحان<input name="title" required minlength="3" maxlength="160" value="'+esc(exam?.title||"")+'"></label><label>المجموعة المستهدفة<select name="group_id"><option value="">كل المجموعات النشطة</option>'+groups.map(g=>'<option value="'+esc(g.id)+'" '+(exam?.group_id===g.id?"selected":"")+'>'+esc(g.name)+'</option>').join("")+'</select></label><label>مدة الامتحان بالدقائق<input name="duration_minutes" type="number" min="1" max="360" value="'+esc(exam?.duration_minutes??30)+'" required></label><label>عدد المحاولات المسموح بها<input name="max_attempts" type="number" min="1" max="10" value="'+esc(exam?.max_attempts??1)+'" required></label><label>يبدأ في (اختياري)<input name="opens_at" type="datetime-local" value="'+dateInput(exam?.opens_at)+'"></label><label>ينتهي في (اختياري)<input name="closes_at" type="datetime-local" value="'+dateInput(exam?.closes_at)+'"></label></div><label>وصف وتعليمات الامتحان<textarea name="description" rows="2" maxlength="2000">'+esc(exam?.description||"")+'</textarea></label><div class="student-fields"><label class="check-label"><input name="results_visible" type="checkbox" '+(exam?.results_visible?"checked":"")+'> إظهار النتيجة للطالب بعد التسليم</label><label class="check-label"><input name="is_published" type="checkbox" '+(exam?.is_published?"checked":"")+'> نشر الامتحان وإتاحته للطلاب</label></div><div class="section-head"><h3>أسئلة الامتحان</h3><button type="button" id="addQuestionBtn" class="ghost">＋ إضافة سؤال</button></div><div id="questionsWrap">'+qList.map((q,i)=>questionCard(q,i)).join("")+'</div><div class="form-actions"><button class="primary" id="saveExamBtn">'+(exam?"حفظ التعديلات":"إنشاء الامتحان")+'</button><span id="examFormMsg" role="status"></span></div></form>';
   $("#cancelExam").onclick=()=>wrap.innerHTML="";
   bindQuestionCards();
   $("#addQuestionBtn").onclick=()=>{const holder=$("#questionsWrap");holder.insertAdjacentHTML("beforeend",questionCard({},holder.children.length));bindQuestionCards();renumberQuestions();};
   if(exam&&Number(exam.attempt_count||0)>0){
     $("#examEditor").querySelectorAll(".q-card input,.q-card textarea,.q-card select,.remove-question,#addQuestionBtn").forEach(el=>el.disabled=true);
     $("#examFormMsg").textContent="بدأ الطلاب المحاولات؛ الأسئلة والدرجات مقفولة للحفاظ على السجلات.";
   }
   $("#examEditor").onsubmit=async e=>{
     e.preventDefault();const button=$("#saveExamBtn");button.disabled=true;$("#examFormMsg").textContent="جارٍ الحفظ…";
     const form=e.currentTarget,fd=new FormData(form),body=Object.fromEntries(fd.entries());
     body.results_visible=form.elements.results_visible.checked;body.is_published=form.elements.is_published.checked;
     body.opens_at=body.opens_at?new Date(body.opens_at).toISOString():null;body.closes_at=body.closes_at?new Date(body.closes_at).toISOString():null;
     body.questions=[...$("#questionsWrap").querySelectorAll(".q-card")].map(card=>{
       const type=card.querySelector(".q-type").value;
       return {question_text:card.querySelector(".q-text").value,question_type:type,points:card.querySelector(".q-points").value,options:type==="mcq"?card.querySelector(".q-options").value.split("\n").map(x=>x.trim()).filter(Boolean):undefined,correct_answer:type==="mcq"?card.querySelector(".q-correct").value:type==="true_false"?card.querySelector(".q-true").value:null};
     });
     if(exam)body.id=exam.id;
     try{await api("/api/admin/exams",{method:exam?"PUT":"POST",body:JSON.stringify(body)});wrap.innerHTML="";await loadExams();await refreshStats();}
     catch(err){$("#examFormMsg").textContent=err.message;button.disabled=false;}
   };
 }
 async function editExam(id){
   try{const data=await api("/api/admin/exams?id="+encodeURIComponent(id));await examForm(data.exam,data.questions||[]);}
   catch(e){alert(e.message);}
 }
 async function toggleExamPublish(id,published){
   try{const data=await api("/api/admin/exams?id="+encodeURIComponent(id));const e=data.exam;
     const body={id,title:e.title,description:e.description,group_id:e.group_id,duration_minutes:e.duration_minutes,max_attempts:e.max_attempts,opens_at:e.opens_at,closes_at:e.closes_at,results_visible:!!e.results_visible,is_published:!published,questions:(data.questions||[]).map(q=>({question_text:q.question_text,question_type:q.question_type,options:q.options_json?JSON.parse(q.options_json):[],correct_answer:q.correct_answer,points:q.points}))};
     await api("/api/admin/exams",{method:"PUT",body:JSON.stringify(body)});await loadExams();await refreshStats();
   }catch(e){alert(e.message);}
 }
 async function deleteExam(id){
   if(!confirm("حذف هذا الامتحان نهائيًا؟ لا يمكن حذف امتحان له محاولات محفوظة."))return;
   try{await api("/api/admin/exams?id="+encodeURIComponent(id),{method:"DELETE"});await loadExams();await refreshStats();}
   catch(e){alert(e.message);}
 }
 async function renderResults(){
   currentTab="results";const panel=$("#panel");
   panel.innerHTML='<div class="section-head"><div><h2>النتائج وتصحيح الأسئلة المقالية</h2><p>راجع إجابات الطلاب، أدخل درجات الأسئلة المقالية، وسيُحسب المجموع النهائي تلقائيًا.</p></div><button id="refreshResults" class="ghost">تحديث</button></div><div id="resultsNotice" class="notice">جارٍ تحميل المحاولات…</div><div class="table-wrap"><table class="students-table"><thead><tr><th>الطالب</th><th>الامتحان</th><th>المحاولة</th><th>الدرجة الحالية</th><th>المقالي المتبقي</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody id="resultsRows"></tbody></table></div><div id="attemptReview"></div>';
   $("#refreshResults").onclick=loadResults;
   await loadResults();
 }
 async function loadResults(){
   const notice=$("#resultsNotice"),rows=$("#resultsRows");if(!notice||!rows)return;
   try{
     const data=await api("/api/admin/results");const attempts=data.attempts||[];
     notice.textContent="عدد المحاولات المسجلة: "+attempts.length;
     rows.innerHTML=attempts.map(a=>'<tr><td><b>'+esc(a.full_name)+'</b><div class="caption">'+esc(a.student_code)+'</div></td><td>'+esc(a.exam_title)+'</td><td>'+Number(a.attempt_number)+'</td><td>'+ (a.score===null?"لم تُحسب بعد":Number(a.score).toFixed(2))+'</td><td>'+Number(a.pending_essays||0)+' من '+Number(a.essay_count||0)+'</td><td><span class="state '+(a.status==="graded"?"on":"off")+'">'+(a.status==="graded"?"تم التصحيح":a.status==="in_progress"?"قيد الحل":a.status==="expired"?"انتهى الوقت":"بانتظار التصحيح")+'</span></td><td><button class="mini open-attempt" data-id="'+esc(a.id)+'">عرض وتصحيح</button></td></tr>').join("");
     if(!attempts.length)rows.innerHTML='<tr><td colspan="7">لا توجد محاولات امتحان مسجلة حتى الآن.</td></tr>';
     rows.querySelectorAll(".open-attempt").forEach(b=>b.onclick=()=>openAttempt(b.dataset.id));
   }catch(e){notice.textContent=e.message;}
 }
 async function openAttempt(id){
   const wrap=$("#attemptReview");if(!wrap)return;
   try{
     const data=await api("/api/admin/results?attempt_id="+encodeURIComponent(id)),a=data.attempt,items=data.items||[];
     const essay=items.filter(x=>x.question_type==="essay");
     wrap.innerHTML='<section class="student-editor result-review"><div class="section-head"><div><h3>'+esc(a.full_name)+' — '+esc(a.exam_title)+'</h3><p>رقم المحاولة: '+Number(a.attempt_number)+' · الدرجة الحالية: <b>'+ (a.score===null?"لم تُحسب":Number(a.score).toFixed(2))+'</b></p></div><button type="button" id="closeAttempt" class="ghost">إغلاق</button></div><h3>مراجعة الإجابات</h3><div class="result-answers">'+items.map((q,i)=>'<article class="result-answer"><b>السؤال '+(i+1)+' · '+(q.question_type==="essay"?"مقالي":q.question_type==="mcq"?"اختيار من متعدد":"صح أو خطأ")+'</b><p>'+esc(q.question_text)+'</p><div class="answer-text"><span>إجابة الطالب:</span> '+esc(q.answer_text||"لم يقدّم إجابة")+'</div><div class="answer-meta">الدرجة الكاملة: '+Number(q.points).toFixed(2)+(q.question_type!=="essay"?' · الدرجة المحسوبة: '+(q.awarded_points===null?"غير متاحة":Number(q.awarded_points).toFixed(2)):"")+'</div>'+(q.question_type==="essay"?'<label class="grade-field">درجة الطالب (من '+Number(q.points).toFixed(2)+')<input class="essay-grade" type="number" min="0" max="'+Number(q.points)+'" step="0.25" data-question="'+esc(q.question_id)+'" value="'+(q.awarded_points===null?"":Number(q.awarded_points))+'" placeholder="أدخل الدرجة"></label>':'')+'</article>').join("")+'</div><div class="form-actions"><button type="button" id="saveEssayGrades" class="primary" '+(essay.length?"":"disabled")+'>حفظ التصحيح وحساب المجموع</button><span id="gradeMessage" role="status">'+(essay.length?"أدخل درجات الأسئلة المقالية التي تم تصحيحها.":"لا توجد أسئلة مقالية في هذا الامتحان.")+'</span></div></section>';
     $("#closeAttempt").onclick=()=>wrap.innerHTML="";
     $("#saveEssayGrades").onclick=async()=>{
       const grades=[...wrap.querySelectorAll(".essay-grade")].filter(input=>input.value.trim()!=="").map(input=>({question_id:input.dataset.question,awarded_points:Number(input.value)}));
       if(!grades.length){$("#gradeMessage").textContent="أدخل درجة سؤال مقالي واحد على الأقل.";return;}
       if(!confirm("حفظ درجات الأسئلة المقالية المحددة وإعادة حساب مجموع الطالب؟"))return;
       const button=$("#saveEssayGrades");button.disabled=true;$("#gradeMessage").textContent="جارٍ حفظ الدرجات وحساب المجموع…";
       try{
         const result=await api("/api/admin/results",{method:"PUT",body:JSON.stringify({attempt_id:id,grades})});
         $("#gradeMessage").textContent="تم الحفظ. المجموع الحالي: "+Number(result.score).toFixed(2)+(result.status==="graded"?" — اكتمل التصحيح.":" — ما زالت هناك أسئلة مقالية لم تُصحح.");
         await loadResults();await openAttempt(id);
       }catch(err){$("#gradeMessage").textContent=err.message;button.disabled=false;}
     };
     wrap.scrollIntoView({behavior:"smooth",block:"start"});
   }catch(e){wrap.innerHTML='<div class="notice">'+esc(e.message)+'</div>';}
 }
 async function renderAdmins(){
   currentTab="admins";const panel=$("#panel");
   panel.innerHTML='<div class="section-head"><div><h2>إدارة المشرفين</h2><p>إنشاء حسابات إدارية ومتابعة حالتها. لا يمكن حذف السجلات أو تعطيل المدير الحالي.</p></div><button id="addAdminBtn" class="primary">＋ إضافة مشرف</button></div><div id="adminFormWrap"></div><div id="adminsNotice" class="notice">جارٍ تحميل الحسابات…</div><div class="table-wrap"><table class="students-table"><thead><tr><th>الاسم</th><th>اسم المستخدم</th><th>الدور</th><th>الحالة</th><th>تاريخ الإنشاء</th><th>الإجراء</th></tr></thead><tbody id="adminsRows"></tbody></table></div>';
   $("#addAdminBtn").onclick=()=>adminForm();await loadAdmins();
 }
 async function loadAdmins(){
   const notice=$("#adminsNotice"),rows=$("#adminsRows");if(!notice||!rows)return;
   try{const data=await api("/api/admin/admins");const admins=data.admins||[];
     notice.textContent="عدد الحسابات الإدارية: "+admins.length;
     rows.innerHTML=admins.map(a=>'<tr><td>'+esc(a.full_name)+'</td><td><code>'+esc(a.username)+'</code></td><td>'+esc(({super_admin:"مدير رئيسي",teacher:"معلم",supervisor:"مشرف",exam_monitor:"مراقب امتحان"})[a.role]||a.role)+'</td><td><span class="state '+(a.is_active?"on":"off")+'">'+(a.is_active?"نشط":"معطّل")+'</span></td><td>'+esc(a.created_at||"—")+'</td><td class="actions"><button class="mini '+(a.is_active?"danger":"activate")+'" data-admin-toggle="'+esc(a.id)+'" data-active="'+(a.is_active?1:0)+'" '+(a.is_self||a.role==="super_admin"?"disabled title=\"لا يمكن تعطيل هذا الحساب من هنا\"":"")+'>'+(a.is_active?"تعطيل":"تفعيل")+'</button></td></tr>').join("");
     rows.querySelectorAll("[data-admin-toggle]").forEach(b=>b.onclick=()=>toggleAdmin(b.dataset.adminToggle,b.dataset.active==="1"));
   }catch(e){notice.textContent=e.message;}
 }
 function adminForm(){
   const wrap=$("#adminFormWrap");
   wrap.innerHTML='<form id="adminEditor" class="student-editor"><div class="section-head"><h3>إنشاء حساب مشرف</h3><button type="button" id="cancelAdmin" class="ghost">إغلاق</button></div><div class="student-fields"><label>الاسم الكامل<input name="full_name" required minlength="3" maxlength="100"></label><label>اسم المستخدم<input name="username" required minlength="4" maxlength="40" pattern="[A-Za-z0-9._-]+"></label><label>كلمة المرور المؤقتة<input name="password" type="password" required minlength="12" maxlength="128" autocomplete="new-password"></label><label>الدور<select name="role"><option value="supervisor">مشرف</option><option value="teacher">معلم</option><option value="exam_monitor">مراقب امتحان</option></select></label></div><p class="caption">يجب تسليم المشرف كلمة المرور المؤقتة بشكل آمن، ويمكنه استخدامها لتسجيل الدخول.</p><div class="form-actions"><button class="primary">إنشاء الحساب</button><span id="adminFormMsg" role="status"></span></div></form>';
   $("#cancelAdmin").onclick=()=>wrap.innerHTML="";
   $("#adminEditor").onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;$("#adminFormMsg").textContent="جارٍ إنشاء الحساب…";
     try{await api("/api/admin/admins",{method:"POST",body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});wrap.innerHTML="";await loadAdmins();await refreshStats();}
     catch(err){$("#adminFormMsg").textContent=err.message;button.disabled=false;}
   };
 }
 async function toggleAdmin(id,active){
   if(!confirm(active?"تعطيل حساب هذا المشرف؟ لن يتمكن من تسجيل الدخول.":"إعادة تفعيل حساب هذا المشرف؟"))return;
   try{await api("/api/admin/admins",{method:"PUT",body:JSON.stringify({id,is_active:!active})});await loadAdmins();await refreshStats();}
   catch(e){alert(e.message);}
 }

 async function renderHonors(){
   currentTab="honors";const panel=$("#panel");
   panel.innerHTML='<div class="section-head"><div><h2>إدارة لائحة الشرف</h2><p>تكريم الطلاب المتميزين في الصفوف الأول والثاني والثالث الثانوي.</p></div><button id="addHonorBtn" class="primary">＋ إضافة طالب متميز</button></div><div id="honorFormWrap"></div><div id="honorsNotice" class="notice">جارٍ تحميل لائحة الشرف…</div><div class="table-wrap"><table class="students-table"><thead><tr><th>الطالب</th><th>الصف الدراسي</th><th>المجموعة</th><th>الإنجاز</th><th>الحالة</th><th>الإجراءات</th></tr></thead><tbody id="honorsRows"></tbody></table></div>';
   $("#addHonorBtn").onclick=()=>honorForm();await loadHonors();
 }
 let honorCache=[];
 async function loadHonors(){
   const notice=$("#honorsNotice"),rows=$("#honorsRows");if(!notice||!rows)return;
   try{const data=await api("/api/admin/honors");honorCache=data.students||[];
     notice.textContent="عدد الأسماء في اللائحة: "+honorCache.length;
     rows.innerHTML=honorCache.map(s=>'<tr><td>'+esc(s.full_name)+'</td><td>'+esc(s.grade)+'</td><td>'+esc(s.group_name||"—")+'</td><td>'+esc(s.achievement||"—")+'</td><td><span class="state '+(s.is_active?"on":"off")+'">'+(s.is_active?"ظاهر للعامة":"مخفي")+'</span></td><td class="actions"><button class="mini edit-honor" data-id="'+esc(s.id)+'">تعديل</button><button class="mini '+(s.is_active?"danger":"activate")+'" data-toggle-honor="'+esc(s.id)+'" data-active="'+(s.is_active?1:0)+'">'+(s.is_active?"إخفاء":"إظهار")+'</button><button class="mini danger" data-delete-honor="'+esc(s.id)+'">حذف</button></td></tr>').join("");
     rows.querySelectorAll(".edit-honor").forEach(b=>b.onclick=()=>honorForm(honorCache.find(s=>s.id===b.dataset.id)));
     rows.querySelectorAll("[data-toggle-honor]").forEach(b=>b.onclick=()=>toggleHonor(b.dataset.toggleHonor,b.dataset.active==="1"));
     rows.querySelectorAll("[data-delete-honor]").forEach(b=>b.onclick=()=>deleteHonor(b.dataset.deleteHonor));
   }catch(e){notice.textContent=e.message;}
 }
 async function honorForm(student=null){
   const wrap=$("#honorFormWrap");if(!wrap)return;
   let groups=[];try{groups=(await api("/api/admin/groups?status=all")).groups||[];}catch(e){$("#honorsNotice").textContent=e.message;return;}
   const grades=["الصف الأول الثانوي","الصف الثاني الثانوي","الصف الثالث الثانوي"];
   wrap.innerHTML='<form id="honorEditor" class="student-editor"><div class="section-head"><h3>'+(student?"تعديل بيانات الطالب":"إضافة طالب إلى لائحة الشرف")+'</h3><button type="button" id="cancelHonor" class="ghost">إغلاق</button></div><div class="student-fields"><label>اسم الطالب<input name="full_name" required minlength="3" maxlength="120" value="'+esc(student?.full_name||"")+'"></label><label>المرحلة الدراسية<select name="grade" required>'+grades.map(g=>'<option value="'+g+'" '+(student?.grade===g?"selected":"")+'>'+g+'</option>').join("")+'</select></label><label>مجموعة الدروس<select name="group_id"><option value="">بدون مجموعة</option>'+groups.map(g=>'<option value="'+esc(g.id)+'" '+(student?.group_id===g.id?"selected":"")+'>'+esc(g.name)+'</option>').join("")+'</select></label><label>رابط صورة الطالب (https://)<input name="photo_url" type="url" placeholder="https://example.com/student.jpg" value="'+esc(student?.photo_url||"")+'"></label><label>الإنجاز أو سبب التكريم<input name="achievement" maxlength="1000" placeholder="مثال: التفوق في مادة التاريخ" value="'+esc(student?.achievement||"")+'"></label><label>ترتيب العرض<input name="sort_order" type="number" min="0" max="9999" value="'+esc(student?.sort_order??0)+'"></label></div><p class="caption">أدخل رابط صورة مباشر وآمن يبدأ بـ https://. رفع الصور من الجهاز غير مفعّل في هذه المرحلة.</p><div class="form-actions"><button class="primary">'+(student?"حفظ التعديلات":"إضافة إلى اللائحة")+'</button><span id="honorFormMsg" role="status"></span></div></form>';
   $("#cancelHonor").onclick=()=>wrap.innerHTML="";
   $("#honorEditor").onsubmit=async e=>{e.preventDefault();const button=e.submitter,body=Object.fromEntries(new FormData(e.currentTarget));if(student)body.id=student.id;button.disabled=true;$("#honorFormMsg").textContent="جارٍ الحفظ…";
     try{await api("/api/admin/honors",{method:student?"PUT":"POST",body:JSON.stringify(body)});wrap.innerHTML="";await loadHonors();await refreshStats();}
     catch(err){$("#honorFormMsg").textContent=err.message;button.disabled=false;}
   };
 }
 async function toggleHonor(id,active){
   if(!confirm(active?"إخفاء هذا الطالب من لائحة الشرف العامة؟":"إظهار هذا الطالب في لائحة الشرف؟"))return;
   try{await api("/api/admin/honors",{method:"PUT",body:JSON.stringify({id,is_active:!active})});await loadHonors();}
   catch(e){alert(e.message);}
 }
 async function deleteHonor(id){
   if(!confirm("حذف هذا الاسم نهائيًا من لائحة الشرف؟"))return;
   try{await api("/api/admin/honors?id="+encodeURIComponent(id),{method:"DELETE"});await loadHonors();await refreshStats();}
   catch(e){alert(e.message);}
 }

 async function renderLogs(){
   currentTab="logs";const panel=$("#panel");
   panel.innerHTML='<div class="section-head"><div><h2>سجل العمليات</h2><p>عرض أحدث العمليات الإدارية المسجلة على البوابة.</p></div><div class="actions"><button id="refreshLogs" class="ghost">تحديث</button><button id="clearLogs" class="mini danger">حذف السجلات</button></div></div><div class="student-tools"><input id="logSearch" placeholder="ابحث باسم المسؤول أو نوع العملية أو القسم"><button id="searchLogs" class="ghost">بحث</button></div><div id="logsNotice" class="notice">جارٍ تحميل سجل العمليات…</div><div class="table-wrap"><table class="students-table"><thead><tr><th>التاريخ</th><th>المسؤول</th><th>العملية</th><th>القسم</th><th>التفاصيل</th></tr></thead><tbody id="logsRows"></tbody></table></div>';
   $("#refreshLogs").onclick=()=>loadLogs();$("#clearLogs").onclick=async()=>{if(!confirm("تحذير: سيتم حذف جميع سجلات العمليات الحالية نهائيًا. سيُحتفظ بسجل واحد يوثق عملية الحذف. هل تريد المتابعة؟"))return;const b=$("#clearLogs");b.disabled=true;try{const result=await api("/api/admin/logs",{method:"DELETE",body:JSON.stringify({confirm:"DELETE_ALL_LOGS"})});await loadLogs($("#logSearch").value.trim());alert("تم حذف "+Number(result.deleted_count||0)+" سجل.");}catch(e){alert(e.message);}finally{b.disabled=false;}};$("#searchLogs").onclick=()=>loadLogs($("#logSearch").value.trim());$("#logSearch").addEventListener("keydown",e=>{if(e.key==="Enter")loadLogs(e.target.value.trim());});await loadLogs();
 }
 async function loadLogs(q=""){
   const notice=$("#logsNotice"),rows=$("#logsRows");if(!notice||!rows)return;
   try{const data=await api("/api/admin/logs?q="+encodeURIComponent(q));const logs=data.logs||[];
     notice.textContent="عدد العمليات المعروضة: "+logs.length;
     rows.innerHTML=logs.map(l=>{let details="";try{const d=JSON.parse(l.details_json||"{}");details=Object.entries(d).map(([k,v])=>k+": "+String(v)).join(" · ");}catch{details=l.details_json||"";}return '<tr><td>'+esc(l.created_at||"—")+'</td><td>'+esc(l.admin_name||"نظام")+'</td><td><code>'+esc(l.action)+'</code></td><td>'+esc(l.target_type||"—")+'</td><td>'+esc(details||l.target_id||"—")+'</td></tr>';}).join("");
     if(!logs.length)rows.innerHTML='<tr><td colspan="5">لا توجد عمليات مطابقة.</td></tr>';
   }catch(e){notice.textContent=e.message;}
 }
 async function init(){try{const state=await api("/api/admin/me");if(state.authenticated)await showDashboard(state.admin);else showAuth(state.setupRequired);}catch(e){showAuth(false);msg.textContent=e.message;}}
 login.addEventListener("submit",async e=>{e.preventDefault();msg.textContent="جارٍ التحقق…";const f=new FormData(login);try{const r=await api("/api/admin/login",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});currentTab="overview";await showDashboard(r.admin);}catch(err){msg.textContent=err.message;}});
 setup.addEventListener("submit",async e=>{e.preventDefault();msg.textContent="جارٍ إنشاء الحساب…";const f=new FormData(setup);try{const r=await api("/api/admin/setup",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});await showDashboard(r.admin);}catch(err){msg.textContent=err.message;}});
 $("#logoutBtn").addEventListener("click",async()=>{try{await api("/api/admin/logout",{method:"POST",body:"{}"});}finally{location.reload();}});
 document.querySelectorAll("[data-tab]").forEach(btn=>btn.addEventListener("click",async()=>{document.querySelectorAll("[data-tab]").forEach(x=>x.classList.remove("active"));btn.classList.add("active");const tab=btn.dataset.tab;if(tab==="students")await renderStudents();else if(tab==="groups")await renderGroups();else if(tab==="honors")await renderHonors();else if(tab==="exams")await renderExams();else if(tab==="results")await renderResults();else if(tab==="admins")await renderAdmins();else if(tab==="logs")await renderLogs();else if(tab==="overview"){currentTab="overview";$("#panel").innerHTML="<h2>نظرة عامة</h2><div id='stats' class='stats'></div>";await refreshStats();}}));
 init();
})();
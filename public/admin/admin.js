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
   if(currentTab==="students") await renderStudents(); else if(currentTab==="groups") await renderGroups();
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
 async function showPlaceholder(tab,label){
   currentTab=tab;$("#panel").innerHTML="<h2>"+esc(label)+"</h2><p class='notice'>سيتم تفعيل هذا القسم في مرحلة مستقلة بعد اختبار إدارة الطلاب.</p>";
 }
 async function init(){try{const state=await api("/api/admin/me");if(state.authenticated)await showDashboard(state.admin);else showAuth(state.setupRequired);}catch(e){showAuth(false);msg.textContent=e.message;}}
 login.addEventListener("submit",async e=>{e.preventDefault();msg.textContent="جارٍ التحقق…";const f=new FormData(login);try{const r=await api("/api/admin/login",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});currentTab="overview";await showDashboard(r.admin);}catch(err){msg.textContent=err.message;}});
 setup.addEventListener("submit",async e=>{e.preventDefault();msg.textContent="جارٍ إنشاء الحساب…";const f=new FormData(setup);try{const r=await api("/api/admin/setup",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});await showDashboard(r.admin);}catch(err){msg.textContent=err.message;}});
 $("#logoutBtn").addEventListener("click",async()=>{try{await api("/api/admin/logout",{method:"POST",body:"{}"});}finally{location.reload();}});
 document.querySelectorAll("[data-tab]").forEach(btn=>btn.addEventListener("click",async()=>{document.querySelectorAll("[data-tab]").forEach(x=>x.classList.remove("active"));btn.classList.add("active");const tab=btn.dataset.tab;if(tab==="students")await renderStudents();else if(tab==="groups")await renderGroups();else if(tab==="overview"){currentTab="overview";$("#panel").innerHTML="<h2>نظرة عامة</h2><div id='stats' class='stats'></div>";await refreshStats();}else await showPlaceholder(tab,btn.textContent);}));
 init();
})();
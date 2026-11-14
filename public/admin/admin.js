(() => {
 const $=s=>document.querySelector(s), authView=$("#authView"), dashboard=$("#dashboard"), login=$("#loginForm"), setup=$("#setupForm"), msg=$("#authMessage");
 $("#year").textContent=new Date().getFullYear();
 async function api(url,options={}) {
   const response=await fetch(url,{credentials:"same-origin",headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
   const raw=await response.text();
   let data;
   try { data=JSON.parse(raw); }
   catch {
     const preview=raw.replace(/<[^>]*>/g," ").replace(/\\s+/g," ").trim().slice(0,180);
     throw new Error("الخادم أعاد استجابة غير متوقعة (HTTP "+response.status+"). "+(preview||"لم يصل رد نصي واضح."));
   }
   if(!response.ok) throw new Error(data.message||("حدث خطأ من الخادم (HTTP "+response.status+")."));
   return data;
 }
 function showAuth(setupNeeded) {
   authView.classList.remove("hidden");dashboard.classList.add("hidden");
   if(setupNeeded){$("#authTitle").textContent="إعداد الإدارة لأول مرة";$("#authDesc").textContent="أنشئ حساب المدير الرئيسي. رمز التهيئة صالح لإنشاء الحساب الأول فقط.";setup.classList.remove("hidden");login.classList.add("hidden");}
   else{$("#authTitle").textContent="تسجيل دخول الإدارة";$("#authDesc").textContent="هذه المنطقة مخصصة للمسؤولين المعتمدين فقط.";login.classList.remove("hidden");setup.classList.add("hidden");}
 }
 async function showDashboard(admin) {
   authView.classList.add("hidden");dashboard.classList.remove("hidden");$("#adminName").textContent=admin.full_name;
   try {const s=await api("/api/admin/overview");$("#stats").innerHTML=[["students","الطلاب"],["groups","المجموعات"],["exams","الامتحانات"],["attempts","المحاولات"],["admins","المسؤولون"]].map(([k,l])=>'<div class="stat"><b>'+Number(s[k]||0)+'</b><span>'+l+'</span></div>').join("");}catch(e){$("#stats").textContent=e.message;}
 }
 async function init(){
   try {const state=await api("/api/admin/me");if(state.authenticated) await showDashboard(state.admin);else showAuth(state.setupRequired);}
   catch(e){showAuth(false);msg.textContent=e.message;}
 }
 login.addEventListener("submit",async e=>{e.preventDefault();msg.textContent="جارٍ التحقق…";const f=new FormData(login);try{const r=await api("/api/admin/login",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});await showDashboard(r.admin);}catch(err){msg.textContent=err.message;}});
 setup.addEventListener("submit",async e=>{e.preventDefault();msg.textContent="جارٍ إنشاء الحساب…";const f=new FormData(setup);try{const r=await api("/api/admin/setup",{method:"POST",body:JSON.stringify(Object.fromEntries(f))});await showDashboard(r.admin);}catch(err){msg.textContent=err.message;}});
 $("#logoutBtn").addEventListener("click",async()=>{try{await api("/api/admin/logout",{method:"POST",body:"{}"});}finally{location.reload();}});
 document.querySelectorAll("[data-tab]").forEach(btn=>btn.addEventListener("click",()=>{document.querySelectorAll("[data-tab]").forEach(x=>x.classList.remove("active"));btn.classList.add("active");$("#panel").innerHTML="<h2>"+btn.textContent+"</h2><p class='notice'>هذا القسم ضمن خطة التنفيذ التالية. لن يتم عرض بيانات أو أدوات غير مفعّلة.</p>";}));
 init();
})();
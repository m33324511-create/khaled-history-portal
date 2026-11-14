(() => {
  const root = document.documentElement;
  const themeToggle = document.getElementById('themeToggle');
  const themeIcon = themeToggle.querySelector('.theme-icon');
  const themeLabel = themeToggle.querySelector('.theme-label');
  const savedTheme = localStorage.getItem('history-portal-theme');
  const preferred = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  setTheme(savedTheme || preferred);
  function setTheme(theme) {
    root.dataset.theme = theme;
    themeIcon.textContent = theme === 'dark' ? '☾' : '☀';
    themeLabel.textContent = theme === 'dark' ? 'الوضع الداكن' : 'الوضع الفاتح';
    document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#101d2c' : '#f2f5f3';
    localStorage.setItem('history-portal-theme', theme);
  }
  themeToggle.addEventListener('click', () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark'));
  document.getElementById('year').textContent = new Date().getFullYear();

  const modal = document.getElementById('loginModal');
  const form = document.getElementById('studentLoginForm');
  const message = document.getElementById('formMessage');
  function openLogin() { modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; setTimeout(() => document.getElementById('studentName').focus(), 80); }
  function closeLogin() { modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; message.textContent = ''; }
  document.querySelectorAll('[data-open-login]').forEach(button => button.addEventListener('click', openLogin));
  document.querySelectorAll('[data-close-login]').forEach(button => button.addEventListener('click', closeLogin));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && modal.classList.contains('open')) closeLogin(); });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    message.textContent = 'جارٍ التحقق من البيانات…';
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    const data = Object.fromEntries(new FormData(form).entries());
    try {
      const response = await fetch('/api/student-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'تعذر تسجيل الدخول. راجع بياناتك أو تواصل مع الإدارة.');
      message.textContent = result.message || 'تم التحقق بنجاح.';
      await loadStudentHome();
    } catch (error) {
      message.textContent = error.message.includes('404') || error.message.includes('Failed to fetch')
        ? 'خدمة تسجيل الدخول لم تُفعّل بعد. اربط قاعدة D1 وانشر وظائف Pages أولًا.'
        : error.message;
    } finally { submit.disabled = false; }
  });

  const menuToggle = document.getElementById('menuToggle');
  menuToggle.addEventListener('click', () => {
    const nav = document.querySelector('.desktop-nav');
    const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
    menuToggle.setAttribute('aria-expanded', String(!isOpen));
    if (!isOpen) {
      nav.style.display = 'flex'; nav.style.position = 'absolute'; nav.style.top = '69px'; nav.style.left = '12px'; nav.style.right = '12px'; nav.style.padding = '18px'; nav.style.border = '1px solid var(--line)'; nav.style.borderRadius = '14px'; nav.style.background = 'var(--surface)'; nav.style.flexDirection = 'column'; nav.style.alignItems = 'stretch'; nav.style.zIndex = '30';
    } else { nav.removeAttribute('style'); }
  });
  document.querySelectorAll('.desktop-nav a').forEach(link => link.addEventListener('click', () => { if (window.innerWidth <= 1000) { document.querySelector('.desktop-nav').removeAttribute('style'); menuToggle.setAttribute('aria-expanded', 'false'); } }));

  // Student dashboard and timed exam workflow
  const dashboard = document.createElement('section');
  dashboard.id = 'studentDashboard';
  dashboard.className = 'student-dashboard';
  dashboard.hidden = true;
  document.querySelector('.site-shell').insertBefore(dashboard, document.querySelector('.footer'));
  let activeAttempt = null, examTimer = null, saveTimer = null, saving = Promise.resolve();
  const htmlSafe = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  async function studentApi(url, options={}) {
    const response = await fetch(url, {credentials:'same-origin', ...options, headers:{'Content-Type':'application/json', ...(options.headers||{})}});
    let data={};try{data=await response.json()}catch{}
    if(!response.ok) throw new Error(data.message || 'حدث خطأ أثناء الاتصال بالخادم.');
    return data;
  }
  function showStudentDashboard() {
    document.querySelector('main').hidden = true;
    document.querySelector('.footer').hidden = true;
    dashboard.hidden = false;
    closeLogin();
    dashboard.scrollIntoView({behavior:'smooth',block:'start'});
  }
  async function loadStudentHome() {
    clearInterval(examTimer); activeAttempt=null;
    const data=await studentApi('/api/student/exams');
    showStudentDashboard();
    dashboard.innerHTML = '<div class="student-wrap"><div class="student-top"><div><span class="student-kicker">STUDENT SPACE</span><h1>مرحبًا، '+htmlSafe(data.student.full_name)+'</h1><p>الرقم التعريفي: '+htmlSafe(data.student.student_code)+'</p></div><button id="studentLogout" class="student-logout">تسجيل الخروج</button></div><div class="student-heading"><div><span class="student-kicker">YOUR EXAMS</span><h2>الامتحانات المتاحة</h2></div><button id="refreshStudentExams" class="student-secondary">تحديث</button></div><div id="studentExamMessage" class="student-message"></div><div id="studentExamGrid" class="student-exam-grid"></div><div class="student-heading history-heading"><div><span class="student-kicker">YOUR ACTIVITY</span><h2>سجل المحاولات والنتائج</h2></div></div><div id="studentHistory" class="student-history"></div></div>';
    document.getElementById('studentLogout').onclick=studentLogout;
    document.getElementById('refreshStudentExams').onclick=loadStudentHome;
    const grid=document.getElementById('studentExamGrid');
    if(!data.exams.length){grid.innerHTML='<div class="student-empty">لا توجد امتحانات منشورة لمجموعتك حاليًا.</div>';}
    else grid.innerHTML=data.exams.map(exam=>{
      const state=exam.active_attempt?'لديك محاولة جارية':!exam.available?'غير متاح حاليًا':exam.attempts_left<=0?'استنفدت المحاولات':'متاح للبدء';
      const disabled=!exam.can_start;
      return '<article class="student-exam-card"><div class="student-card-top"><span class="student-status '+(disabled?'muted':'ready')+'">'+state+'</span><span class="student-duration">◷ '+Number(exam.duration_minutes)+' دقيقة</span></div><h3>'+htmlSafe(exam.title)+'</h3><p>'+htmlSafe(exam.description||'امتحان إلكتروني لقياس مستواك.')+'</p><div class="student-exam-meta"><span>عدد الأسئلة: '+Number(exam.question_count)+'</span><span>المحاولات المتبقية: '+Number(exam.attempts_left)+'</span></div><button class="student-start" data-exam="'+htmlSafe(exam.id)+'" '+(disabled?'disabled':'')+'>'+(exam.active_attempt?'استكمال الامتحان':'بدء الامتحان')+' ←</button></article>';
    }).join('');

    grid.querySelectorAll('[data-exam]').forEach(button=>button.onclick=()=>startStudentExam(button.dataset.exam,button));
    const history=document.getElementById('studentHistory');
    const attempts=data.attempts||[];
    if(!attempts.length){history.innerHTML='<div class="student-empty">لم تسجل أي محاولة حتى الآن.</div>';return;}
    history.innerHTML=attempts.map(a=>{
      const status=a.status==='in_progress'?'محاولة جارية':a.status==='graded'?'تم التصحيح':a.status==='expired'?'انتهى الوقت':'بانتظار التصحيح';
      const score=a.score!==null?'النتيجة: '+Number(a.score).toFixed(2):a.status==='submitted'?'الأسئلة المقالية بانتظار التصحيح':'النتيجة غير متاحة حاليًا';
      return '<article class="student-history-row"><div><b>'+htmlSafe(a.exam_title)+'</b><small>المحاولة '+Number(a.attempt_number)+' · '+status+'</small><small>'+score+'</small></div><button class="student-secondary" data-attempt="'+htmlSafe(a.id)+'">'+(a.status==='in_progress'?'استكمال':'عرض الحالة')+'</button></article>';
    }).join('');
    history.querySelectorAll('[data-attempt]').forEach(button=>button.onclick=()=>openStudentAttempt(button.dataset.attempt));
  }
  async function startStudentExam(examId,button) {
    button.disabled=true;button.textContent='جارٍ فتح الامتحان…';
    try{
      const started=await studentApi('/api/student/attempt',{method:'POST',body:JSON.stringify({exam_id:examId})});
      await openStudentAttempt(started.attempt_id);
    }catch(e){document.getElementById('studentExamMessage').textContent=e.message;button.disabled=false;button.textContent='بدء الامتحان ←';}
  }
  function currentAnswers() {
    if(!activeAttempt)return [];
    return [...dashboard.querySelectorAll('[data-question]')].map(el=>({question_id:el.dataset.question,answer_text:el.type==='radio'?(dashboard.querySelector('input[name="answer-'+CSS.escape(el.dataset.question)+'"]:checked')?.value||''):el.value})).filter((item,index,arr)=>arr.findIndex(x=>x.question_id===item.question_id)===index);
  }
  function saveStudentAnswers(submit=false) {
    if(!activeAttempt)return Promise.resolve();
    const payload={attempt_id:activeAttempt.id,answers:currentAnswers(),submit};
    saving=saving.catch(()=>{}).then(()=>studentApi('/api/student/attempt',{method:'PUT',body:JSON.stringify(payload)}));
    return saving;
  }
  function scheduleAnswerSave() {
    clearTimeout(saveTimer);
    const label=document.getElementById('studentSaveState');
    if(label)label.textContent='جارٍ حفظ إجاباتك…';
    saveTimer=setTimeout(()=>saveStudentAnswers(false).then(()=>{if(label)label.textContent='تم حفظ إجاباتك تلقائيًا';}).catch(e=>{if(label)label.textContent=e.message;}),650);
  }
  async function openStudentAttempt(id) {
    const data=await studentApi('/api/student/attempt?id='+encodeURIComponent(id));
    activeAttempt=data.attempt;showStudentDashboard();
    if(activeAttempt.status!=='in_progress'){
      renderAttemptFinished(data);return;
    }
    dashboard.innerHTML='<div class="student-wrap"><div class="exam-live-head"><button id="backToExams" class="student-secondary">← قائمة الامتحانات</button><div><span class="student-kicker">EXAM IN PROGRESS</span><h1>'+htmlSafe(activeAttempt.exam_title)+'</h1></div><div class="exam-clock" id="examClock">--:--</div></div><div class="exam-instructions">اقرأ كل سؤال جيدًا، واختر إجابتك أو اكتبها. يتم حفظ الإجابات تلقائيًا، وينتهي الامتحان عند انتهاء الوقت.</div><div class="exam-question-list">'+data.questions.map((q,i)=>{
      const answer=q.answer_text||'';
      let control='';
      if(q.question_type==='essay')control='<textarea class="student-essay" data-question="'+htmlSafe(q.id)+'" rows="5" placeholder="اكتب إجابتك هنا">'+htmlSafe(answer)+'</textarea>';
      else control='<div class="student-options">'+q.options.map(option=>'<label class="student-option"><input type="radio" name="answer-'+htmlSafe(q.id)+'" data-question="'+htmlSafe(q.id)+'" value="'+htmlSafe(option)+'" '+(answer===option?'checked':'')+'><span>'+htmlSafe(option)+'</span></label>').join('')+'</div>';
      return '<article class="student-question"><div class="question-label">السؤال '+(i+1)+' <span>'+Number(q.points)+' درجات</span></div><h3>'+htmlSafe(q.question_text)+'</h3>'+control+'</article>';
    }).join('')+'</div><div class="exam-submit-row"><span id="studentSaveState">تم تحميل إجاباتك</span><button id="submitStudentExam" class="student-submit">تسليم الامتحان</button></div></div>';
    document.getElementById('backToExams').onclick=()=>{if(confirm('العودة إلى القائمة؟ ستظل محاولتك محفوظة ويمكنك استكمالها قبل انتهاء الوقت.'))loadStudentHome();};
    dashboard.querySelectorAll('[data-question]').forEach(input=>input.addEventListener(input.type==='radio'?'change':'input',scheduleAnswerSave));
    document.getElementById('submitStudentExam').onclick=()=>submitStudentAttempt(false);
    updateExamClock();
    examTimer=setInterval(updateExamClock,1000);
  }
  function updateExamClock() {
    if(!activeAttempt)return;
    const seconds=Math.max(0,Math.floor((Date.parse(activeAttempt.deadline)-Date.now())/1000));
    const clock=document.getElementById('examClock');if(clock)clock.textContent=String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');
    if(seconds<=0){clearInterval(examTimer);submitStudentAttempt(true);}
  }
  async function submitStudentAttempt(auto=false) {
    if(!activeAttempt)return;
    const button=document.getElementById('submitStudentExam');if(button)button.disabled=true;
    if(!auto&&!confirm('هل أنت متأكد من تسليم الامتحان نهائيًا؟ لن تتمكن من تعديل إجاباتك بعد التسليم.')){if(button)button.disabled=false;return;}
    clearTimeout(saveTimer);clearInterval(examTimer);
    try{await saveStudentAnswers(true);await openStudentAttempt(activeAttempt.id);}
    catch(e){const state=document.getElementById('studentSaveState');if(state)state.textContent=e.message;if(button)button.disabled=false;if(Date.now()>=Date.parse(activeAttempt.deadline)){try{await openStudentAttempt(activeAttempt.id);}catch{}}}
  }
  function renderAttemptFinished(data) {
    const a=data.attempt;
    let resultText='تم تسليم إجاباتك بنجاح.';
    if(a.status==='expired')resultText='انتهى وقت هذه المحاولة.';
    if(a.status==='submitted')resultText='تم التسليم. إجابات الأسئلة المقالية بانتظار تصحيح الإدارة.';
    if(a.status==='graded'&&a.results_visible&&a.score!==null)resultText='نتيجتك النهائية: '+Number(a.score).toFixed(2);
    else if(a.status==='graded'&&!a.results_visible)resultText='تم تصحيح الامتحان. ستظهر النتيجة عندما تسمح الإدارة بعرضها.';
    dashboard.innerHTML='<div class="student-wrap"><div class="student-finished"><div class="finished-symbol">✓</div><span class="student-kicker">EXAM STATUS</span><h1>'+htmlSafe(a.exam_title)+'</h1><p>'+htmlSafe(resultText)+'</p><button id="returnStudentHome" class="student-start">العودة إلى الامتحانات</button></div></div>';
    document.getElementById('returnStudentHome').onclick=loadStudentHome;
  }
  async function studentLogout() {
    clearInterval(examTimer);clearTimeout(saveTimer);
    try{await studentApi('/api/student/logout',{method:'POST',body:'{}'});}catch{}
    dashboard.hidden=true;document.querySelector('main').hidden=false;document.querySelector('.footer').hidden=false;dashboard.innerHTML='';
  }

  // Resume a valid student session after a page refresh.
  studentApi('/api/student/exams').then(()=>loadStudentHome()).catch(()=>{});
})();
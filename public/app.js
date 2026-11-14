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
      // The student dashboard is the next implementation stage.
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
})();

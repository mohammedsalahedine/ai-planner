const API = '';
let currentUser = null;

function getToken() { return localStorage.getItem('token'); }
function setToken(t) { localStorage.setItem('token', t); }
function clearToken() { localStorage.removeItem('token'); }

function getTheme() { return localStorage.getItem('theme') || 'dark'; }
function setTheme(t) {
  localStorage.setItem('theme', t);
  document.documentElement.setAttribute('data-theme', t);
}

async function apiFetch(path, opts = {}) {
  const token = getToken();
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API + path, { ...opts, headers });
  if (res.status === 401) { clearToken(); location.href = '/'; return; }
  return res.json();
}

function toast(msg, type = 'success') {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ar-SA', { year: 'numeric', month: 'short', day: 'numeric' });
}

const categories = {
  book: { label: 'كتاب', icon: '📖' },
  course: { label: 'دورة', icon: '🎓' },
  movie: { label: 'فيلم', icon: '🎬' },
  project: { label: 'مشروع', icon: '📁' },
  training: { label: 'تدريب', icon: '🏋️' },
  custom: { label: 'مهمة مخصصة', icon: '📋' }
};

const priorities = {
  high: { label: 'عالية', class: 'badge-high' },
  medium: { label: 'متوسطة', class: 'badge-medium' },
  low: { label: 'منخفضة', class: 'badge-low' }
};

function checkAuth() {
  if (!getToken()) { location.href = '/'; return false; }
  return true;
}

function initTheme() {
  const t = getTheme();
  document.documentElement.setAttribute('data-theme', t);
}

function toggleTheme() {
  const t = getTheme() === 'dark' ? 'light' : 'dark';
  setTheme(t);
  const btn = document.querySelector('.theme-toggle');
  if (btn) btn.textContent = t === 'dark' ? '☀️' : '🌙';
}

function logout() {
  clearToken();
  location.href = '/';
}

function sidebarHTML(activePage) {
  return `
    <div class="sidebar" id="sidebar">
      <div class="sidebar-logo">
        <svg viewBox="0 0 28 28" fill="none"><rect x="2" y="2" width="24" height="24" rx="6" stroke="currentColor" stroke-width="2"/><path d="M8 14l4 4 8-8" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>AI Planner</span>
      </div>
      <nav class="sidebar-nav">
        <a href="/dashboard" class="${activePage === 'dashboard' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          لوحة التحكم
        </a>
        <a href="/tasks" class="${activePage === 'tasks' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
          المهام
        </a>
        <a href="/calendar" class="${activePage === 'calendar' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          التقويم
        </a>
        <a href="/charts" class="${activePage === 'charts' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
          الرسوم البيانية
        </a>
        <a href="/settings" class="${activePage === 'settings' ? 'active' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          الإعدادات
        </a>
      </nav>
      <div class="sidebar-footer">
        <div class="avatar" id="userAvatar">A</div>
        <div class="user-info">
          <div class="user-name" id="userName">—</div>
          <div class="user-email" id="userEmail">—</div>
        </div>
        <button class="btn-icon theme-toggle" onclick="toggleTheme()" title="تبديل المظهر">☀️</button>
        <button class="btn-icon" onclick="logout()" title="تسجيل خروج">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        </button>
      </div>
    </div>
  `;
}

function mobileHeaderHTML(title) {
  return `
    <div class="mobile-header">
      <button onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button>
      <span class="mobile-title">${title}</span>
    </div>
  `;
}

async function loadUserInfo() {
  try {
    const user = await apiFetch('/api/auth/me');
    if (user && user.name) {
      currentUser = user;
      const nameEl = document.getElementById('userName');
      const emailEl = document.getElementById('userEmail');
      const avatarEl = document.getElementById('userAvatar');
      if (nameEl) nameEl.textContent = user.name;
      if (emailEl) emailEl.textContent = user.email;
      if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
    }
  } catch {}
}

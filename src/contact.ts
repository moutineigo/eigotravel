import './contact-style.css';

const API_BASE = import.meta.env.DEV ? 'http://localhost:5177' : './api';

interface Challenge {
  question: string;
  token: string;
}

const COLORS: { key: string; label: string; css: string }[] = [
  { key: 'red', label: '赤', css: '#e53935' },
  { key: 'yellow', label: '黄', css: '#fdd835' },
  { key: 'green', label: '青', css: '#43a047' }
];

const el = {
  form: document.getElementById('contact-form') as HTMLFormElement,
  name: document.getElementById('c-name') as HTMLInputElement,
  email: document.getElementById('c-email') as HTMLInputElement,
  message: document.getElementById('c-message') as HTMLTextAreaElement,
  honeypot: document.getElementById('c-hp') as HTMLInputElement,
  question: document.getElementById('captcha-question') as HTMLElement,
  lights: document.getElementById('captcha-lights') as HTMLElement,
  submitBtn: document.getElementById('c-submit-btn') as HTMLButtonElement,
  status: document.getElementById('c-form-status') as HTMLElement
};

let currentChallenge: Challenge | null = null;
let selectedColor: string | null = null;

async function loadChallenge() {
  currentChallenge = null;
  selectedColor = null;
  el.question.textContent = '読み込み中…';
  el.lights.innerHTML = '';
  try {
    const res = await fetch(`${API_BASE}/challenge`);
    if (!res.ok) throw new Error('failed');
    const data: Challenge = await res.json();
    currentChallenge = data;
    el.question.textContent = data.question;
    renderLights();
  } catch {
    el.question.textContent = '認証クイズの読み込みに失敗しました。ページを再読み込みしてください。';
  }
}

function renderLights() {
  el.lights.innerHTML = '';
  const shuffled = [...COLORS].sort(() => Math.random() - 0.5);
  for (const color of shuffled) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'captcha-light';
    btn.style.background = color.css;
    btn.setAttribute('aria-label', color.label);
    btn.addEventListener('click', () => {
      selectedColor = color.key;
      for (const child of Array.from(el.lights.children)) {
        child.classList.remove('captcha-light--selected');
      }
      btn.classList.add('captcha-light--selected');
    });
    el.lights.appendChild(btn);
  }
}

el.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  el.status.textContent = '';
  el.status.className = 'form-message';

  const name = el.name.value.trim();
  const email = el.email.value.trim();
  const message = el.message.value.trim();

  if (!name || !email) {
    el.status.textContent = 'お名前とメールアドレスは必須です。';
    el.status.className = 'form-message form-message--error';
    return;
  }
  if (!currentChallenge || !selectedColor) {
    el.status.textContent = '信号機の色を選択してください。';
    el.status.className = 'form-message form-message--error';
    return;
  }

  el.submitBtn.disabled = true;
  el.submitBtn.textContent = '送信中…';

  try {
    const fd = new FormData();
    fd.set('name', name);
    fd.set('email', email);
    fd.set('message', message);
    fd.set('website', el.honeypot.value);
    fd.set('answer', selectedColor);
    fd.set('token', currentChallenge.token);

    const res = await fetch(`${API_BASE}/submit`, { method: 'POST', body: fd });
    const data = await res.json();

    if (!res.ok) {
      el.status.textContent = data.error || '送信に失敗しました。もう一度お試しください。';
      el.status.className = 'form-message form-message--error';
      await loadChallenge();
      return;
    }

    el.status.textContent = '送信しました。ありがとうございます！';
    el.status.className = 'form-message form-message--success';
    el.form.reset();
    await loadChallenge();
  } catch {
    el.status.textContent = '通信エラーが発生しました。しばらくしてから再度お試しください。';
    el.status.className = 'form-message form-message--error';
    await loadChallenge();
  } finally {
    el.submitBtn.disabled = false;
    el.submitBtn.textContent = '送信する';
  }
});

loadChallenge();

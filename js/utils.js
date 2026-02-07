// ============================================
// Utilities: i18n, formatting, deep-links
// ============================================

const Utils = (() => {
  let currentLang = 'fr';
  let translations = {};

  // ---- i18n ----
  async function loadLanguage(lang) {
    try {
      const resp = await fetch(`./lang/${lang}.json`);
      translations = await resp.json();
      currentLang = lang;
      localStorage.setItem('wa-scheduler-lang', lang);
      document.documentElement.lang = lang;
    } catch (e) {
      console.error('Failed to load language:', lang, e);
    }
  }

  function t(key) {
    const keys = key.split('.');
    let val = translations;
    for (const k of keys) {
      if (val && typeof val === 'object' && k in val) {
        val = val[k];
      } else {
        return key;
      }
    }
    return typeof val === 'string' ? val : key;
  }

  function getLang() {
    return currentLang;
  }

  function getSavedLang() {
    return localStorage.getItem('wa-scheduler-lang') || 'fr';
  }

  // ---- Theme ----
  function getTheme() {
    return localStorage.getItem('wa-scheduler-theme') || 'auto';
  }

  function setTheme(theme) {
    localStorage.setItem('wa-scheduler-theme', theme);
    applyTheme(theme);
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
      root.setAttribute('data-theme', theme);
    }
  }

  // ---- Deep Links ----
  function buildWhatsAppLink(phone, message, app) {
    const cleanPhone = phone.replace(/[\s\-\(\)\.+]/g, '').replace(/^00/, '');
    const encodedMsg = encodeURIComponent(message);

    if (app === 'business') {
      // iOS WhatsApp Business URL scheme
      return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
    }
    return `https://wa.me/${cleanPhone}?text=${encodedMsg}`;
  }

  function openWhatsApp(phone, message, app) {
    const url = buildWhatsAppLink(phone, message, app);
    window.open(url, '_blank');
  }

  // ---- Phone formatting ----
  function formatPhone(phone) {
    if (!phone) return '';
    const clean = phone.replace(/[^\d+]/g, '');
    if (clean.startsWith('+33') && clean.length === 12) {
      return `+33 ${clean.slice(3, 4)} ${clean.slice(4, 6)} ${clean.slice(6, 8)} ${clean.slice(8, 10)} ${clean.slice(10, 12)}`;
    }
    return clean;
  }

  function cleanPhone(phone) {
    return phone.replace(/[\s\-\(\)\.]/g, '');
  }

  // ---- Date/Time formatting ----
  function formatDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString(currentLang === 'fr' ? 'fr-FR' : 'en-US', {
      day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  function formatTime(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleTimeString(currentLang === 'fr' ? 'fr-FR' : 'en-US', {
      hour: '2-digit', minute: '2-digit'
    });
  }

  function formatDateTime(dateStr) {
    return `${formatDate(dateStr)} ${formatTime(dateStr)}`;
  }

  function formatRelative(dateStr) {
    const now = new Date();
    const d = new Date(dateStr);
    const diff = d - now;
    const absDiff = Math.abs(diff);

    if (absDiff < 60000) return currentLang === 'fr' ? 'maintenant' : 'now';
    if (absDiff < 3600000) {
      const mins = Math.round(absDiff / 60000);
      return diff > 0
        ? (currentLang === 'fr' ? `dans ${mins} min` : `in ${mins} min`)
        : (currentLang === 'fr' ? `il y a ${mins} min` : `${mins} min ago`);
    }
    if (absDiff < 86400000) {
      const hrs = Math.round(absDiff / 3600000);
      return diff > 0
        ? (currentLang === 'fr' ? `dans ${hrs}h` : `in ${hrs}h`)
        : (currentLang === 'fr' ? `il y a ${hrs}h` : `${hrs}h ago`);
    }
    return formatDateTime(dateStr);
  }

  function toLocalInputValue(date) {
    const d = date instanceof Date ? date : new Date(date);
    const offset = d.getTimezoneOffset();
    const local = new Date(d.getTime() - offset * 60000);
    return local.toISOString().slice(0, 16);
  }

  // ---- Template variables ----
  function applyTemplateVars(text, vars) {
    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return vars[key] !== undefined ? vars[key] : match;
    });
  }

  // ---- CSV parsing ----
  function parseCSV(text) {
    const lines = text.trim().split('\n');
    const contacts = [];
    for (const line of lines) {
      const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
      if (parts.length >= 2 && parts[1]) {
        contacts.push({
          name: parts[0] || '',
          phone: parts[1]
        });
      }
    }
    return contacts;
  }

  // ---- Toast notifications ----
  function showToast(message, type = 'success') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ---- Modal ----
  function showModal(content, onClose) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal">${content}</div>`;
    document.body.appendChild(overlay);

    requestAnimationFrame(() => overlay.classList.add('show'));

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal(overlay);
        if (onClose) onClose();
      }
    });

    return overlay;
  }

  function closeModal(overlay) {
    if (!overlay) overlay = document.querySelector('.modal-overlay');
    if (overlay) {
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 300);
    }
  }

  // ---- Confirm dialog ----
  function showConfirm(message) {
    return new Promise((resolve) => {
      const html = `
        <div class="confirm-dialog">
          <p>${message}</p>
          <div class="confirm-actions">
            <button class="btn btn-secondary" data-action="cancel">${t('common.cancel')}</button>
            <button class="btn btn-danger" data-action="confirm">${t('common.confirm')}</button>
          </div>
        </div>
      `;
      const modal = showModal(html);
      modal.querySelector('[data-action="cancel"]').onclick = () => {
        closeModal(modal);
        resolve(false);
      };
      modal.querySelector('[data-action="confirm"]').onclick = () => {
        closeModal(modal);
        resolve(true);
      };
    });
  }

  // ---- Debounce ----
  function debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // ---- Escape HTML ----
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    loadLanguage, t, getLang, getSavedLang,
    getTheme, setTheme, applyTheme,
    buildWhatsAppLink, openWhatsApp,
    formatPhone, cleanPhone,
    formatDate, formatTime, formatDateTime, formatRelative, toLocalInputValue,
    applyTemplateVars, parseCSV,
    showToast, showModal, closeModal, showConfirm,
    debounce, escapeHtml
  };
})();

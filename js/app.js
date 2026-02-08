// ============================================
// Main App: SPA Router & Page Controllers
// ============================================

const App = (() => {
  let currentPage = '';
  let editingMessageId = null;

  // ---- Init ----
  async function init() {
    await Utils.loadLanguage(Utils.getSavedLang());
    Utils.applyTheme(Utils.getTheme());

    // Listen for theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (Utils.getTheme() === 'auto') Utils.applyTheme('auto');
    });

    await DB.open();
    await Scheduler.init();
    await Scheduler.markExpired();

    // Router
    window.addEventListener('hashchange', handleRoute);
    handleRoute();

    // Message events
    window.addEventListener('message-sent', () => { if (currentPage === '' || currentPage === 'messages') handleRoute(); });
    window.addEventListener('message-scheduled', () => { if (currentPage === '' || currentPage === 'messages') handleRoute(); });
  }

  // ---- Router ----
  function handleRoute() {
    const hash = window.location.hash.slice(2) || '';
    const [page, ...params] = hash.split('/');
    currentPage = page;

    const content = document.getElementById('app-content');
    if (!content) return;

    // Update nav
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === (page || 'dashboard'));
    });

    switch (page) {
      case '':
      case 'dashboard':
        renderDashboard(content);
        break;
      case 'new':
        editingMessageId = null;
        renderNewMessage(content);
        break;
      case 'edit':
        editingMessageId = params[0] || null;
        renderNewMessage(content, editingMessageId);
        break;
      case 'messages':
        renderMessages(content);
        break;
      case 'contacts':
        renderContacts(content);
        break;
      case 'templates':
        renderTemplates(content);
        break;
      case 'stats':
        renderStats(content);
        break;
      case 'settings':
        renderSettings(content);
        break;
      default:
        renderDashboard(content);
    }

    // Scroll to top
    content.scrollTo(0, 0);
  }

  function navigate(page) {
    window.location.hash = `/${page}`;
  }

  // ---- Dashboard ----
  async function renderDashboard(container) {
    const overview = await Stats.getOverview();
    const upcoming = await Scheduler.getUpcoming(5);

    const notifPerm = Scheduler.getNotificationPermission();
    const showNotifBanner = notifPerm !== 'granted' && notifPerm !== 'unsupported';

    container.innerHTML = `
      <div class="page page-dashboard">
        <div class="page-header">
          <h1>${Utils.t('dashboard.title')}</h1>
        </div>

        ${showNotifBanner ? `
          <div class="notif-banner" id="notif-banner">
            <div class="notif-banner-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </div>
            <div class="notif-banner-text">${Utils.t('notification.bannerText')}</div>
            <button class="btn btn-sm btn-primary" id="btn-enable-notif">${Utils.t('notification.bannerButton')}</button>
          </div>
        ` : ''}

        <div class="dashboard-stats">
          <div class="mini-stat">
            <div class="mini-stat-value">${overview.pending}</div>
            <div class="mini-stat-label">${Utils.t('dashboard.pending')}</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-value">${overview.sent}</div>
            <div class="mini-stat-label">${Utils.t('dashboard.sent')}</div>
          </div>
          <div class="mini-stat">
            <div class="mini-stat-value">${overview.total}</div>
            <div class="mini-stat-label">${Utils.t('dashboard.total')}</div>
          </div>
        </div>

        <div class="section">
          <div class="section-header">
            <h2>${Utils.t('dashboard.quickActions')}</h2>
          </div>
          <div class="quick-actions">
            <button class="quick-action-btn" onclick="App.navigate('new')">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>${Utils.t('dashboard.newMessage')}</span>
            </button>
            <button class="quick-action-btn" onclick="App.navigate('stats')">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              <span>${Utils.t('dashboard.stats')}</span>
            </button>
          </div>
        </div>

        <div class="section">
          <div class="section-header">
            <h2>${Utils.t('dashboard.upcoming')}</h2>
          </div>
          <div id="upcoming-list">
            ${upcoming.length ? upcoming.map(m => renderMessageCard(m)).join('') : `
              <div class="empty-state small">
                <p>${Utils.t('dashboard.noUpcoming')}</p>
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    // Bind notification banner button
    const btnEnableNotif = document.getElementById('btn-enable-notif');
    if (btnEnableNotif) {
      btnEnableNotif.addEventListener('click', async () => {
        const granted = await Scheduler.requestNotificationPermission();
        if (granted) {
          const banner = document.getElementById('notif-banner');
          if (banner) banner.remove();
        }
      });
    }
  }

  // ---- New / Edit Message ----
  async function renderNewMessage(container, messageId = null) {
    let message = null;
    if (messageId) {
      message = await DB.get(DB.STORES.messages, messageId);
    }

    const contacts = await Contacts.getAllContacts();
    const groups = await Contacts.getAllGroups();
    const templates = await Templates.getAllTemplates();
    const allTags = await getAllTags();

    const isEdit = !!message;
    const defaultDateTime = Utils.toLocalInputValue(new Date(Date.now() + 3600000));

    container.innerHTML = `
      <div class="page page-new">
        <div class="page-header">
          <h1>${isEdit ? Utils.t('message.editTitle') : Utils.t('message.title')}</h1>
        </div>

        <form id="message-form" class="message-form">
          <!-- Contact Selection -->
          <div class="form-group">
            <label>${Utils.t('message.recipient')}</label>

            <!-- Action buttons row -->
            <div class="contact-pick-row">
              ${Utils.hasContactPicker() ? `
                <button type="button" class="btn btn-secondary btn-sm" id="btn-pick-native">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="23" y1="11" x2="17" y2="11"/><line x1="20" y1="8" x2="20" y2="14"/></svg>
                  ${Utils.t('contacts.pickFromPhone')}
                </button>
              ` : ''}
              <button type="button" class="btn btn-secondary btn-sm" id="btn-pick-internal">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                ${Utils.t('contacts.pickFromApp')}
              </button>
              <button type="button" class="btn btn-outline btn-sm" id="btn-quick-add-contact">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                ${Utils.t('contacts.quickAdd')}
              </button>
            </div>

            <!-- Selected contact display -->
            <div id="selected-contact" class="selected-contact" style="display:${isEdit && message.contactName ? 'flex' : 'none'}">
              <div class="selected-contact-info">
                <span class="selected-contact-name" id="selected-name">${isEdit ? Utils.escapeHtml(message.contactName || '') : ''}</span>
                <span class="selected-contact-phone" id="selected-phone">${isEdit ? Utils.formatPhone(message.phone || '') : ''}</span>
              </div>
              <button type="button" class="btn-icon" id="btn-clear-contact" title="${Utils.t('common.delete')}">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            <!-- Hidden select for contact ID -->
            <select id="contact-select" style="display:none">
              <option value=""></option>
              ${contacts.map(c => `
                <option value="${c.id}" data-phone="${c.phone}" data-name="${Utils.escapeHtml(c.name)}" ${message && message.contactId === c.id ? 'selected' : ''}>
                  ${Utils.escapeHtml(c.name)} (${Utils.formatPhone(c.phone)})
                </option>
              `).join('')}
            </select>

            ${groups.length ? `
              <select id="group-select" class="form-select mt-1">
                <option value="">${Utils.t('message.selectGroup')}</option>
                ${groups.map(g => `
                  <option value="${g.id}">${Utils.escapeHtml(g.name)} (${g.memberIds.length})</option>
                `).join('')}
              </select>
            ` : ''}

            <div class="form-divider"><span>${Utils.t('common.or')}</span></div>
            <input type="tel" id="phone-input" name="phone"
              value="${isEdit ? (message.phone || '') : ''}"
              placeholder="${Utils.t('message.phonePlaceholder')}"
              class="form-input">
          </div>

          <!-- Message Text -->
          <div class="form-group">
            <label>${Utils.t('message.messageText')}</label>
            ${templates.length ? `
              <select id="template-select" class="form-select mb-1">
                <option value="">${Utils.t('message.selectTemplate')}</option>
                ${templates.map(t => `
                  <option value="${t.id}">${Utils.escapeHtml(t.name)}</option>
                `).join('')}
              </select>
            ` : ''}
            <textarea id="message-text" name="text" rows="4"
              placeholder="${Utils.t('message.messagePlaceholder')}" required>${isEdit ? Utils.escapeHtml(message.text || '') : ''}</textarea>
            <div class="char-count"><span id="char-count">0</span></div>
          </div>

          <!-- Date & Time -->
          <div class="form-group">
            <label>${Utils.t('message.dateTime')}</label>
            <input type="datetime-local" id="schedule-datetime" name="scheduledAt"
              value="${isEdit ? Utils.toLocalInputValue(message.scheduledAt) : defaultDateTime}" required>
          </div>

          <!-- App Selection -->
          <div class="form-group">
            <label>${Utils.t('message.app')}</label>
            <div class="radio-group">
              <label class="radio-item">
                <input type="radio" name="app" value="whatsapp" ${!isEdit || message.app === 'whatsapp' ? 'checked' : ''}>
                <span class="radio-label">
                  <span class="app-icon wa">W</span>
                  ${Utils.t('message.whatsapp')}
                </span>
              </label>
              <label class="radio-item">
                <input type="radio" name="app" value="business" ${isEdit && message.app === 'business' ? 'checked' : ''}>
                <span class="radio-label">
                  <span class="app-icon wab">B</span>
                  ${Utils.t('message.whatsappBusiness')}
                </span>
              </label>
            </div>
          </div>

          <!-- Recurrence -->
          <div class="form-group">
            <label>${Utils.t('message.recurrence')}</label>
            <select id="recurrence-select" name="recurrence" class="form-select">
              <option value="none" ${!isEdit || message.recurrence === 'none' ? 'selected' : ''}>${Utils.t('message.none')}</option>
              <option value="daily" ${isEdit && message.recurrence === 'daily' ? 'selected' : ''}>${Utils.t('message.daily')}</option>
              <option value="weekly" ${isEdit && message.recurrence === 'weekly' ? 'selected' : ''}>${Utils.t('message.weekly')}</option>
              <option value="monthly" ${isEdit && message.recurrence === 'monthly' ? 'selected' : ''}>${Utils.t('message.monthly')}</option>
              <option value="custom" ${isEdit && message.recurrence === 'custom' ? 'selected' : ''}>${Utils.t('message.custom')}</option>
            </select>
            <div id="custom-interval" class="mt-1" style="display: ${isEdit && message.recurrence === 'custom' ? 'flex' : 'none'}; align-items: center; gap: 8px;">
              <span>${Utils.t('message.everyNDays')}:</span>
              <input type="number" id="interval-input" min="1" value="${isEdit ? (message.recurrenceInterval || 1) : 1}" style="width: 60px;">
              <span>${Utils.t('message.days')}</span>
            </div>
          </div>

          <!-- Tags -->
          <div class="form-group">
            <label>${Utils.t('message.tags')}</label>
            <div class="tags-input" id="tags-container">
              <div class="tags-list" id="tags-list">
                ${isEdit && message.tags ? message.tags.map(tag => `
                  <span class="tag tag-removable" data-tag="${Utils.escapeHtml(tag)}">
                    ${Utils.escapeHtml(tag)}
                    <button type="button" class="tag-remove" data-tag="${Utils.escapeHtml(tag)}">&times;</button>
                  </span>
                `).join('') : ''}
              </div>
              <input type="text" id="tag-input" placeholder="${Utils.t('message.tagsPlaceholder')}" list="tag-suggestions">
              <datalist id="tag-suggestions">
                ${allTags.map(tag => `<option value="${Utils.escapeHtml(tag)}">`).join('')}
              </datalist>
            </div>
          </div>

          <!-- Media Attachments -->
          <div class="form-group">
            <label>${Utils.t('message.media')}</label>
            <div class="media-upload-area" id="media-upload-area">
              <div class="media-previews" id="media-previews">
                ${isEdit && message.mediaFiles ? message.mediaFiles.map((m, i) => `
                  <div class="media-preview-item" data-index="${i}">
                    ${m.type.startsWith('image/') ? `<img src="${m.dataUrl}" alt="">` : `<video src="${m.dataUrl}"></video>`}
                    <button type="button" class="media-remove" data-index="${i}">&times;</button>
                  </div>
                `).join('') : ''}
              </div>
              <label class="media-add-btn" id="media-add-btn">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                </svg>
                <span>${Utils.t('message.addMedia')}</span>
                <input type="file" id="media-file-input" accept="image/*,video/*" multiple style="display:none">
              </label>
            </div>
            <div class="form-hint">${Utils.t('message.mediaHint')}</div>
          </div>

          <!-- Actions -->
          <div class="form-actions">
            ${isEdit ? `
              <button type="button" class="btn btn-danger" id="btn-delete-msg">${Utils.t('common.delete')}</button>
              <a href="${Utils.buildWhatsAppLink(message.phone, message.text, message.app)}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary" id="btn-send-now">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
                ${Utils.t('message.sendNow')}
              </a>
            ` : ''}
            <button type="submit" class="btn btn-primary btn-lg">
              ${isEdit ? Utils.t('message.update') : Utils.t('message.schedule')}
            </button>
          </div>
        </form>
      </div>
    `;

    // Event bindings
    bindMessageForm(message);
  }

  function bindMessageForm(existingMessage) {
    const form = document.getElementById('message-form');
    const contactSelect = document.getElementById('contact-select');
    const groupSelect = document.getElementById('group-select');
    const templateSelect = document.getElementById('template-select');
    const recurrenceSelect = document.getElementById('recurrence-select');
    const customInterval = document.getElementById('custom-interval');
    const messageText = document.getElementById('message-text');
    const charCount = document.getElementById('char-count');
    const tagInput = document.getElementById('tag-input');
    const tagsList = document.getElementById('tags-list');
    const phoneInput = document.getElementById('phone-input');
    const selectedContactDiv = document.getElementById('selected-contact');
    const selectedNameEl = document.getElementById('selected-name');
    const selectedPhoneEl = document.getElementById('selected-phone');
    let currentTags = existingMessage && existingMessage.tags ? [...existingMessage.tags] : [];

    // Helper: set selected contact in the UI
    function setSelectedContact(name, phone, contactId) {
      selectedNameEl.textContent = name;
      selectedPhoneEl.textContent = Utils.formatPhone(phone);
      selectedContactDiv.style.display = 'flex';
      phoneInput.value = phone;
      if (contactId && contactSelect) {
        contactSelect.value = contactId;
      }
      if (groupSelect) groupSelect.value = '';
    }

    function clearSelectedContact() {
      selectedNameEl.textContent = '';
      selectedPhoneEl.textContent = '';
      selectedContactDiv.style.display = 'none';
      phoneInput.value = '';
      if (contactSelect) contactSelect.value = '';
    }

    // Clear contact button
    const btnClear = document.getElementById('btn-clear-contact');
    if (btnClear) {
      btnClear.addEventListener('click', clearSelectedContact);
    }

    // Native Contact Picker (Android/Chrome)
    const btnPickNative = document.getElementById('btn-pick-native');
    if (btnPickNative) {
      btnPickNative.addEventListener('click', async () => {
        const picked = await Utils.pickContact();
        if (picked && picked.phone) {
          setSelectedContact(picked.name || '', picked.phone, null);
          // Also save to internal contacts
          const existing = await Contacts.getAllContacts();
          const alreadyExists = existing.find(c => Utils.cleanPhone(c.phone) === Utils.cleanPhone(picked.phone));
          if (!alreadyExists && picked.name) {
            await Contacts.addContact({ name: picked.name, phone: picked.phone });
          }
        }
      });
    }

    // Internal contact picker (modal list)
    const btnPickInternal = document.getElementById('btn-pick-internal');
    if (btnPickInternal) {
      btnPickInternal.addEventListener('click', async () => {
        const allContacts = await Contacts.getAllContacts();
        if (!allContacts.length) {
          Utils.showToast(Utils.t('contacts.noContacts'), 'error');
          return;
        }
        const html = `
          <div class="form-page">
            <h2>${Utils.t('message.selectContact')}</h2>
            <input type="text" id="contact-search-modal" class="form-input mb-1" placeholder="${Utils.t('common.search')}...">
            <div class="contact-picker-list" id="contact-picker-list">
              ${allContacts.map(c => `
                <div class="contact-pick-item" data-id="${c.id}" data-phone="${Utils.escapeHtml(c.phone)}" data-name="${Utils.escapeHtml(c.name || '')}">
                  <div class="contact-avatar">${(c.name || '?')[0].toUpperCase()}</div>
                  <div class="contact-details">
                    <div class="contact-name">${Utils.escapeHtml(c.name || c.phone)}</div>
                    <div class="contact-phone">${Utils.formatPhone(c.phone)}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `;
        const modal = Utils.showModal(html);

        // Search filter
        const searchInput = modal.querySelector('#contact-search-modal');
        searchInput.addEventListener('input', Utils.debounce(() => {
          const q = searchInput.value.toLowerCase();
          modal.querySelectorAll('.contact-pick-item').forEach(item => {
            const name = (item.dataset.name || '').toLowerCase();
            const phone = (item.dataset.phone || '');
            item.style.display = (name.includes(q) || phone.includes(q)) ? 'flex' : 'none';
          });
        }, 150));

        // Click on contact
        modal.querySelectorAll('.contact-pick-item').forEach(item => {
          item.addEventListener('click', () => {
            setSelectedContact(item.dataset.name, item.dataset.phone, item.dataset.id);
            Utils.closeModal(modal);
          });
        });
      });
    }

    // Quick add contact
    const btnQuickAdd = document.getElementById('btn-quick-add-contact');
    if (btnQuickAdd) {
      btnQuickAdd.addEventListener('click', () => {
        const html = `
          <div class="form-page">
            <h2>${Utils.t('contacts.addContact')}</h2>
            <form id="quick-contact-form">
              <div class="form-group">
                <label>${Utils.t('contacts.name')}</label>
                <input type="text" name="name" placeholder="${Utils.t('contacts.namePlaceholder')}" required>
              </div>
              <div class="form-group">
                <label>${Utils.t('contacts.phone')}</label>
                <input type="tel" name="phone" placeholder="${Utils.t('contacts.phonePlaceholder')}" required>
              </div>
              <div class="form-actions">
                <button type="button" class="btn btn-secondary" data-action="cancel">${Utils.t('common.cancel')}</button>
                <button type="submit" class="btn btn-primary">${Utils.t('common.save')}</button>
              </div>
            </form>
          </div>
        `;
        const modal = Utils.showModal(html);
        modal.querySelector('[data-action="cancel"]').addEventListener('click', () => Utils.closeModal(modal));
        modal.querySelector('#quick-contact-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const name = fd.get('name');
          const phone = fd.get('phone');
          const newContact = await Contacts.addContact({ name, phone });
          setSelectedContact(name, phone, newContact.id);
          Utils.closeModal(modal);
          Utils.showToast(Utils.t('common.success'));
        });
      });
    }

    // ---- Media attachments ----
    let mediaFiles = existingMessage && existingMessage.mediaFiles ? [...existingMessage.mediaFiles] : [];
    const mediaInput = document.getElementById('media-file-input');
    const mediaPreviews = document.getElementById('media-previews');

    function renderMediaPreviews() {
      mediaPreviews.innerHTML = mediaFiles.map((m, i) => `
        <div class="media-preview-item" data-index="${i}">
          ${m.type.startsWith('image/') ? `<img src="${m.dataUrl}" alt="">` : `
            <div class="media-video-thumb">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            </div>
          `}
          <button type="button" class="media-remove" data-index="${i}">&times;</button>
          <div class="media-name">${Utils.escapeHtml(m.name)}</div>
        </div>
      `).join('');

      mediaPreviews.querySelectorAll('.media-remove').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          mediaFiles.splice(parseInt(btn.dataset.index), 1);
          renderMediaPreviews();
        });
      });
    }

    if (mediaInput) {
      mediaInput.addEventListener('change', async () => {
        const files = Array.from(mediaInput.files);
        for (const file of files) {
          if (mediaFiles.length >= 5) {
            Utils.showToast(Utils.t('message.mediaMax'), 'error');
            break;
          }
          const dataUrl = await fileToDataUrl(file);
          mediaFiles.push({
            name: file.name,
            type: file.type,
            size: file.size,
            dataUrl
          });
        }
        renderMediaPreviews();
        mediaInput.value = '';
      });
    }

    function fileToDataUrl(file) {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }

    // Char count
    if (messageText) {
      const updateCount = () => { charCount.textContent = messageText.value.length; };
      messageText.addEventListener('input', updateCount);
      updateCount();
    }

    // Contact selection (hidden select, kept for form submission)
    if (contactSelect) {
      contactSelect.addEventListener('change', () => {
        const opt = contactSelect.selectedOptions[0];
        if (opt && opt.dataset.phone) {
          phoneInput.value = opt.dataset.phone;
          if (groupSelect) groupSelect.value = '';
        }
      });
    }

    // Group selection
    if (groupSelect) {
      groupSelect.addEventListener('change', () => {
        if (groupSelect.value) {
          phoneInput.value = '';
          clearSelectedContact();
        }
      });
    }

    // Template selection
    if (templateSelect) {
      templateSelect.addEventListener('change', async () => {
        if (templateSelect.value) {
          const tpl = await Templates.getTemplate(templateSelect.value);
          if (tpl) {
            messageText.value = tpl.content;
            charCount.textContent = tpl.content.length;
          }
        }
      });
    }

    // Recurrence
    if (recurrenceSelect) {
      recurrenceSelect.addEventListener('change', () => {
        customInterval.style.display = recurrenceSelect.value === 'custom' ? 'flex' : 'none';
      });
    }

    // Tags
    if (tagInput) {
      tagInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const tag = tagInput.value.trim().replace(',', '');
          if (tag && !currentTags.includes(tag)) {
            currentTags.push(tag);
            renderTags();
          }
          tagInput.value = '';
        }
      });
    }

    function renderTags() {
      tagsList.innerHTML = currentTags.map(tag => `
        <span class="tag tag-removable" data-tag="${Utils.escapeHtml(tag)}">
          ${Utils.escapeHtml(tag)}
          <button type="button" class="tag-remove" data-tag="${Utils.escapeHtml(tag)}">&times;</button>
        </span>
      `).join('');

      tagsList.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          currentTags = currentTags.filter(t => t !== btn.dataset.tag);
          renderTags();
        });
      });
    }

    if (tagsList) {
      tagsList.querySelectorAll('.tag-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          currentTags = currentTags.filter(t => t !== btn.dataset.tag);
          renderTags();
        });
      });
    }

    // Form submit
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const phone = formData.get('phone');
      const groupId = groupSelect ? groupSelect.value : '';

      if (!phone && !groupId) {
        Utils.showToast(Utils.t('message.recipientPlaceholder'), 'error');
        return;
      }

      const data = {
        text: formData.get('text'),
        scheduledAt: formData.get('scheduledAt'),
        app: formData.get('app'),
        recurrence: formData.get('recurrence'),
        recurrenceInterval: parseInt(document.getElementById('interval-input')?.value || '1'),
        tags: currentTags,
        mediaFiles: mediaFiles
      };

      if (groupId) {
        // Schedule for each group member
        const members = await Contacts.getGroupMembers(groupId);
        for (const member of members) {
          await Scheduler.scheduleMessage({
            ...data,
            phone: member.phone,
            contactName: member.name,
            contactId: member.id
          });
        }
        Utils.showToast(`${members.length} ${Utils.t('message.scheduled')}`);
      } else if (existingMessage) {
        // Update
        existingMessage.phone = Utils.cleanPhone(phone);
        existingMessage.text = data.text;
        existingMessage.scheduledAt = new Date(data.scheduledAt).toISOString();
        existingMessage.app = data.app;
        existingMessage.recurrence = data.recurrence;
        existingMessage.recurrenceInterval = data.recurrenceInterval;
        existingMessage.tags = data.tags;
        existingMessage.mediaFiles = data.mediaFiles;
        // Update contact info from the selected contact display
        const editDisplayedName = selectedNameEl.textContent.trim();
        if (editDisplayedName) {
          existingMessage.contactName = editDisplayedName;
          existingMessage.contactId = contactSelect ? contactSelect.value : existingMessage.contactId;
        } else if (contactSelect && contactSelect.value) {
          existingMessage.contactId = contactSelect.value;
          existingMessage.contactName = contactSelect.selectedOptions[0].dataset.name || '';
        }
        await Scheduler.updateMessage(existingMessage);
      } else {
        // New - get contact name from the selected contact display (set by picker)
        const displayedName = selectedNameEl.textContent.trim();
        const contactName = displayedName || (contactSelect && contactSelect.value
          ? contactSelect.selectedOptions[0].dataset.name || ''
          : '');
        await Scheduler.scheduleMessage({
          ...data,
          phone,
          contactName,
          contactId: contactSelect ? contactSelect.value : null
        });
      }

      navigate('messages');
    });

    // Delete button
    const deleteBtn = document.getElementById('btn-delete-msg');
    if (deleteBtn && existingMessage) {
      deleteBtn.addEventListener('click', async () => {
        const confirmed = await Utils.showConfirm(Utils.t('message.deleteConfirm'));
        if (confirmed) {
          await Scheduler.deleteMessage(existingMessage.id);
          navigate('messages');
        }
      });
    }

    // Send now button (it's a real <a> link)
    // Update href dynamically to reflect any form edits, then mark as sent
    const sendNowBtn = document.getElementById('btn-send-now');
    if (sendNowBtn && existingMessage) {
      // Update link href when user clicks (use mousedown so it fires before navigation)
      sendNowBtn.addEventListener('mousedown', () => {
        const currentPhone = phoneInput.value || existingMessage.phone;
        const currentText = messageText.value || existingMessage.text;
        const currentApp = document.querySelector('input[name="app"]:checked')?.value || existingMessage.app;
        sendNowBtn.href = Utils.buildWhatsAppLink(currentPhone, currentText, currentApp);
      });
      sendNowBtn.addEventListener('click', () => {
        existingMessage.status = 'sent';
        existingMessage.sentAt = new Date().toISOString();
        DB.update(DB.STORES.messages, existingMessage);
        setTimeout(() => navigate('messages'), 1500);
      });
    }
  }

  // ---- Messages List ----
  async function renderMessages(container) {
    const allMessages = await DB.getAll(DB.STORES.messages);
    const allTags = await getAllTags();

    container.innerHTML = `
      <div class="page page-messages">
        <div class="page-header">
          <h1>${Utils.t('messages.title')}</h1>
        </div>

        <div class="filter-tabs">
          <button class="filter-tab active" data-filter="all">${Utils.t('messages.all')} (${allMessages.length})</button>
          <button class="filter-tab" data-filter="pending">${Utils.t('messages.pending')} (${allMessages.filter(m=>m.status==='pending').length})</button>
          <button class="filter-tab" data-filter="sent">${Utils.t('messages.sent')} (${allMessages.filter(m=>m.status==='sent').length})</button>
          <button class="filter-tab" data-filter="expired">${Utils.t('messages.expired')} (${allMessages.filter(m=>m.status==='expired').length})</button>
        </div>

        ${allTags.length ? `
          <div class="tag-filters">
            <button class="tag-filter active" data-tag="">${Utils.t('messages.all')}</button>
            ${allTags.map(tag => `<button class="tag-filter" data-tag="${Utils.escapeHtml(tag)}">${Utils.escapeHtml(tag)}</button>`).join('')}
          </div>
        ` : ''}

        <div class="search-bar">
          <input type="text" id="messages-search" placeholder="${Utils.t('messages.search')}" class="form-input">
        </div>

        <div id="messages-list">
          ${renderMessagesList(allMessages)}
        </div>
      </div>
    `;

    // Bind filters
    let currentFilter = 'all';
    let currentTagFilter = '';
    let searchQuery = '';

    function filterAndRender() {
      let filtered = allMessages;
      if (currentFilter !== 'all') {
        filtered = filtered.filter(m => m.status === currentFilter);
      }
      if (currentTagFilter) {
        filtered = filtered.filter(m => m.tags && m.tags.includes(currentTagFilter));
      }
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        filtered = filtered.filter(m =>
          (m.contactName && m.contactName.toLowerCase().includes(q)) ||
          (m.phone && m.phone.includes(q)) ||
          (m.text && m.text.toLowerCase().includes(q))
        );
      }
      document.getElementById('messages-list').innerHTML = renderMessagesList(filtered);
      bindMessageActions();
    }

    container.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        filterAndRender();
      });
    });

    container.querySelectorAll('.tag-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.tag-filter').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        currentTagFilter = btn.dataset.tag;
        filterAndRender();
      });
    });

    const searchInput = document.getElementById('messages-search');
    if (searchInput) {
      searchInput.addEventListener('input', Utils.debounce(() => {
        searchQuery = searchInput.value;
        filterAndRender();
      }, 200));
    }

    bindMessageActions();
  }

  function renderMessagesList(messages) {
    if (!messages.length) {
      return `<div class="empty-state">
        <div class="empty-icon">💬</div>
        <p>${Utils.t('messages.noMessages')}</p>
      </div>`;
    }

    const sorted = [...messages].sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return new Date(b.scheduledAt) - new Date(a.scheduledAt);
    });

    return sorted.map(m => renderMessageCard(m)).join('');
  }

  function renderMessageCard(msg) {
    const statusClass = `status-${msg.status}`;
    const statusText = Utils.t(`status.${msg.status}`);
    const appLabel = msg.app === 'business' ? 'WA Business' : 'WhatsApp';
    const timeStr = msg.status === 'pending'
      ? Utils.formatRelative(msg.scheduledAt)
      : Utils.formatDateTime(msg.sentAt || msg.scheduledAt);

    return `
      <div class="card message-card ${statusClass}" data-id="${msg.id}">
        <div class="message-header">
          <div class="message-recipient">
            <strong>${Utils.escapeHtml(msg.contactName || Utils.formatPhone(msg.phone))}</strong>
            <span class="app-badge ${msg.app === 'business' ? 'badge-business' : 'badge-wa'}">${appLabel}</span>
          </div>
          <span class="status-badge ${statusClass}">${statusText}</span>
        </div>
        <div class="message-body">${Utils.escapeHtml(msg.text).slice(0, 120)}${msg.text.length > 120 ? '...' : ''}</div>
        ${msg.mediaFiles && msg.mediaFiles.length ? `
          <div class="message-media-row">
            ${msg.mediaFiles.map(m => `
              <div class="message-media-thumb">
                ${m.type.startsWith('image/') ? `<img src="${m.dataUrl}" alt="">` : `
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                `}
              </div>
            `).join('')}
            <span class="media-count">${msg.mediaFiles.length} ${Utils.t('message.mediaCount')}</span>
          </div>
        ` : ''}
        <div class="message-footer">
          <span class="message-time">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${timeStr}
          </span>
          ${msg.tags && msg.tags.length ? `
            <div class="message-tags">
              ${msg.tags.map(t => `<span class="tag tag-small">${Utils.escapeHtml(t)}</span>`).join('')}
            </div>
          ` : ''}
          ${msg.recurrence && msg.recurrence !== 'none' ? `
            <span class="recurrence-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              ${Utils.t(`message.${msg.recurrence}`)}
            </span>
          ` : ''}
        </div>
        <div class="message-actions-row">
          ${msg.status === 'pending' ? `
            <a href="${Utils.buildWhatsAppLink(msg.phone, msg.text, msg.app)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-primary btn-wa-send" data-action="mark-sent" data-id="${msg.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>
              ${Utils.t('message.sendNow')}
            </a>
          ` : ''}
          ${msg.status === 'sent' || msg.status === 'expired' ? `
            <a href="${Utils.buildWhatsAppLink(msg.phone, msg.text, msg.app)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary btn-wa-send" data-action="mark-sent" data-id="${msg.id}">
              ${Utils.t('message.reschedule')}
            </a>
          ` : ''}
          ${msg.mediaFiles && msg.mediaFiles.length ? `
            <button class="btn btn-sm btn-outline" data-action="share-media" data-id="${msg.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
              ${Utils.t('message.shareMedia')}
            </button>
          ` : ''}
          <button class="btn btn-sm btn-outline" data-action="edit-msg" data-id="${msg.id}">${Utils.t('common.edit')}</button>
          <button class="btn btn-sm btn-danger-outline" data-action="delete-msg" data-id="${msg.id}">${Utils.t('common.delete')}</button>
        </div>
      </div>
    `;
  }

  function bindMessageActions() {
    document.querySelectorAll('[data-action="edit-msg"]').forEach(btn => {
      btn.addEventListener('click', () => navigate(`edit/${btn.dataset.id}`));
    });

    document.querySelectorAll('[data-action="delete-msg"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const confirmed = await Utils.showConfirm(Utils.t('message.deleteConfirm'));
        if (confirmed) {
          await Scheduler.deleteMessage(btn.dataset.id);
          handleRoute();
        }
      });
    });

    // Mark as sent when user taps the WhatsApp link
    // IMPORTANT: Do NOT use async/await here — it blocks iOS <a> navigation
    document.querySelectorAll('[data-action="mark-sent"]').forEach(link => {
      link.addEventListener('click', () => {
        const msgId = link.dataset.id;
        // Fire-and-forget: don't await, let the <a> navigate freely
        DB.get(DB.STORES.messages, msgId).then(msg => {
          if (msg) {
            msg.status = 'sent';
            msg.sentAt = new Date().toISOString();
            DB.update(DB.STORES.messages, msg).then(() => {
              setTimeout(() => handleRoute(), 1000);
            });
          }
        });
        // Do NOT call e.preventDefault() — let the native <a> link work
      });
    });

    // Share media via Web Share API
    document.querySelectorAll('[data-action="share-media"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const msg = await DB.get(DB.STORES.messages, btn.dataset.id);
        if (!msg || !msg.mediaFiles || !msg.mediaFiles.length) return;

        // Convert dataUrls to File objects
        const files = [];
        for (const media of msg.mediaFiles) {
          try {
            const resp = await fetch(media.dataUrl);
            const blob = await resp.blob();
            const file = new File([blob], media.name, { type: media.type });
            files.push(file);
          } catch (e) {
            console.error('Error converting media:', e);
          }
        }

        // Use Web Share API if available (iOS Safari supports this)
        if (navigator.canShare && navigator.canShare({ files })) {
          try {
            await navigator.share({
              text: msg.text,
              files
            });
          } catch (e) {
            if (e.name !== 'AbortError') {
              Utils.showToast(Utils.t('message.shareError'), 'error');
            }
          }
        } else {
          // Fallback: download files
          for (const media of msg.mediaFiles) {
            const a = document.createElement('a');
            a.href = media.dataUrl;
            a.download = media.name;
            a.click();
          }
          Utils.showToast(Utils.t('message.mediaDownloaded'));
        }
      });
    });
  }

  // ---- Contacts Page ----
  async function renderContacts(container) {
    const contacts = await Contacts.getAllContacts();
    const groups = await Contacts.getAllGroups();

    container.innerHTML = `
      <div class="page page-contacts">
        <div class="page-header">
          <h1>${Utils.t('contacts.title')}</h1>
        </div>

        <div class="tab-bar">
          <button class="tab active" data-tab="contacts">${Utils.t('contacts.title')} (${contacts.length})</button>
          <button class="tab" data-tab="groups">${Utils.t('contacts.groups')} (${groups.length})</button>
        </div>

        <div id="contacts-tab" class="tab-content active">
          <div class="action-bar">
            <button class="btn btn-primary btn-sm" id="btn-add-contact">${Utils.t('contacts.addContact')}</button>
            <button class="btn btn-secondary btn-sm" id="btn-import-csv">${Utils.t('contacts.importCSV')}</button>
          </div>
          <div id="contacts-list">
            ${Contacts.renderContactsList(contacts)}
          </div>
        </div>

        <div id="groups-tab" class="tab-content">
          <div class="action-bar">
            <button class="btn btn-primary btn-sm" id="btn-add-group">${Utils.t('contacts.addGroup')}</button>
          </div>
          <div id="groups-list">
            ${Contacts.renderGroupsList(groups)}
          </div>
        </div>
      </div>
    `;

    // Tab switching
    container.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        container.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`${tab.dataset.tab}-tab`).classList.add('active');
      });
    });

    // Add contact
    document.getElementById('btn-add-contact').addEventListener('click', () => {
      showContactForm();
    });

    // Import CSV
    document.getElementById('btn-import-csv').addEventListener('click', () => {
      showCSVImport();
    });

    // Add group
    document.getElementById('btn-add-group').addEventListener('click', async () => {
      const allContacts = await Contacts.getAllContacts();
      showGroupForm(null, allContacts);
    });

    // Bind list actions
    bindContactActions();
  }

  function bindContactActions() {
    document.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const contact = await Contacts.getContact(btn.dataset.id);
        if (contact) showContactForm(contact);
      });
    });

    document.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const confirmed = await Utils.showConfirm(Utils.t('contacts.deleteConfirm'));
        if (confirmed) {
          await Contacts.deleteContact(btn.dataset.id);
          handleRoute();
        }
      });
    });

    document.querySelectorAll('[data-action="edit-group"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const group = await Contacts.getGroup(btn.dataset.id);
        const allContacts = await Contacts.getAllContacts();
        if (group) showGroupForm(group, allContacts);
      });
    });

    document.querySelectorAll('[data-action="delete-group"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const confirmed = await Utils.showConfirm(Utils.t('contacts.deleteConfirm'));
        if (confirmed) {
          await Contacts.deleteGroup(btn.dataset.id);
          handleRoute();
        }
      });
    });
  }

  function showContactForm(contact = null) {
    const html = Contacts.renderContactForm(contact);
    const modal = Utils.showModal(html);

    const form = modal.querySelector('#contact-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = {
        name: fd.get('name'),
        phone: fd.get('phone'),
        notes: fd.get('notes')
      };

      if (contact) {
        await Contacts.updateContact({ ...contact, ...data });
      } else {
        await Contacts.addContact(data);
      }

      Utils.closeModal(modal);
      handleRoute();
    });

    modal.querySelector('[data-action="cancel"]').addEventListener('click', () => Utils.closeModal(modal));

    const deleteBtn = modal.querySelector('[data-action="delete"]');
    if (deleteBtn && contact) {
      deleteBtn.addEventListener('click', async () => {
        const confirmed = await Utils.showConfirm(Utils.t('contacts.deleteConfirm'));
        if (confirmed) {
          await Contacts.deleteContact(contact.id);
          Utils.closeModal(modal);
          handleRoute();
        }
      });
    }
  }

  function showGroupForm(group = null, contacts = []) {
    const html = Contacts.renderGroupForm(group, contacts);
    const modal = Utils.showModal(html);

    const form = modal.querySelector('#group-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const memberIds = fd.getAll('members');
      const data = {
        name: fd.get('name'),
        memberIds
      };

      if (group) {
        await Contacts.updateGroup({ ...group, ...data });
      } else {
        await Contacts.addGroup(data);
      }

      Utils.closeModal(modal);
      handleRoute();
    });

    modal.querySelector('[data-action="cancel"]').addEventListener('click', () => Utils.closeModal(modal));

    const deleteBtn = modal.querySelector('[data-action="delete"]');
    if (deleteBtn && group) {
      deleteBtn.addEventListener('click', async () => {
        const confirmed = await Utils.showConfirm(Utils.t('contacts.deleteConfirm'));
        if (confirmed) {
          await Contacts.deleteGroup(group.id);
          Utils.closeModal(modal);
          handleRoute();
        }
      });
    }
  }

  function showCSVImport() {
    const html = `
      <div class="form-page">
        <h2>${Utils.t('contacts.importCSV')}</h2>
        <p class="text-muted">${Utils.t('contacts.csvFormat')}</p>
        <textarea id="csv-input" rows="6" class="form-input" placeholder="Jean Dupont,+33612345678\nMarie Martin,+33698765432"></textarea>
        <div class="form-actions mt-1">
          <button class="btn btn-secondary" data-action="cancel">${Utils.t('common.cancel')}</button>
          <button class="btn btn-primary" id="btn-do-import">${Utils.t('contacts.importCSV')}</button>
        </div>
      </div>
    `;
    const modal = Utils.showModal(html);

    modal.querySelector('[data-action="cancel"]').addEventListener('click', () => Utils.closeModal(modal));

    modal.querySelector('#btn-do-import').addEventListener('click', async () => {
      const csv = document.getElementById('csv-input').value;
      if (!csv.trim()) return;
      try {
        const count = await Contacts.importFromCSV(csv);
        Utils.showToast(`${count} ${Utils.t('contacts.importSuccess')}`);
        Utils.closeModal(modal);
        handleRoute();
      } catch (e) {
        Utils.showToast(Utils.t('contacts.importError'), 'error');
      }
    });
  }

  // ---- Templates Page ----
  async function renderTemplates(container) {
    const templates = await Templates.getAllTemplates();

    container.innerHTML = `
      <div class="page page-templates">
        <div class="page-header">
          <h1>${Utils.t('templates.title')}</h1>
        </div>
        <div class="action-bar">
          <button class="btn btn-primary btn-sm" id="btn-add-template">${Utils.t('templates.addTemplate')}</button>
        </div>
        <div id="templates-list">
          ${Templates.renderTemplatesList(templates)}
        </div>
      </div>
    `;

    document.getElementById('btn-add-template').addEventListener('click', () => {
      showTemplateForm();
    });

    bindTemplateActions();
  }

  function bindTemplateActions() {
    document.querySelectorAll('[data-action="edit"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const tpl = await Templates.getTemplate(btn.dataset.id);
        if (tpl) showTemplateForm(tpl);
      });
    });

    document.querySelectorAll('[data-action="delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const confirmed = await Utils.showConfirm(Utils.t('templates.deleteConfirm'));
        if (confirmed) {
          await Templates.deleteTemplate(btn.dataset.id);
          handleRoute();
        }
      });
    });

    document.querySelectorAll('[data-action="use"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        editingMessageId = null;
        // Store template ID temporarily
        sessionStorage.setItem('useTemplate', btn.dataset.id);
        navigate('new');
      });
    });
  }

  function showTemplateForm(template = null) {
    const html = Templates.renderTemplateForm(template);
    const modal = Utils.showModal(html);

    const form = modal.querySelector('#template-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = {
        name: fd.get('name'),
        content: fd.get('content'),
        category: fd.get('category')
      };

      if (template) {
        await Templates.updateTemplate({ ...template, ...data });
      } else {
        await Templates.addTemplate(data);
      }

      Utils.closeModal(modal);
      handleRoute();
    });

    modal.querySelector('[data-action="cancel"]').addEventListener('click', () => Utils.closeModal(modal));

    const deleteBtn = modal.querySelector('[data-action="delete"]');
    if (deleteBtn && template) {
      deleteBtn.addEventListener('click', async () => {
        const confirmed = await Utils.showConfirm(Utils.t('templates.deleteConfirm'));
        if (confirmed) {
          await Templates.deleteTemplate(template.id);
          Utils.closeModal(modal);
          handleRoute();
        }
      });
    }
  }

  // ---- Statistics Page ----
  async function renderStats(container) {
    const overview = await Stats.getOverview();
    const last7 = await Stats.getLast7Days();
    const topContacts = await Stats.getTopContacts();
    const topTags = await Stats.getTopTags();

    container.innerHTML = `
      <div class="page page-stats">
        <div class="page-header">
          <h1>${Utils.t('stats.title')}</h1>
        </div>

        <div class="section">
          <h2>${Utils.t('stats.overview')}</h2>
          ${Stats.renderOverviewCards(overview)}
        </div>

        <div class="section">
          <div class="donut-section">
            ${Stats.renderDonutChart(overview)}
          </div>
        </div>

        <div class="section">
          <h2>${Utils.t('stats.last7Days')}</h2>
          ${Stats.renderBarChart(last7)}
        </div>

        <div class="section">
          <h2>${Utils.t('stats.topContacts')}</h2>
          ${Stats.renderTopList(topContacts, 'name', 'count')}
        </div>

        <div class="section">
          <h2>${Utils.t('stats.topTags')}</h2>
          ${Stats.renderTopList(topTags, 'tag', 'count')}
        </div>
      </div>
    `;
  }

  // ---- Settings Page ----
  async function renderSettings(container) {
    const currentTheme = Utils.getTheme();
    const currentLang = Utils.getLang();

    container.innerHTML = `
      <div class="page page-settings">
        <div class="page-header">
          <h1>${Utils.t('settings.title')}</h1>
        </div>

        <div class="settings-section">
          <h2>${Utils.t('settings.appearance')}</h2>
          <div class="setting-item">
            <label>${Utils.t('settings.darkMode')}</label>
            <div class="segmented-control" id="theme-control">
              <button class="seg-btn ${currentTheme === 'auto' ? 'active' : ''}" data-value="auto">${Utils.t('settings.auto')}</button>
              <button class="seg-btn ${currentTheme === 'light' ? 'active' : ''}" data-value="light">${Utils.t('settings.light')}</button>
              <button class="seg-btn ${currentTheme === 'dark' ? 'active' : ''}" data-value="dark">${Utils.t('settings.dark')}</button>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h2>${Utils.t('settings.language')}</h2>
          <div class="setting-item">
            <div class="segmented-control" id="lang-control">
              <button class="seg-btn ${currentLang === 'fr' ? 'active' : ''}" data-value="fr">${Utils.t('settings.french')}</button>
              <button class="seg-btn ${currentLang === 'en' ? 'active' : ''}" data-value="en">${Utils.t('settings.english')}</button>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <h2>${Utils.t('settings.notifications')}</h2>
          <div class="setting-item">
            <label>${Utils.t('settings.enableNotifications')}</label>
            <button class="btn btn-sm btn-secondary" id="btn-notif-perm">
              ${Scheduler.getNotificationPermission() === 'granted' ? '✓' : Utils.t('settings.enableNotifications')}
            </button>
          </div>
          <div class="setting-item">
            <label>${Utils.t('settings.advanceMinutes')}</label>
            <input type="number" id="advance-minutes" min="0" max="60"
              value="${localStorage.getItem('wa-scheduler-advance') || '5'}"
              class="form-input" style="width: 80px;">
          </div>
        </div>

        <div class="settings-section">
          <h2>${Utils.t('settings.templates')}</h2>
          <div class="setting-item">
            <button class="btn btn-secondary" onclick="App.navigate('templates')">${Utils.t('settings.manageTemplates')}</button>
          </div>
        </div>

        <div class="settings-section">
          <h2>${Utils.t('settings.data')}</h2>
          <div class="setting-item">
            <button class="btn btn-secondary" id="btn-export">${Utils.t('settings.exportData')}</button>
          </div>
          <div class="setting-item">
            <button class="btn btn-secondary" id="btn-import">${Utils.t('settings.importData')}</button>
            <input type="file" id="import-file" accept=".json" style="display:none">
          </div>
          <div class="setting-item">
            <button class="btn btn-danger" id="btn-clear-data">${Utils.t('settings.clearData')}</button>
          </div>
        </div>

        <div class="settings-section">
          <h2>${Utils.t('settings.about')}</h2>
          <div class="setting-item">
            <span>${Utils.t('settings.version')}</span>
            <span>1.0.0</span>
          </div>
        </div>
      </div>
    `;

    // Theme
    document.getElementById('theme-control').addEventListener('click', (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      document.querySelectorAll('#theme-control .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      Utils.setTheme(btn.dataset.value);
    });

    // Language
    document.getElementById('lang-control').addEventListener('click', async (e) => {
      const btn = e.target.closest('.seg-btn');
      if (!btn) return;
      await Utils.loadLanguage(btn.dataset.value);
      handleRoute(); // Re-render with new language
    });

    // Notifications
    document.getElementById('btn-notif-perm').addEventListener('click', async () => {
      await Scheduler.requestNotificationPermission();
      handleRoute();
    });

    // Advance minutes
    document.getElementById('advance-minutes').addEventListener('change', (e) => {
      localStorage.setItem('wa-scheduler-advance', e.target.value);
    });

    // Export
    document.getElementById('btn-export').addEventListener('click', async () => {
      const data = await DB.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wa-scheduler-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      Utils.showToast(Utils.t('settings.exportSuccess'));
    });

    // Import
    document.getElementById('btn-import').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await DB.importAll(data);
        Utils.showToast(Utils.t('settings.importSuccess'));
        handleRoute();
      } catch (err) {
        Utils.showToast(Utils.t('common.error'), 'error');
      }
    });

    // Clear data - only delete sent/expired messages, keep contacts, templates, groups, tags
    document.getElementById('btn-clear-data').addEventListener('click', async () => {
      const confirmed = await Utils.showConfirm(Utils.t('settings.clearConfirm'));
      if (confirmed) {
        // Only remove sent and expired messages, keep pending ones
        const allMessages = await DB.getAll(DB.STORES.messages);
        for (const msg of allMessages) {
          if (msg.status === 'sent' || msg.status === 'expired') {
            await DB.remove(DB.STORES.messages, msg.id);
          }
        }
        // Keep contacts, groups, templates, tags intact
        handleRoute();
        Utils.showToast(Utils.t('settings.clearSuccess'));
      }
    });
  }

  // ---- Helpers ----
  async function getAllTags() {
    const messages = await DB.getAll(DB.STORES.messages);
    const tagSet = new Set();
    messages.forEach(m => {
      if (m.tags) m.tags.forEach(t => tagSet.add(t));
    });
    return [...tagSet].sort();
  }

  return { init, navigate, handleRoute };
})();

// Start app
document.addEventListener('DOMContentLoaded', () => App.init());

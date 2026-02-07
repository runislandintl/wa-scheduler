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

    container.innerHTML = `
      <div class="page page-dashboard">
        <div class="page-header">
          <h1>${Utils.t('dashboard.title')}</h1>
        </div>

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
            ${contacts.length ? `
              <select id="contact-select" class="form-select">
                <option value="">${Utils.t('message.selectContact')}</option>
                ${contacts.map(c => `
                  <option value="${c.id}" data-phone="${c.phone}" ${message && message.contactId === c.id ? 'selected' : ''}>
                    ${Utils.escapeHtml(c.name)} (${Utils.formatPhone(c.phone)})
                  </option>
                `).join('')}
              </select>
            ` : ''}
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

          <!-- Attachment Note -->
          <div class="form-group">
            <label>${Utils.t('message.attachmentNote')}</label>
            <input type="text" name="attachmentNote"
              value="${isEdit ? Utils.escapeHtml(message.attachmentNote || '') : ''}"
              placeholder="${Utils.t('message.attachmentNotePlaceholder')}">
          </div>

          <!-- Actions -->
          <div class="form-actions">
            ${isEdit ? `
              <button type="button" class="btn btn-danger" id="btn-delete-msg">${Utils.t('common.delete')}</button>
              <button type="button" class="btn btn-secondary" id="btn-send-now">${Utils.t('message.sendNow')}</button>
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
    let currentTags = existingMessage && existingMessage.tags ? [...existingMessage.tags] : [];

    // Char count
    if (messageText) {
      const updateCount = () => { charCount.textContent = messageText.value.length; };
      messageText.addEventListener('input', updateCount);
      updateCount();
    }

    // Contact selection
    if (contactSelect) {
      contactSelect.addEventListener('change', () => {
        const opt = contactSelect.selectedOptions[0];
        if (opt && opt.dataset.phone) {
          document.getElementById('phone-input').value = opt.dataset.phone;
          if (groupSelect) groupSelect.value = '';
        }
      });
    }

    // Group selection
    if (groupSelect) {
      groupSelect.addEventListener('change', () => {
        if (groupSelect.value) {
          document.getElementById('phone-input').value = '';
          if (contactSelect) contactSelect.value = '';
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
        attachmentNote: formData.get('attachmentNote') || ''
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
        existingMessage.attachmentNote = data.attachmentNote;
        if (contactSelect && contactSelect.value) {
          const opt = contactSelect.selectedOptions[0];
          existingMessage.contactId = contactSelect.value;
          existingMessage.contactName = opt.textContent.split('(')[0].trim();
        }
        await Scheduler.updateMessage(existingMessage);
      } else {
        // New
        const contactName = contactSelect && contactSelect.value
          ? contactSelect.selectedOptions[0].textContent.split('(')[0].trim()
          : '';
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

    // Send now button
    const sendNowBtn = document.getElementById('btn-send-now');
    if (sendNowBtn && existingMessage) {
      sendNowBtn.addEventListener('click', () => {
        Scheduler.openMessage(existingMessage);
        existingMessage.status = 'sent';
        existingMessage.sentAt = new Date().toISOString();
        DB.update(DB.STORES.messages, existingMessage);
        navigate('messages');
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
            <button class="btn btn-sm btn-primary" data-action="send-now" data-id="${msg.id}">${Utils.t('message.sendNow')}</button>
          ` : ''}
          ${msg.status === 'sent' || msg.status === 'expired' ? `
            <button class="btn btn-sm btn-secondary" data-action="reschedule" data-id="${msg.id}">${Utils.t('message.reschedule')}</button>
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

    document.querySelectorAll('[data-action="send-now"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const msg = await DB.get(DB.STORES.messages, btn.dataset.id);
        if (msg) {
          Scheduler.openMessage(msg);
          msg.status = 'sent';
          msg.sentAt = new Date().toISOString();
          await DB.update(DB.STORES.messages, msg);
          handleRoute();
        }
      });
    });

    document.querySelectorAll('[data-action="reschedule"]').forEach(btn => {
      btn.addEventListener('click', () => navigate(`edit/${btn.dataset.id}`));
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
              value="${localStorage.getItem('wa-scheduler-advance') || '1'}"
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

    // Clear data
    document.getElementById('btn-clear-data').addEventListener('click', async () => {
      const confirmed = await Utils.showConfirm(Utils.t('settings.clearConfirm'));
      if (confirmed) {
        await DB.clear(DB.STORES.messages);
        await DB.clear(DB.STORES.contacts);
        await DB.clear(DB.STORES.groups);
        await DB.clear(DB.STORES.templates);
        await DB.clear(DB.STORES.tags);
        handleRoute();
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

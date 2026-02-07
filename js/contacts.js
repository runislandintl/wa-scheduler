// ============================================
// Contacts & Groups Management
// ============================================

const Contacts = (() => {

  // ---- Contacts ----
  async function addContact(data) {
    const contact = {
      id: DB.generateId(),
      name: data.name || '',
      phone: Utils.cleanPhone(data.phone),
      notes: data.notes || '',
      groupIds: data.groupIds || []
    };
    return DB.add(DB.STORES.contacts, contact);
  }

  async function updateContact(contact) {
    return DB.update(DB.STORES.contacts, contact);
  }

  async function deleteContact(id) {
    // Remove from all groups
    const groups = await getAllGroups();
    for (const group of groups) {
      const idx = group.memberIds.indexOf(id);
      if (idx > -1) {
        group.memberIds.splice(idx, 1);
        await DB.update(DB.STORES.groups, group);
      }
    }
    return DB.remove(DB.STORES.contacts, id);
  }

  async function getContact(id) {
    return DB.get(DB.STORES.contacts, id);
  }

  async function getAllContacts() {
    const contacts = await DB.getAll(DB.STORES.contacts);
    return contacts.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  async function searchContacts(query) {
    const all = await getAllContacts();
    const q = query.toLowerCase();
    return all.filter(c =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q))
    );
  }

  async function importFromCSV(csvText) {
    const parsed = Utils.parseCSV(csvText);
    let count = 0;
    for (const { name, phone } of parsed) {
      if (phone) {
        await addContact({ name, phone });
        count++;
      }
    }
    return count;
  }

  // ---- Groups ----
  async function addGroup(data) {
    const group = {
      id: DB.generateId(),
      name: data.name || '',
      memberIds: data.memberIds || []
    };
    return DB.add(DB.STORES.groups, group);
  }

  async function updateGroup(group) {
    return DB.update(DB.STORES.groups, group);
  }

  async function deleteGroup(id) {
    return DB.remove(DB.STORES.groups, id);
  }

  async function getGroup(id) {
    return DB.get(DB.STORES.groups, id);
  }

  async function getAllGroups() {
    const groups = await DB.getAll(DB.STORES.groups);
    return groups.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  async function getGroupMembers(groupId) {
    const group = await getGroup(groupId);
    if (!group) return [];
    const members = [];
    for (const id of group.memberIds) {
      const contact = await getContact(id);
      if (contact) members.push(contact);
    }
    return members;
  }

  // ---- Rendering ----
  function renderContactsList(contacts, onEdit, onDelete) {
    if (!contacts.length) {
      return `<div class="empty-state">
        <div class="empty-icon">👤</div>
        <p>${Utils.t('contacts.noContacts')}</p>
      </div>`;
    }

    return contacts.map(c => `
      <div class="card contact-card" data-id="${c.id}">
        <div class="contact-info">
          <div class="contact-avatar">${(c.name || '?')[0].toUpperCase()}</div>
          <div class="contact-details">
            <div class="contact-name">${Utils.escapeHtml(c.name || c.phone)}</div>
            <div class="contact-phone">${Utils.formatPhone(c.phone)}</div>
          </div>
        </div>
        <div class="contact-actions">
          <button class="btn-icon btn-edit" data-action="edit" data-id="${c.id}" title="${Utils.t('common.edit')}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon btn-delete" data-action="delete" data-id="${c.id}" title="${Utils.t('common.delete')}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  function renderContactForm(contact = null) {
    const isEdit = !!contact;
    return `
      <div class="form-page">
        <h2>${isEdit ? Utils.t('contacts.editContact') : Utils.t('contacts.addContact')}</h2>
        <form id="contact-form">
          <div class="form-group">
            <label>${Utils.t('contacts.name')}</label>
            <input type="text" name="name" value="${isEdit ? Utils.escapeHtml(contact.name || '') : ''}" placeholder="${Utils.t('contacts.namePlaceholder')}" required>
          </div>
          <div class="form-group">
            <label>${Utils.t('contacts.phone')}</label>
            <input type="tel" name="phone" value="${isEdit ? Utils.escapeHtml(contact.phone || '') : ''}" placeholder="${Utils.t('contacts.phonePlaceholder')}" required>
          </div>
          <div class="form-group">
            <label>${Utils.t('contacts.notes')}</label>
            <textarea name="notes" placeholder="${Utils.t('contacts.notesPlaceholder')}" rows="3">${isEdit ? Utils.escapeHtml(contact.notes || '') : ''}</textarea>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" data-action="cancel">${Utils.t('common.cancel')}</button>
            ${isEdit ? `<button type="button" class="btn btn-danger" data-action="delete">${Utils.t('common.delete')}</button>` : ''}
            <button type="submit" class="btn btn-primary">${Utils.t('common.save')}</button>
          </div>
          ${isEdit ? `<input type="hidden" name="id" value="${contact.id}">` : ''}
        </form>
      </div>
    `;
  }

  function renderGroupForm(group = null, contacts = []) {
    const isEdit = !!group;
    const memberIds = group ? group.memberIds || [] : [];

    return `
      <div class="form-page">
        <h2>${isEdit ? Utils.t('contacts.editGroup') : Utils.t('contacts.addGroup')}</h2>
        <form id="group-form">
          <div class="form-group">
            <label>${Utils.t('contacts.groupName')}</label>
            <input type="text" name="name" value="${isEdit ? Utils.escapeHtml(group.name || '') : ''}" placeholder="${Utils.t('contacts.groupNamePlaceholder')}" required>
          </div>
          <div class="form-group">
            <label>${Utils.t('contacts.selectMembers')}</label>
            <div class="members-list">
              ${contacts.map(c => `
                <label class="checkbox-item">
                  <input type="checkbox" name="members" value="${c.id}" ${memberIds.includes(c.id) ? 'checked' : ''}>
                  <span>${Utils.escapeHtml(c.name || c.phone)}</span>
                </label>
              `).join('')}
              ${!contacts.length ? `<p class="text-muted">${Utils.t('contacts.noContacts')}</p>` : ''}
            </div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" data-action="cancel">${Utils.t('common.cancel')}</button>
            ${isEdit ? `<button type="button" class="btn btn-danger" data-action="delete">${Utils.t('common.delete')}</button>` : ''}
            <button type="submit" class="btn btn-primary">${Utils.t('common.save')}</button>
          </div>
          ${isEdit ? `<input type="hidden" name="id" value="${group.id}">` : ''}
        </form>
      </div>
    `;
  }

  function renderGroupsList(groups) {
    if (!groups.length) {
      return `<div class="empty-state">
        <div class="empty-icon">👥</div>
        <p>${Utils.t('contacts.noGroups')}</p>
      </div>`;
    }

    return groups.map(g => `
      <div class="card group-card" data-id="${g.id}">
        <div class="contact-info">
          <div class="contact-avatar group-avatar">👥</div>
          <div class="contact-details">
            <div class="contact-name">${Utils.escapeHtml(g.name)}</div>
            <div class="contact-phone">${g.memberIds ? g.memberIds.length : 0} ${Utils.t('contacts.groupMembers').toLowerCase()}</div>
          </div>
        </div>
        <div class="contact-actions">
          <button class="btn-icon btn-edit" data-action="edit-group" data-id="${g.id}" title="${Utils.t('common.edit')}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon btn-delete" data-action="delete-group" data-id="${g.id}" title="${Utils.t('common.delete')}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  return {
    addContact, updateContact, deleteContact, getContact, getAllContacts,
    searchContacts, importFromCSV,
    addGroup, updateGroup, deleteGroup, getGroup, getAllGroups, getGroupMembers,
    renderContactsList, renderContactForm, renderGroupForm, renderGroupsList
  };
})();

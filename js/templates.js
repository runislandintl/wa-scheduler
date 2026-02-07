// ============================================
// Templates Management
// ============================================

const Templates = (() => {

  async function addTemplate(data) {
    const template = {
      id: DB.generateId(),
      name: data.name || '',
      content: data.content || '',
      category: data.category || ''
    };
    return DB.add(DB.STORES.templates, template);
  }

  async function updateTemplate(template) {
    return DB.update(DB.STORES.templates, template);
  }

  async function deleteTemplate(id) {
    return DB.remove(DB.STORES.templates, id);
  }

  async function getTemplate(id) {
    return DB.get(DB.STORES.templates, id);
  }

  async function getAllTemplates() {
    const templates = await DB.getAll(DB.STORES.templates);
    return templates.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  async function getCategories() {
    const templates = await getAllTemplates();
    const cats = new Set();
    templates.forEach(t => { if (t.category) cats.add(t.category); });
    return [...cats].sort();
  }

  function renderTemplatesList(templates) {
    if (!templates.length) {
      return `<div class="empty-state">
        <div class="empty-icon">📝</div>
        <p>${Utils.t('templates.noTemplates')}</p>
      </div>`;
    }

    return templates.map(t => `
      <div class="card template-card" data-id="${t.id}">
        <div class="template-info">
          <div class="template-name">${Utils.escapeHtml(t.name)}</div>
          ${t.category ? `<span class="tag">${Utils.escapeHtml(t.category)}</span>` : ''}
          <div class="template-preview">${Utils.escapeHtml(t.content).slice(0, 80)}${t.content.length > 80 ? '...' : ''}</div>
        </div>
        <div class="template-actions">
          <button class="btn-icon btn-use" data-action="use" data-id="${t.id}" title="${Utils.t('templates.use')}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </button>
          <button class="btn-icon btn-edit" data-action="edit" data-id="${t.id}" title="${Utils.t('common.edit')}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="btn-icon btn-delete" data-action="delete" data-id="${t.id}" title="${Utils.t('common.delete')}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  function renderTemplateForm(template = null) {
    const isEdit = !!template;
    return `
      <div class="form-page">
        <h2>${isEdit ? Utils.t('templates.editTemplate') : Utils.t('templates.addTemplate')}</h2>
        <form id="template-form">
          <div class="form-group">
            <label>${Utils.t('templates.templateName')}</label>
            <input type="text" name="name" value="${isEdit ? Utils.escapeHtml(template.name || '') : ''}" placeholder="${Utils.t('templates.templateNamePlaceholder')}" required>
          </div>
          <div class="form-group">
            <label>${Utils.t('templates.category')}</label>
            <input type="text" name="category" value="${isEdit ? Utils.escapeHtml(template.category || '') : ''}" placeholder="${Utils.t('templates.categoryPlaceholder')}">
          </div>
          <div class="form-group">
            <label>${Utils.t('templates.content')}</label>
            <textarea name="content" placeholder="${Utils.t('templates.contentPlaceholder')}" rows="5" required>${isEdit ? Utils.escapeHtml(template.content || '') : ''}</textarea>
            <div class="form-hint">${Utils.t('templates.variables')}</div>
          </div>
          <div class="form-actions">
            <button type="button" class="btn btn-secondary" data-action="cancel">${Utils.t('common.cancel')}</button>
            ${isEdit ? `<button type="button" class="btn btn-danger" data-action="delete">${Utils.t('common.delete')}</button>` : ''}
            <button type="submit" class="btn btn-primary">${Utils.t('common.save')}</button>
          </div>
          ${isEdit ? `<input type="hidden" name="id" value="${template.id}">` : ''}
        </form>
      </div>
    `;
  }

  return {
    addTemplate, updateTemplate, deleteTemplate, getTemplate,
    getAllTemplates, getCategories,
    renderTemplatesList, renderTemplateForm
  };
})();

// ============================================
// Statistics Module
// ============================================

const Stats = (() => {

  async function getOverview() {
    const all = await DB.getAll(DB.STORES.messages);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
      total: all.length,
      pending: all.filter(m => m.status === 'pending').length,
      sent: all.filter(m => m.status === 'sent').length,
      expired: all.filter(m => m.status === 'expired').length,
      today: all.filter(m => m.sentAt && new Date(m.sentAt) >= todayStart).length,
      thisWeek: all.filter(m => m.sentAt && new Date(m.sentAt) >= weekStart).length,
      thisMonth: all.filter(m => m.sentAt && new Date(m.sentAt) >= monthStart).length
    };
  }

  async function getLast7Days() {
    const all = await DB.getAll(DB.STORES.messages);
    const days = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const count = all.filter(m =>
        m.sentAt && new Date(m.sentAt) >= dayStart && new Date(m.sentAt) < dayEnd
      ).length;

      days.push({
        date: dayStart,
        label: dayStart.toLocaleDateString(Utils.getLang() === 'fr' ? 'fr-FR' : 'en-US', { weekday: 'short' }),
        count
      });
    }

    return days;
  }

  async function getTopContacts(limit = 5) {
    const all = await DB.getAll(DB.STORES.messages);
    const counts = {};

    for (const m of all) {
      const key = m.contactName || m.phone || 'Unknown';
      counts[key] = (counts[key] || 0) + 1;
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }

  async function getTopTags(limit = 5) {
    const all = await DB.getAll(DB.STORES.messages);
    const counts = {};

    for (const m of all) {
      if (m.tags) {
        for (const tag of m.tags) {
          counts[tag] = (counts[tag] || 0) + 1;
        }
      }
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([tag, count]) => ({ tag, count }));
  }

  function renderOverviewCards(overview) {
    return `
      <div class="stats-grid">
        <div class="stat-card stat-total">
          <div class="stat-number">${overview.total}</div>
          <div class="stat-label">${Utils.t('stats.totalMessages')}</div>
        </div>
        <div class="stat-card stat-sent">
          <div class="stat-number">${overview.sent}</div>
          <div class="stat-label">${Utils.t('stats.sentMessages')}</div>
        </div>
        <div class="stat-card stat-pending">
          <div class="stat-number">${overview.pending}</div>
          <div class="stat-label">${Utils.t('stats.pendingMessages')}</div>
        </div>
        <div class="stat-card stat-expired">
          <div class="stat-number">${overview.expired}</div>
          <div class="stat-label">${Utils.t('stats.expiredMessages')}</div>
        </div>
      </div>
    `;
  }

  function renderBarChart(data, maxHeight = 120) {
    if (!data.length) return '';
    const maxVal = Math.max(...data.map(d => d.count), 1);

    return `
      <div class="chart-container">
        <div class="bar-chart">
          ${data.map(d => `
            <div class="bar-col">
              <div class="bar-value">${d.count}</div>
              <div class="bar" style="height: ${(d.count / maxVal) * maxHeight}px"></div>
              <div class="bar-label">${d.label}</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderDonutChart(overview) {
    const total = overview.sent + overview.pending + overview.expired;
    if (total === 0) {
      return `<div class="donut-chart"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-border)" stroke-width="3"/></svg></div>`;
    }

    const sentPct = (overview.sent / total) * 100;
    const pendingPct = (overview.pending / total) * 100;
    const expiredPct = (overview.expired / total) * 100;

    const sentDash = sentPct * 0.9999;
    const pendingOffset = sentPct;
    const pendingDash = pendingPct * 0.9999;
    const expiredOffset = sentPct + pendingPct;
    const expiredDash = expiredPct * 0.9999;

    return `
      <div class="donut-chart">
        <svg viewBox="0 0 36 36">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-success)" stroke-width="3"
            stroke-dasharray="${sentDash} ${100 - sentDash}" stroke-dashoffset="25"/>
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-warning)" stroke-width="3"
            stroke-dasharray="${pendingDash} ${100 - pendingDash}" stroke-dashoffset="${25 - pendingOffset}"/>
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--color-danger)" stroke-width="3"
            stroke-dasharray="${expiredDash} ${100 - expiredDash}" stroke-dashoffset="${25 - expiredOffset}"/>
          <text x="18" y="19" text-anchor="middle" class="donut-center-text">${total}</text>
        </svg>
        <div class="donut-legend">
          <span class="legend-item"><span class="legend-dot dot-sent"></span>${Utils.t('stats.sentMessages')} (${overview.sent})</span>
          <span class="legend-item"><span class="legend-dot dot-pending"></span>${Utils.t('stats.pendingMessages')} (${overview.pending})</span>
          <span class="legend-item"><span class="legend-dot dot-expired"></span>${Utils.t('stats.expiredMessages')} (${overview.expired})</span>
        </div>
      </div>
    `;
  }

  function renderTopList(items, keyField, valueField) {
    if (!items.length) return '<p class="text-muted">-</p>';

    const maxVal = Math.max(...items.map(i => i[valueField]), 1);
    return `
      <div class="top-list">
        ${items.map(item => `
          <div class="top-item">
            <span class="top-name">${Utils.escapeHtml(item[keyField])}</span>
            <div class="top-bar-container">
              <div class="top-bar" style="width: ${(item[valueField] / maxVal) * 100}%"></div>
            </div>
            <span class="top-count">${item[valueField]}</span>
          </div>
        `).join('')}
      </div>
    `;
  }

  return {
    getOverview, getLast7Days, getTopContacts, getTopTags,
    renderOverviewCards, renderBarChart, renderDonutChart, renderTopList
  };
})();

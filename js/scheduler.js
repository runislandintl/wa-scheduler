// ============================================
// Scheduler: notifications and message timing
// ============================================

const Scheduler = (() => {
  let checkInterval = null;
  const CHECK_INTERVAL_MS = 30000; // Check every 30 seconds

  async function init() {
    startChecking();
    await requestNotificationPermission();
  }

  function startChecking() {
    if (checkInterval) clearInterval(checkInterval);
    checkInterval = setInterval(checkMessages, CHECK_INTERVAL_MS);
    checkMessages(); // Check immediately
  }

  function stopChecking() {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
  }

  async function requestNotificationPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
  }

  function getNotificationPermission() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission;
  }

  async function checkMessages() {
    try {
      const messages = await DB.getByIndex(DB.STORES.messages, 'status', 'pending');
      const now = new Date();
      const advanceMinutes = parseInt(localStorage.getItem('wa-scheduler-advance') || '1');

      for (const msg of messages) {
        const scheduledTime = new Date(msg.scheduledAt);
        const notifyTime = new Date(scheduledTime.getTime() - advanceMinutes * 60000);

        if (now >= notifyTime && !msg.notified) {
          await notifyMessage(msg);
          msg.notified = true;
          await DB.update(DB.STORES.messages, msg);
        }

        if (now >= scheduledTime) {
          await triggerMessage(msg);
        }
      }
    } catch (e) {
      console.error('Scheduler check error:', e);
    }
  }

  async function notifyMessage(msg) {
    if (Notification.permission !== 'granted') return;

    const contactName = msg.contactName || msg.phone;
    const body = Utils.t('notification.body').replace('{recipient}', contactName);

    const notification = new Notification(Utils.t('notification.title'), {
      body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: `wa-msg-${msg.id}`,
      requireInteraction: true,
      data: { messageId: msg.id }
    });

    notification.onclick = () => {
      window.focus();
      openMessage(msg);
      notification.close();
    };
  }

  async function triggerMessage(msg) {
    // Mark as sent
    msg.status = 'sent';
    msg.sentAt = new Date().toISOString();
    await DB.update(DB.STORES.messages, msg);

    // Open WhatsApp deep link
    openMessage(msg);

    // Handle recurrence
    if (msg.recurrence && msg.recurrence !== 'none') {
      await scheduleNextOccurrence(msg);
    }

    // Dispatch event for UI update
    window.dispatchEvent(new CustomEvent('message-sent', { detail: msg }));
  }

  function openMessage(msg) {
    Utils.openWhatsApp(msg.phone, msg.text, msg.app || 'whatsapp');
  }

  async function scheduleNextOccurrence(msg) {
    const nextDate = calculateNextDate(msg.scheduledAt, msg.recurrence, msg.recurrenceInterval);
    if (!nextDate) return;

    const newMsg = {
      ...msg,
      id: DB.generateId(),
      scheduledAt: nextDate.toISOString(),
      status: 'pending',
      notified: false,
      sentAt: null,
      createdAt: new Date().toISOString(),
      parentId: msg.id
    };

    await DB.add(DB.STORES.messages, newMsg);
  }

  function calculateNextDate(dateStr, recurrence, interval = 1) {
    const date = new Date(dateStr);

    switch (recurrence) {
      case 'daily':
        date.setDate(date.getDate() + 1);
        break;
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'custom':
        date.setDate(date.getDate() + (interval || 1));
        break;
      default:
        return null;
    }

    return date;
  }

  // Schedule a new message
  async function scheduleMessage(data) {
    const message = {
      id: DB.generateId(),
      phone: Utils.cleanPhone(data.phone),
      contactName: data.contactName || '',
      contactId: data.contactId || null,
      text: data.text,
      scheduledAt: new Date(data.scheduledAt).toISOString(),
      app: data.app || 'whatsapp',
      recurrence: data.recurrence || 'none',
      recurrenceInterval: data.recurrenceInterval || 1,
      tags: data.tags || [],
      attachmentNote: data.attachmentNote || '',
      status: 'pending',
      notified: false,
      sentAt: null
    };

    await DB.add(DB.STORES.messages, message);
    Utils.showToast(Utils.t('message.scheduled'));
    window.dispatchEvent(new CustomEvent('message-scheduled', { detail: message }));
    return message;
  }

  // Update an existing message
  async function updateMessage(msg) {
    msg.updatedAt = new Date().toISOString();
    await DB.update(DB.STORES.messages, msg);
    Utils.showToast(Utils.t('message.updated'));
    window.dispatchEvent(new CustomEvent('message-updated', { detail: msg }));
    return msg;
  }

  // Delete a message
  async function deleteMessage(id) {
    await DB.remove(DB.STORES.messages, id);
    Utils.showToast(Utils.t('message.deleted'));
    window.dispatchEvent(new CustomEvent('message-deleted', { detail: { id } }));
  }

  // Mark expired messages
  async function markExpired() {
    const messages = await DB.getByIndex(DB.STORES.messages, 'status', 'pending');
    const now = new Date();
    const expireAfter = 24 * 60 * 60 * 1000; // 24h after scheduled time

    for (const msg of messages) {
      const scheduled = new Date(msg.scheduledAt);
      if (now - scheduled > expireAfter) {
        msg.status = 'expired';
        await DB.update(DB.STORES.messages, msg);
      }
    }
  }

  // Get messages by status
  async function getMessagesByStatus(status) {
    if (status === 'all') return DB.getAll(DB.STORES.messages);
    return DB.getByIndex(DB.STORES.messages, 'status', status);
  }

  // Get upcoming messages (next 24h)
  async function getUpcoming(limit = 5) {
    const pending = await DB.getByIndex(DB.STORES.messages, 'status', 'pending');
    const now = new Date();
    return pending
      .filter(m => new Date(m.scheduledAt) > now)
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
      .slice(0, limit);
  }

  return {
    init, startChecking, stopChecking,
    requestNotificationPermission, getNotificationPermission,
    checkMessages, scheduleMessage, updateMessage, deleteMessage,
    markExpired, getMessagesByStatus, getUpcoming, openMessage
  };
})();

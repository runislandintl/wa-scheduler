// ============================================
// Scheduler: notifications and message timing
// ============================================

const Scheduler = (() => {
  let checkInterval = null;
  const CHECK_INTERVAL_MS = 15000; // Check every 15 seconds

  async function init() {
    startChecking();
    // Listen for SW messages (notification clicks)
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'notification-click') {
          const msgId = event.data.data?.messageId;
          if (msgId) {
            window.location.hash = `#/edit/${msgId}`;
          }
        }
      });
    }
  }

  function startChecking() {
    if (checkInterval) clearInterval(checkInterval);
    checkInterval = setInterval(checkMessages, CHECK_INTERVAL_MS);
    checkMessages();
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
      const advanceMinutes = parseInt(localStorage.getItem('wa-scheduler-advance') || '5');

      for (const msg of messages) {
        const scheduledTime = new Date(msg.scheduledAt);
        const notifyTime = new Date(scheduledTime.getTime() - advanceMinutes * 60000);

        // Send notification when it's time (advance reminder)
        if (now >= notifyTime && !msg.notified) {
          await sendNotification(msg);
          msg.notified = true;
          await DB.update(DB.STORES.messages, msg);
        }

        // Send another notification at the exact scheduled time
        if (now >= scheduledTime && !msg.triggeredNotification) {
          await sendNotification(msg, true);
          msg.triggeredNotification = true;
          await DB.update(DB.STORES.messages, msg);
        }
      }
    } catch (e) {
      console.error('Scheduler check error:', e);
    }
  }

  async function sendNotification(msg, isExactTime = false) {
    if (Notification.permission !== 'granted') return;

    const contactName = msg.contactName || Utils.formatPhone(msg.phone);
    const title = isExactTime
      ? Utils.t('notification.titleNow')
      : Utils.t('notification.title');
    const body = Utils.t('notification.body').replace('{recipient}', contactName);

    // Try Service Worker notifications first (work when app is closed on iOS 16.4+)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      try {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(title, {
          body,
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
          tag: `wa-msg-${msg.id}${isExactTime ? '-now' : ''}`,
          requireInteraction: true,
          renotify: true,
          data: {
            messageId: msg.id,
            phone: msg.phone,
            text: msg.text,
            app: msg.app,
            url: Utils.buildWhatsAppLink(msg.phone, msg.text, msg.app)
          },
          actions: [
            { action: 'send', title: Utils.t('message.sendNow') },
            { action: 'dismiss', title: Utils.t('common.close') }
          ]
        });
        return;
      } catch (e) {
        console.log('SW notification failed, falling back:', e);
      }
    }

    // Fallback: regular Notification API
    try {
      const notification = new Notification(title, {
        body,
        icon: './icons/icon-192.png',
        tag: `wa-msg-${msg.id}`,
        requireInteraction: true
      });

      notification.onclick = () => {
        window.focus();
        window.location.hash = `#/edit/${msg.id}`;
        notification.close();
      };
    } catch (e) {
      console.log('Notification failed:', e);
    }
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
      triggeredNotification: false,
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
      mediaFiles: data.mediaFiles || [],
      status: 'pending',
      notified: false,
      triggeredNotification: false,
      sentAt: null
    };

    await DB.add(DB.STORES.messages, message);

    // Request notification permission if not yet granted
    if (Notification.permission === 'default') {
      await requestNotificationPermission();
    }

    Utils.showToast(Utils.t('message.scheduled'));
    window.dispatchEvent(new CustomEvent('message-scheduled', { detail: message }));
    return message;
  }

  async function updateMessage(msg) {
    msg.updatedAt = new Date().toISOString();
    // Reset notification flags if rescheduled
    if (msg.status === 'pending') {
      msg.notified = false;
      msg.triggeredNotification = false;
    }
    await DB.update(DB.STORES.messages, msg);
    Utils.showToast(Utils.t('message.updated'));
    window.dispatchEvent(new CustomEvent('message-updated', { detail: msg }));
    return msg;
  }

  async function deleteMessage(id) {
    await DB.remove(DB.STORES.messages, id);
    Utils.showToast(Utils.t('message.deleted'));
    window.dispatchEvent(new CustomEvent('message-deleted', { detail: { id } }));
  }

  async function markExpired() {
    const messages = await DB.getByIndex(DB.STORES.messages, 'status', 'pending');
    const now = new Date();
    const expireAfter = 48 * 60 * 60 * 1000; // 48h after scheduled time

    for (const msg of messages) {
      const scheduled = new Date(msg.scheduledAt);
      if (now - scheduled > expireAfter) {
        msg.status = 'expired';
        await DB.update(DB.STORES.messages, msg);
      }
    }
  }

  async function getMessagesByStatus(status) {
    if (status === 'all') return DB.getAll(DB.STORES.messages);
    return DB.getByIndex(DB.STORES.messages, 'status', status);
  }

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

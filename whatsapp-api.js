const WhatsAppAPI = {
  isReady: false,
  readyCallbacks: [],

  init() {
    this.injectScript();
    this.setupMessageListener();
  },

  injectScript() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('inject.js');
    script.onload = () => {
      script.remove();
      this.waitForReady();
    };
    (document.head || document.documentElement).appendChild(script);
  },

  waitForReady() {
    const checkReady = () => {
      if (window.WA && window.WA.ready) {
        this.isReady = true;
        this.readyCallbacks.forEach(cb => cb());
        this.readyCallbacks = [];
        console.log('WhatsApp API ready');
      } else {
        setTimeout(checkReady, 500);
      }
    };

    window.addEventListener('WAReady', () => {
      this.isReady = true;
      this.readyCallbacks.forEach(cb => cb());
      this.readyCallbacks = [];
    });

    checkReady();
  },

  onReady(callback) {
    if (this.isReady) {
      callback();
    } else {
      this.readyCallbacks.push(callback);
    }
  },

  setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.data && event.data.type === 'WA_RESPONSE') {
        const { requestId, result, error } = event.data;
        if (this.pendingRequests && this.pendingRequests[requestId]) {
          const { resolve, reject } = this.pendingRequests[requestId];
          if (error) {
            reject(new Error(error));
          } else {
            resolve(result);
          }
          delete this.pendingRequests[requestId];
        }
      }
    });
  },

  pendingRequests: {},

  callWA(method, ...args) {
    return new Promise((resolve, reject) => {
      const requestId = Date.now().toString(36) + Math.random().toString(36);
      this.pendingRequests[requestId] = { resolve, reject };

      const script = document.createElement('script');
      script.textContent = `
        (async function() {
          try {
            const result = await window.WA.${method}(${args.map(a => JSON.stringify(a)).join(', ')});
            window.postMessage({
              type: 'WA_RESPONSE',
              requestId: '${requestId}',
              result: JSON.parse(JSON.stringify(result || null))
            }, '*');
          } catch (e) {
            window.postMessage({
              type: 'WA_RESPONSE',
              requestId: '${requestId}',
              error: e.message
            }, '*');
          }
        })();
      `;
      document.head.appendChild(script);
      script.remove();

      setTimeout(() => {
        if (this.pendingRequests[requestId]) {
          reject(new Error('Request timeout'));
          delete this.pendingRequests[requestId];
        }
      }, 30000);
    });
  },

  async getGroups() {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          try {
            const groups = window.WA.getGroups().map(g => ({
              id: g.id?._serialized || g.id,
              name: g.name || 'Unknown Group',
              participants: g.participants?.length || 0
            }));
            window.postMessage({ type: 'WA_GROUPS', groups }, '*');
          } catch (e) {
            window.postMessage({ type: 'WA_GROUPS', groups: [], error: e.message }, '*');
          }
        })();
      `;
      document.head.appendChild(script);
      script.remove();

      const handler = (event) => {
        if (event.data && event.data.type === 'WA_GROUPS') {
          window.removeEventListener('message', handler);
          resolve(event.data.groups || []);
        }
      };
      window.addEventListener('message', handler);

      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve([]);
      }, 5000);
    });
  },

  async getContacts() {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          try {
            const contacts = window.WA.getContacts()
              .filter(c => c.isUser && !c.isGroup && c.name)
              .map(c => ({
                id: c.id?._serialized || c.id,
                name: c.name || c.pushname || 'Unknown',
                phone: c.id?.user || ''
              }));
            window.postMessage({ type: 'WA_CONTACTS', contacts }, '*');
          } catch (e) {
            window.postMessage({ type: 'WA_CONTACTS', contacts: [], error: e.message }, '*');
          }
        })();
      `;
      document.head.appendChild(script);
      script.remove();

      const handler = (event) => {
        if (event.data && event.data.type === 'WA_CONTACTS') {
          window.removeEventListener('message', handler);
          resolve(event.data.contacts || []);
        }
      };
      window.addEventListener('message', handler);

      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve([]);
      }, 5000);
    });
  },

  async sendMessage(chatId, message) {
    return this.callWA('sendMessage', chatId, message);
  },

  async sendMedia(chatId, base64, caption, type) {
    return this.callWA('sendMedia', chatId, base64, caption, type);
  },

  async addParticipant(groupId, phoneNumber) {
    return this.callWA('addParticipant', groupId, phoneNumber);
  },

  async checkNumber(phoneNumber) {
    return this.callWA('checkNumber', phoneNumber);
  },

  async markAsRead(chatId) {
    return this.callWA('markAsRead', chatId);
  },

  async setPresence(chatId, state) {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.textContent = `
        window.WA.setPresence('${chatId}', '${state}');
      `;
      document.head.appendChild(script);
      script.remove();
      resolve(true);
    });
  },

  async isParticipant(groupId, phoneNumber) {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          try {
            const group = window.WA.findChatById ? window.WA.findChat('${groupId}') : null;
            if (!group) {
              window.postMessage({ type: 'WA_IS_PARTICIPANT', result: false }, '*');
              return;
            }
            const result = window.WA.isParticipant(group, '${phoneNumber}');
            window.postMessage({ type: 'WA_IS_PARTICIPANT', result }, '*');
          } catch (e) {
            window.postMessage({ type: 'WA_IS_PARTICIPANT', result: false, error: e.message }, '*');
          }
        })();
      `;
      document.head.appendChild(script);
      script.remove();

      const handler = (event) => {
        if (event.data && event.data.type === 'WA_IS_PARTICIPANT') {
          window.removeEventListener('message', handler);
          resolve(event.data.result);
        }
      };
      window.addEventListener('message', handler);

      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve(false);
      }, 5000);
    });
  },

  detectRateLimit() {
    const warnings = [
      'Try again later',
      'Too many requests',
      'Please wait',
      'Slow down',
      'temporarily blocked'
    ];
    const bodyText = document.body.innerText || '';
    return warnings.some(w => bodyText.toLowerCase().includes(w.toLowerCase()));
  },

  isConnected() {
    const loadingIndicators = document.querySelectorAll('[data-testid="qrcode"], .landing-wrapper');
    return loadingIndicators.length === 0 && document.querySelector('[data-testid="chatlist"]') !== null;
  }
};

WhatsAppAPI.init();

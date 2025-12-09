const WhatsAppAPI = {
  isReady: false,
  apiReadyState: 'pending',
  readyCallbacks: [],
  connectionState: false,
  connectionObserver: null,
  connectionCallbacks: [],

  init() {
    this.injectScript();
    this.setupMessageListener();
    this.initConnectionObserver();
  },

  initConnectionObserver() {
    this.updateConnectionState();
    
    this.connectionObserver = new MutationObserver(() => {
      this.updateConnectionState();
    });

    const startObserving = () => {
      this.connectionObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['data-testid', 'class']
      });
    };

    if (document.body) {
      startObserving();
    } else {
      document.addEventListener('DOMContentLoaded', startObserving);
    }
  },

  updateConnectionState() {
    const connectedSelectors = [
      '[data-testid="chatlist"]',
      '[data-testid="chat-list"]', 
      '#pane-side',
      '[data-testid="conversation-panel-wrapper"]',
      '[aria-label*="Chat list"]',
      'div[data-tab="3"]'
    ];
    
    const disconnectedSelectors = [
      '[data-testid="qrcode"]',
      'canvas[aria-label*="QR"]',
      '.landing-wrapper',
      '[data-testid="intro-md-beta-logo-dark"]',
      '[data-testid="intro-md-beta-logo-light"]'
    ];
    
    const hasConnectedElement = connectedSelectors.some(sel => document.querySelector(sel) !== null);
    const hasDisconnectedElement = disconnectedSelectors.some(sel => document.querySelector(sel) !== null);
    
    const newState = hasConnectedElement && !hasDisconnectedElement;
    
    if (newState !== this.connectionState) {
      this.connectionState = newState;
      console.log('WhatsApp connection state changed:', newState ? 'Connected' : 'Disconnected');
      this.connectionCallbacks.forEach(cb => {
        try {
          cb(newState);
        } catch (e) {
          console.error('Connection callback error:', e);
        }
      });
    }
  },

  forceConnectionCheck() {
    this.updateConnectionState();
    return this.connectionState;
  },

  onConnectionChange(callback) {
    if (typeof callback === 'function') {
      this.connectionCallbacks.push(callback);
      callback(this.connectionState);
    }
  },

  injectScript() {
    const wppScript = document.createElement('script');
    wppScript.src = chrome.runtime.getURL('wppconnect-wa.js');
    wppScript.onload = () => {
      console.log('[WA-API] WPPConnect library loaded');
      const injectScript = document.createElement('script');
      injectScript.src = chrome.runtime.getURL('inject.js');
      injectScript.onload = () => {
        injectScript.remove();
        this.waitForReady();
      };
      (document.head || document.documentElement).appendChild(injectScript);
    };
    wppScript.onerror = (e) => {
      console.error('[WA-API] Failed to load WPPConnect library:', e);
    };
    (document.head || document.documentElement).appendChild(wppScript);
  },

  waitForReady() {
    const maxWaitTime = 120000;
    const startTime = Date.now();
    this.apiReadyState = 'initializing';
    
    const checkReady = () => {
      if (window.WA && window.WA.ready) {
        this.isReady = true;
        this.apiReadyState = 'ready';
        this.readyCallbacks.forEach(cb => cb());
        this.readyCallbacks = [];
        console.log('WhatsApp API ready');
      } else if (window.WA && window.WA.error) {
        console.warn('WhatsApp API error:', window.WA.error);
        this.isReady = false;
        this.apiReadyState = 'error';
      } else if (Date.now() - startTime < maxWaitTime) {
        setTimeout(checkReady, 500);
      } else {
        console.warn('WhatsApp API: Timeout waiting for ready state');
        this.apiReadyState = 'timeout';
      }
    };

    window.addEventListener('WAReady', () => {
      this.isReady = true;
      this.apiReadyState = 'ready';
      this.readyCallbacks.forEach(cb => cb());
      this.readyCallbacks = [];
      console.log('WhatsApp API ready (event)');
    });
    
    window.addEventListener('WAError', (e) => {
      console.warn('WhatsApp API error event:', e.detail);
      this.isReady = false;
      this.apiReadyState = 'error';
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

  async waitForWAReady() {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const maxWait = 15000;
      
      const check = () => {
        if (window.WA && window.WA.ready) {
          this.apiReadyState = 'ready';
          resolve(true);
        } else if (Date.now() - startTime >= maxWait) {
          console.warn('[WA-API] waitForWAReady timed out after', maxWait, 'ms');
          resolve(false);
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  },

  async getGroups() {
    const waReady = await this.waitForWAReady();
    
    if (!waReady) {
      console.warn('[WA-API] getGroups: WA not ready');
      return { groups: [], error: 'WhatsApp API not ready. Please wait and try again.' };
    }
    
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          try {
            if (!window.WA || !window.WA.ready) {
              window.postMessage({ type: 'WA_GROUPS', groups: [], error: 'WA not ready' }, '*');
              return;
            }
            const groupsResult = window.WA.getGroups();
            
            if (groupsResult && groupsResult.error) {
              window.postMessage({ type: 'WA_GROUPS', groups: [], error: groupsResult.error }, '*');
              return;
            }
            
            const groupsArray = Array.isArray(groupsResult) ? groupsResult : (groupsResult.groups || []);
            const groups = groupsArray.map(g => ({
              id: g.id?._serialized || String(g.id),
              name: g.name || g.formattedTitle || 'Unknown Group',
              participants: g.groupMetadata?.participants?.length || g.participants?.length || 0
            }));
            console.log('[WA-API] getGroups: Mapped', groups.length, 'groups');
            window.postMessage({ type: 'WA_GROUPS', groups }, '*');
          } catch (e) {
            console.error('[WA-API] getGroups error:', e);
            window.postMessage({ type: 'WA_GROUPS', groups: [], error: e.message }, '*');
          }
        })();
      `;
      document.head.appendChild(script);
      script.remove();

      const handler = (event) => {
        if (event.data && event.data.type === 'WA_GROUPS') {
          window.removeEventListener('message', handler);
          if (event.data.error) {
            console.warn('[WA-API] Groups fetch error:', event.data.error);
            resolve({ groups: event.data.groups || [], error: event.data.error });
          } else {
            resolve({ groups: event.data.groups || [] });
          }
        }
      };
      window.addEventListener('message', handler);

      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve({ groups: [], error: 'Timeout fetching groups' });
      }, 10000);
    });
  },

  async getContacts() {
    await this.waitForWAReady();
    
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.textContent = `
        (function() {
          try {
            if (!window.WA || !window.WA.ready) {
              window.postMessage({ type: 'WA_CONTACTS', contacts: [], error: 'WA not ready' }, '*');
              return;
            }
            const contacts = window.WA.getContacts()
              .filter(c => c.isUser && !c.isGroup && (c.name || c.pushname))
              .map(c => ({
                id: c.id?._serialized || String(c.id),
                name: c.name || c.pushname || 'Unknown',
                phone: c.id?.user || ''
              }));
            window.postMessage({ type: 'WA_CONTACTS', contacts }, '*');
          } catch (e) {
            console.error('[WA-API] getContacts error:', e);
            window.postMessage({ type: 'WA_CONTACTS', contacts: [], error: e.message }, '*');
          }
        })();
      `;
      document.head.appendChild(script);
      script.remove();

      const handler = (event) => {
        if (event.data && event.data.type === 'WA_CONTACTS') {
          window.removeEventListener('message', handler);
          if (event.data.error) {
            console.warn('[WA-API] Contacts fetch error:', event.data.error);
          }
          resolve(event.data.contacts || []);
        }
      };
      window.addEventListener('message', handler);

      setTimeout(() => {
        window.removeEventListener('message', handler);
        resolve([]);
      }, 10000);
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
    return this.callWA('setPresence', chatId, state);
  },

  async isParticipant(groupId, phoneNumber) {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.textContent = `
        (async function() {
          try {
            if (!window.WA || !window.WA.ready) {
              window.postMessage({ type: 'WA_IS_PARTICIPANT', result: false }, '*');
              return;
            }
            const result = await window.WA.isParticipant('${groupId}', '${phoneNumber}');
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

  isConnected(forceCheck = false) {
    if (forceCheck) {
      this.updateConnectionState();
    }
    return this.connectionState && this.isReady && this.apiReadyState === 'ready';
  },

  getApiState() {
    return {
      isReady: this.isReady,
      apiReadyState: this.apiReadyState,
      connectionState: this.connectionState
    };
  }
};

WhatsAppAPI.init();

const AutomationEngine = {
  state: {
    isRunning: false,
    isPaused: false,
    shouldStop: false,
    currentTask: null,
    startTime: null
  },

  results: {
    success: [],
    failed: [],
    skipped: []
  },

  init() {
    this.setupMessageListener();
    this.broadcastConnectionStatus();
    this.registerConnectionListener();
    this.checkConnection();
    console.log('WhatsApp Automation Engine initialized');
  },

  broadcastConnectionStatus() {
    const connected = WhatsAppAPI.isConnected();
    chrome.runtime.sendMessage({
      action: 'connectionStatus',
      connected
    }).catch(() => {});
  },

  registerConnectionListener() {
    WhatsAppAPI.onConnectionChange((connected) => {
      chrome.runtime.sendMessage({
        action: 'connectionStatus',
        connected
      }).catch(() => {});
    });
  },

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sendResponse);
      return true;
    });
  },

  async handleMessage(message, sendResponse) {
    switch (message.action) {
      case 'ping':
        sendResponse({ status: 'ok', connected: WhatsAppAPI.isConnected() });
        break;

      case 'getGroups':
        const groups = await WhatsAppAPI.getGroups();
        sendResponse({ groups });
        break;

      case 'getContacts':
        const contacts = await WhatsAppAPI.getContacts();
        sendResponse({ contacts });
        break;

      case 'addMembers':
        this.startAddMembers(message.groupId, message.phoneNumbers, message.config);
        sendResponse({ status: 'started' });
        break;

      case 'sendBulkMessages':
        this.startBulkMessages(message.targets, message.template, message.config);
        sendResponse({ status: 'started' });
        break;

      case 'pause':
        this.state.isPaused = true;
        sendResponse({ status: 'paused' });
        break;

      case 'resume':
        this.state.isPaused = false;
        sendResponse({ status: 'resumed' });
        break;

      case 'stop':
        this.state.shouldStop = true;
        this.state.isRunning = false;
        sendResponse({ status: 'stopped' });
        break;

      case 'getState':
        sendResponse({
          isRunning: this.state.isRunning,
          isPaused: this.state.isPaused,
          currentTask: this.state.currentTask,
          results: this.results
        });
        break;

      default:
        sendResponse({ error: 'Unknown action' });
    }
  },

  checkConnection() {
    setInterval(() => {
      const connected = WhatsAppAPI.isConnected();
      chrome.runtime.sendMessage({
        action: 'connectionStatus',
        connected
      }).catch(() => {});
    }, 5000);
  },

  async startAddMembers(groupId, phoneNumbers, config) {
    if (this.state.isRunning) {
      this.log('warning', 'Another task is already running');
      return;
    }

    this.state.isRunning = true;
    this.state.isPaused = false;
    this.state.shouldStop = false;
    this.state.currentTask = 'addMembers';
    this.state.startTime = Date.now();
    this.results = { success: [], failed: [], skipped: [] };

    const total = phoneNumbers.length;
    this.log('info', `Starting to add ${total} members to group`);

    for (let i = 0; i < phoneNumbers.length; i++) {
      if (this.state.shouldStop) {
        this.log('warning', 'Operation stopped by user');
        break;
      }

      while (this.state.isPaused) {
        await Utils.sleep(1000);
        if (this.state.shouldStop) break;
      }

      const phone = Utils.formatPhone(phoneNumbers[i]);
      
      this.sendProgress({
        current: i + 1,
        total,
        status: `Adding ${phone}...`,
        successCount: this.results.success.length,
        failedCount: this.results.failed.length,
        skippedCount: this.results.skipped.length
      });

      try {
        const settings = await Storage.getSettings();
        const actionCount = await Storage.getActionCount();
        
        if (actionCount.count >= settings.maxPerHour) {
          this.log('warning', `Hourly limit reached (${settings.maxPerHour}). Waiting...`);
          await Utils.sleep(60000);
          continue;
        }

        const exists = await WhatsAppAPI.checkNumber(phone);
        if (!exists) {
          this.results.failed.push({ phone, reason: 'Number not on WhatsApp' });
          this.log('error', `${phone} - Not on WhatsApp`);
          continue;
        }

        const isAlreadyMember = await WhatsAppAPI.isParticipant(groupId, phone);
        if (isAlreadyMember) {
          this.results.skipped.push({ phone, reason: 'Already in group' });
          this.log('warning', `${phone} - Already in group`);
          continue;
        }

        await WhatsAppAPI.addParticipant(groupId, phone);
        
        this.results.success.push({ phone, timestamp: new Date().toISOString() });
        this.log('success', `${phone} - Added successfully`);
        await Storage.incrementActionCount();

        if (WhatsAppAPI.detectRateLimit()) {
          this.log('warning', 'Rate limit detected. Waiting...');
          await Utils.sleep(settings.cooldownMinutes * 60000);
        }

        let delay = config.delay * 1000;
        if (config.randomDelay) {
          delay = Utils.randomInt(delay - 2000, delay + 2000);
        }
        await Utils.sleep(delay);

        if ((i + 1) % config.batchSize === 0 && i < phoneNumbers.length - 1) {
          this.log('info', `Batch complete. Taking a short break...`);
          await Utils.sleep(30000);
        }

      } catch (error) {
        this.results.failed.push({ phone, reason: error.message });
        this.log('error', `${phone} - ${error.message}`);

        if (config.autoPauseErrors) {
          this.state.isPaused = true;
          this.log('warning', 'Auto-paused due to error');
        }
      }
    }

    this.state.isRunning = false;
    this.state.currentTask = null;

    const summary = `Completed: ${this.results.success.length} added, ${this.results.failed.length} failed, ${this.results.skipped.length} skipped`;
    this.log('info', summary);

    await Storage.saveResults('addMembers', this.results);

    chrome.runtime.sendMessage({
      action: 'taskComplete',
      task: 'addMembers',
      results: this.results
    }).catch(() => {});
  },

  async startBulkMessages(targets, template, config) {
    if (this.state.isRunning) {
      this.log('warning', 'Another task is already running');
      return;
    }

    this.state.isRunning = true;
    this.state.isPaused = false;
    this.state.shouldStop = false;
    this.state.currentTask = 'bulkMessages';
    this.state.startTime = Date.now();
    this.results = { success: [], failed: [], skipped: [] };

    const recipients = await this.parseTargets(targets);
    const total = recipients.length;

    this.log('info', `Starting to send ${total} messages`);

    for (let i = 0; i < recipients.length; i++) {
      if (this.state.shouldStop) {
        this.log('warning', 'Operation stopped by user');
        break;
      }

      while (this.state.isPaused) {
        await Utils.sleep(1000);
        if (this.state.shouldStop) break;
      }

      const recipient = recipients[i];
      
      this.sendProgress({
        current: i + 1,
        total,
        status: `Sending to ${recipient.name || recipient.phone}...`,
        successCount: this.results.success.length,
        failedCount: this.results.failed.length,
        skippedCount: this.results.skipped.length,
        eta: Utils.calculateETA(i + 1, total, this.state.startTime)
      });

      try {
        const settings = await Storage.getSettings();

        if (config.skipRecent) {
          const wasRecent = await Storage.wasRecentlyMessaged(recipient.phone, 24);
          if (wasRecent) {
            this.results.skipped.push({ recipient, reason: 'Recently messaged' });
            this.log('warning', `${recipient.name || recipient.phone} - Recently messaged`);
            continue;
          }
        }

        if (config.skipDuplicates) {
          const isDuplicate = this.results.success.some(r => r.recipient.phone === recipient.phone);
          if (isDuplicate) {
            this.results.skipped.push({ recipient, reason: 'Duplicate' });
            this.log('warning', `${recipient.name || recipient.phone} - Duplicate skipped`);
            continue;
          }
        }

        const actionCount = await Storage.getActionCount();
        if (actionCount.count >= settings.maxPerHour) {
          this.log('warning', `Hourly limit reached. Waiting...`);
          await Utils.sleep(60000);
          await Storage.resetActionCount();
        }

        const message = Utils.replaceVariables(template, {
          name: recipient.name || 'Friend',
          phone: recipient.phone,
          group: recipient.groupName || '',
          date: Utils.formatDate(new Date()),
          time: Utils.formatTime(new Date()),
          custom1: recipient.custom1 || '',
          custom2: recipient.custom2 || ''
        });

        const chatId = recipient.id || recipient.phone.replace(/\D/g, '') + '@c.us';

        if (settings.markAsRead) {
          await WhatsAppAPI.markAsRead(chatId);
          await Utils.sleep(500);
        }

        if (settings.simulateTyping) {
          await WhatsAppAPI.setPresence(chatId, 'composing');
          await Utils.sleep(settings.typingDuration * 1000);
        }

        if (config.media) {
          await WhatsAppAPI.sendMedia(chatId, config.media.base64, message, config.media.type);
        } else {
          await WhatsAppAPI.sendMessage(chatId, message);
        }

        if (settings.simulateTyping) {
          await WhatsAppAPI.setPresence(chatId, 'paused');
        }

        this.results.success.push({ recipient, message, timestamp: new Date().toISOString() });
        this.log('success', `Sent to ${recipient.name || recipient.phone}`);
        
        await Storage.addMessageHistory(recipient.phone);
        await Storage.incrementActionCount();

        if (WhatsAppAPI.detectRateLimit()) {
          this.log('warning', 'Rate limit detected. Waiting...');
          await Utils.sleep(settings.cooldownMinutes * 60000);
        }

        let delay = config.delay * 1000;
        if (config.randomDelay) {
          delay = Utils.randomInt(delay - 3000, delay + 3000);
        }
        await Utils.sleep(delay);

        if ((i + 1) % config.batchSize === 0 && i < recipients.length - 1) {
          this.log('info', `Batch complete. Taking ${config.batchBreak}min break...`);
          await Utils.sleep(config.batchBreak * 60000);
        }

      } catch (error) {
        this.results.failed.push({ recipient, reason: error.message });
        this.log('error', `Failed for ${recipient.name || recipient.phone}: ${error.message}`);

        const settings = await Storage.getSettings();
        if (settings.autoPauseErrors) {
          this.state.isPaused = true;
          this.log('warning', 'Auto-paused due to error');
        }
      }
    }

    this.state.isRunning = false;
    this.state.currentTask = null;

    const successRate = total > 0 ? Math.round((this.results.success.length / total) * 100) : 0;
    const summary = `Completed: ${this.results.success.length} sent, ${this.results.failed.length} failed, ${this.results.skipped.length} skipped (${successRate}% success)`;
    this.log('info', summary);

    await Storage.saveResults('bulkMessages', this.results);

    chrome.runtime.sendMessage({
      action: 'taskComplete',
      task: 'bulkMessages',
      results: this.results
    }).catch(() => {});
  },

  async parseTargets(targets) {
    const recipients = [];

    if (targets.type === 'numbers' && targets.numbers) {
      for (const phone of targets.numbers) {
        recipients.push({
          phone: Utils.formatPhone(phone),
          name: '',
          custom1: '',
          custom2: ''
        });
      }
    } else if (targets.type === 'csv' && targets.data) {
      for (const row of targets.data) {
        recipients.push({
          phone: Utils.formatPhone(row.phone),
          name: row.name || '',
          custom1: row.custom1 || '',
          custom2: row.custom2 || ''
        });
      }
    } else if (targets.type === 'groups' && targets.selected) {
      for (const groupId of targets.selected) {
        recipients.push({
          id: groupId,
          phone: groupId,
          name: targets.names?.[groupId] || 'Group',
          groupName: targets.names?.[groupId] || 'Group'
        });
      }
    } else if (targets.type === 'contacts' && targets.selected) {
      const contacts = await WhatsAppAPI.getContacts();
      for (const contactId of targets.selected) {
        const contact = contacts.find(c => c.id === contactId);
        if (contact) {
          recipients.push({
            id: contactId,
            phone: contact.phone,
            name: contact.name
          });
        }
      }
    } else if (targets.type === 'allGroups') {
      const groups = await WhatsAppAPI.getGroups();
      for (const group of groups) {
        recipients.push({
          id: group.id,
          phone: group.id,
          name: group.name,
          groupName: group.name
        });
      }
    }

    return recipients;
  },

  log(type, message) {
    const timestamp = Utils.formatTimestamp(new Date());
    const logEntry = { type, message, timestamp };

    Storage.addLog(logEntry);

    chrome.runtime.sendMessage({
      action: 'log',
      data: logEntry
    }).catch(() => {});

    const colors = {
      success: 'color: #28a745',
      error: 'color: #dc3545',
      warning: 'color: #ffc107',
      info: 'color: #17a2b8'
    };

    console.log(`%c[${timestamp}] ${message}`, colors[type] || '');
  },

  sendProgress(data) {
    chrome.runtime.sendMessage({
      action: 'progress',
      data
    }).catch(() => {});
  }
};

AutomationEngine.init();

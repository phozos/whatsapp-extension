class PopupController {
  constructor() {
    this.activeTab = 'members';
    this.groups = [];
    this.contacts = [];
    this.selectedRecipients = [];
    this.csvData = null;
    this.mediaData = null;
    this.init();
  }

  async init() {
    this.bindTabs();
    this.bindAddMembersControls();
    this.bindBulkMessageControls();
    this.bindSettingsControls();
    this.bindLogControls();
    this.setupMessageListener();
    await this.loadSettings();
    await this.checkConnection();
    await this.loadGroups();
  }

  bindTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        
        btn.classList.add('active');
        const tabId = btn.dataset.tab;
        document.getElementById(tabId).classList.add('active');
        this.activeTab = tabId;

        if (tabId === 'messages' && this.groups.length === 0) {
          this.loadGroups();
        }
      });
    });
  }

  bindAddMembersControls() {
    document.getElementById('refreshGroups').addEventListener('click', () => this.loadGroups());
    document.getElementById('validateNumbers').addEventListener('click', () => this.validateNumbers());
    document.getElementById('startAddMembers').addEventListener('click', () => this.startAddMembers());
    document.getElementById('pauseAddMembers').addEventListener('click', () => this.togglePause('add'));
    document.getElementById('stopAddMembers').addEventListener('click', () => this.stopTask('add'));
    document.getElementById('clearAddLog').addEventListener('click', () => this.clearLog('addLog'));
  }

  bindBulkMessageControls() {
    document.getElementById('sendTo').addEventListener('change', (e) => this.handleSendToChange(e));
    document.getElementById('recipientSearch').addEventListener('input', (e) => this.filterRecipients(e));
    document.getElementById('csvUpload').addEventListener('change', (e) => this.handleCSVUpload(e));
    document.getElementById('mediaUpload').addEventListener('change', (e) => this.handleMediaUpload(e));
    document.getElementById('previewMessages').addEventListener('click', () => this.previewMessages());
    document.getElementById('startBulkMessage').addEventListener('click', () => this.startBulkMessages());
    document.getElementById('pauseBulkMessage').addEventListener('click', () => this.togglePause('msg'));
    document.getElementById('stopBulkMessage').addEventListener('click', () => this.stopTask('msg'));
    document.getElementById('clearMsgLog').addEventListener('click', () => this.clearLog('msgLog'));

    document.querySelectorAll('.variable-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const template = document.getElementById('messageTemplate');
        const variable = tag.textContent;
        const cursorPos = template.selectionStart;
        const textBefore = template.value.substring(0, cursorPos);
        const textAfter = template.value.substring(cursorPos);
        template.value = textBefore + variable + textAfter;
        template.focus();
        template.selectionStart = template.selectionEnd = cursorPos + variable.length;
      });
    });
  }

  bindSettingsControls() {
    document.getElementById('saveSettings').addEventListener('click', () => this.saveSettings());
    document.getElementById('resetSettings').addEventListener('click', () => this.resetSettings());
    document.getElementById('exportLogs').addEventListener('click', () => this.exportLogs());
    document.getElementById('exportSuccess').addEventListener('click', () => this.exportResults('success'));
    document.getElementById('exportFailed').addEventListener('click', () => this.exportResults('failed'));
    document.getElementById('clearLogs').addEventListener('click', () => this.clearAllLogs());
    document.getElementById('clearHistory').addEventListener('click', () => this.clearHistory());
  }

  bindLogControls() {
    const retryBtn = document.getElementById('retryConnection');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.reconnect());
    }
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'log':
          this.appendLog(message.data);
          break;
        case 'progress':
          this.updateProgress(message.data);
          break;
        case 'connectionStatus':
          this.updateConnectionStatus(message.connected);
          break;
        case 'taskComplete':
          this.handleTaskComplete(message);
          break;
      }
    });
  }

  async checkConnection() {
    const retryDelays = [500, 1000, 2000, 4000];
    
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab.url?.includes('web.whatsapp.com')) {
        this.updateConnectionStatus(false, 'Open WhatsApp Web');
        return;
      }

      for (let attempt = 0; attempt <= retryDelays.length; attempt++) {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
          if (response?.connected) {
            this.updateConnectionStatus(true);
            return;
          }
        } catch (error) {
        }

        if (attempt < retryDelays.length) {
          await new Promise(resolve => setTimeout(resolve, retryDelays[attempt]));
        }
      }

      this.updateConnectionStatus(false);
    } catch (error) {
      this.updateConnectionStatus(false, 'Not connected');
    }
  }

  async reconnect() {
    this.updateConnectionStatus(false, 'Retrying...');
    await this.checkConnection();
  }

  updateConnectionStatus(connected, text = null) {
    const indicator = document.getElementById('connectionStatus');
    const dot = indicator.querySelector('.status-dot');
    const statusText = indicator.querySelector('.status-text');
    const retryBtn = document.getElementById('retryConnection');

    dot.classList.remove('connected', 'disconnected');
    dot.classList.add(connected ? 'connected' : 'disconnected');
    statusText.textContent = text || (connected ? 'Connected' : 'Disconnected');

    if (retryBtn) {
      retryBtn.style.display = connected ? 'none' : 'inline';
    }
  }

  async loadGroups() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getGroups' });
      
      this.groups = response?.groups || [];
      this.populateGroupSelect();
      this.populateRecipientList();
    } catch (error) {
      console.error('Error loading groups:', error);
      this.groups = [];
    }
  }

  async loadContacts() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const response = await chrome.tabs.sendMessage(tab.id, { action: 'getContacts' });
      
      this.contacts = response?.contacts || [];
      this.populateRecipientList();
    } catch (error) {
      console.error('Error loading contacts:', error);
      this.contacts = [];
    }
  }

  populateGroupSelect() {
    const select = document.getElementById('groupSelect');
    select.innerHTML = '<option value="">-- Select a Group --</option>';
    
    this.groups.forEach(group => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = `${group.name} (${group.participants || 0} members)`;
      select.appendChild(option);
    });
  }

  populateRecipientList() {
    const list = document.getElementById('recipientList');
    const sendTo = document.getElementById('sendTo').value;
    
    list.innerHTML = '';
    
    const items = sendTo === 'contacts' ? this.contacts : this.groups;
    
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'multi-select-item';
      div.innerHTML = `
        <input type="checkbox" id="recipient-${item.id}" value="${item.id}">
        <label for="recipient-${item.id}">${item.name}</label>
      `;
      
      div.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) {
          this.selectedRecipients.push(item.id);
          div.classList.add('selected');
        } else {
          this.selectedRecipients = this.selectedRecipients.filter(id => id !== item.id);
          div.classList.remove('selected');
        }
      });
      
      list.appendChild(div);
    });
  }

  handleSendToChange(e) {
    const value = e.target.value;
    const recipientGroup = document.getElementById('recipientSelectGroup');
    const phoneListGroup = document.getElementById('phoneListGroup');
    
    if (value === 'numbers') {
      recipientGroup.style.display = 'none';
      phoneListGroup.style.display = 'block';
    } else {
      recipientGroup.style.display = 'block';
      phoneListGroup.style.display = 'none';
      
      if (value === 'contacts' && this.contacts.length === 0) {
        this.loadContacts();
      } else {
        this.populateRecipientList();
      }
    }
  }

  filterRecipients(e) {
    const query = e.target.value.toLowerCase();
    const items = document.querySelectorAll('.multi-select-item');
    
    items.forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(query) ? 'flex' : 'none';
    });
  }

  async handleCSVUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      this.csvData = Utils.parseCSV(text);
      this.appendLog({ type: 'info', message: `Loaded ${this.csvData.length} rows from CSV`, timestamp: Utils.formatTimestamp(new Date()) }, 'msgLog');
    } catch (error) {
      this.appendLog({ type: 'error', message: `CSV Error: ${error.message}`, timestamp: Utils.formatTimestamp(new Date()) }, 'msgLog');
    }
  }

  async handleMediaUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const base64 = await Utils.fileToBase64(file);
      this.mediaData = {
        base64,
        type: Utils.getFileType(file),
        name: file.name
      };

      const preview = document.getElementById('mediaPreview');
      if (file.type.startsWith('image/')) {
        preview.innerHTML = `<img src="${base64}" alt="Preview">`;
      } else {
        preview.innerHTML = `<span>Attached: ${file.name}</span>`;
      }
    } catch (error) {
      console.error('Error uploading media:', error);
    }
  }

  validateNumbers() {
    const textarea = document.getElementById('phoneNumbers');
    const numbers = textarea.value.split('\n').map(n => n.trim()).filter(n => n);
    
    const valid = [];
    const invalid = [];
    
    numbers.forEach(num => {
      const formatted = Utils.normalizePhone(num);
      if (Utils.validatePhone(formatted)) {
        valid.push(formatted);
      } else {
        invalid.push(num);
      }
    });

    if (invalid.length > 0) {
      this.appendLog({ 
        type: 'warning', 
        message: `Invalid numbers: ${invalid.join(', ')}`, 
        timestamp: Utils.formatTimestamp(new Date()) 
      }, 'addLog');
    }

    if (valid.length > 0) {
      textarea.value = valid.join('\n');
      this.appendLog({ 
        type: 'success', 
        message: `${valid.length} valid numbers ready`, 
        timestamp: Utils.formatTimestamp(new Date()) 
      }, 'addLog');
    }
  }

  async startAddMembers() {
    const groupId = document.getElementById('groupSelect').value;
    if (!groupId) {
      alert('Please select a group');
      return;
    }

    const phoneNumbers = document.getElementById('phoneNumbers').value
      .split('\n')
      .map(n => Utils.normalizePhone(n.trim()))
      .filter(n => n && Utils.validatePhone(n));

    if (phoneNumbers.length === 0) {
      alert('Please enter valid phone numbers');
      return;
    }

    const config = {
      delay: parseInt(document.getElementById('addDelay').value) || 5,
      batchSize: parseInt(document.getElementById('addBatchSize').value) || 10,
      randomDelay: document.getElementById('addRandomDelay').checked
    };

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, {
        action: 'addMembers',
        groupId,
        phoneNumbers,
        config
      });

      document.getElementById('startAddMembers').disabled = true;
      document.getElementById('pauseAddMembers').disabled = false;
      document.getElementById('stopAddMembers').disabled = false;
      document.getElementById('addProgress').style.display = 'block';

    } catch (error) {
      alert('Error: ' + error.message);
    }
  }

  async startBulkMessages() {
    const template = document.getElementById('messageTemplate').value.trim();
    if (!template) {
      alert('Please enter a message template');
      return;
    }

    const sendTo = document.getElementById('sendTo').value;
    let targets = { type: sendTo };

    if (sendTo === 'numbers') {
      const numbers = document.getElementById('messagePhoneNumbers').value
        .split('\n')
        .map(n => Utils.normalizePhone(n.trim()))
        .filter(n => n);
      
      if (numbers.length === 0 && !this.csvData) {
        alert('Please enter phone numbers or upload a CSV');
        return;
      }
      
      targets.numbers = numbers;
      if (this.csvData) {
        targets.type = 'csv';
        targets.data = this.csvData;
      }
    } else if (sendTo === 'allGroups') {
      // Will be populated by content script
    } else {
      if (this.selectedRecipients.length === 0) {
        alert('Please select at least one recipient');
        return;
      }
      targets.selected = this.selectedRecipients;
      targets.names = {};
      const items = sendTo === 'contacts' ? this.contacts : this.groups;
      items.forEach(item => {
        targets.names[item.id] = item.name;
      });
    }

    const config = {
      delay: parseInt(document.getElementById('msgDelay').value) || 10,
      batchSize: parseInt(document.getElementById('msgBatchSize').value) || 10,
      batchBreak: parseInt(document.getElementById('msgBatchBreak').value) || 5,
      skipDuplicates: document.getElementById('skipDuplicates').checked,
      skipRecent: document.getElementById('skipRecent').checked,
      randomDelay: true,
      media: this.mediaData
    };

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, {
        action: 'sendBulkMessages',
        template,
        targets,
        config
      });

      document.getElementById('startBulkMessage').disabled = true;
      document.getElementById('pauseBulkMessage').disabled = false;
      document.getElementById('stopBulkMessage').disabled = false;
      document.getElementById('msgProgress').style.display = 'block';

    } catch (error) {
      alert('Error: ' + error.message);
    }
  }

  previewMessages() {
    const template = document.getElementById('messageTemplate').value;
    const preview = document.getElementById('previewContainer');
    const content = document.getElementById('previewContent');

    const sampleData = [
      { name: 'John', phone: '+919876543210', custom1: 'Gold', custom2: 'Member' },
      { name: 'Sarah', phone: '+919876543211', custom1: 'Silver', custom2: 'Guest' },
      { name: 'Mike', phone: '+919876543212', custom1: 'Platinum', custom2: 'VIP' }
    ];

    content.innerHTML = '';

    sampleData.slice(0, 3).forEach(data => {
      const message = Utils.replaceVariables(template, {
        ...data,
        group: 'Sample Group',
        date: Utils.formatDate(new Date()),
        time: Utils.formatTime(new Date())
      });

      const div = document.createElement('div');
      div.className = 'preview-message';
      div.innerHTML = `
        <div class="preview-recipient">To: ${data.name} (${data.phone})</div>
        <div>${Utils.sanitizeHTML(message)}</div>
      `;
      content.appendChild(div);
    });

    preview.style.display = 'block';
  }

  async togglePause(type) {
    const btn = document.getElementById(type === 'add' ? 'pauseAddMembers' : 'pauseBulkMessage');
    const isPausing = btn.textContent === 'Pause';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { action: isPausing ? 'pause' : 'resume' });
      btn.textContent = isPausing ? 'Resume' : 'Pause';
    } catch (error) {
      console.error('Error toggling pause:', error);
    }
  }

  async stopTask(type) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await chrome.tabs.sendMessage(tab.id, { action: 'stop' });
      this.resetControls(type);
    } catch (error) {
      console.error('Error stopping task:', error);
    }
  }

  resetControls(type) {
    if (type === 'add') {
      document.getElementById('startAddMembers').disabled = false;
      document.getElementById('pauseAddMembers').disabled = true;
      document.getElementById('pauseAddMembers').textContent = 'Pause';
      document.getElementById('stopAddMembers').disabled = true;
    } else {
      document.getElementById('startBulkMessage').disabled = false;
      document.getElementById('pauseBulkMessage').disabled = true;
      document.getElementById('pauseBulkMessage').textContent = 'Pause';
      document.getElementById('stopBulkMessage').disabled = true;
    }
  }

  updateProgress(data) {
    const isAdd = this.activeTab === 'members';
    const prefix = isAdd ? 'add' : 'msg';

    const progressFill = document.getElementById(`${prefix}ProgressFill`);
    const progressText = document.getElementById(`${prefix}ProgressText`);
    
    const percent = data.total > 0 ? (data.current / data.total) * 100 : 0;
    progressFill.style.width = `${percent}%`;

    if (isAdd) {
      progressText.textContent = `Added ${data.successCount || 0}/${data.total} members (${data.failedCount || 0} failed, ${data.skippedCount || 0} skipped)`;
    } else {
      progressText.textContent = `Sent ${data.successCount || 0}/${data.total} messages (${data.failedCount || 0} failed, ${data.skippedCount || 0} skipped)`;
      
      if (data.eta) {
        document.getElementById('msgTimeRemaining').textContent = `ETA: ${data.eta}`;
      }
      
      const successRate = data.total > 0 ? Math.round((data.successCount / data.current) * 100) : 0;
      document.getElementById('msgSuccessRate').textContent = `Success: ${successRate}%`;
    }
  }

  handleTaskComplete(message) {
    const isAdd = message.task === 'addMembers';
    this.resetControls(isAdd ? 'add' : 'msg');

    const { results } = message;
    const summary = `Completed: ${results.success.length} successful, ${results.failed.length} failed, ${results.skipped.length} skipped`;
    
    this.appendLog({ 
      type: 'info', 
      message: summary, 
      timestamp: Utils.formatTimestamp(new Date()) 
    }, isAdd ? 'addLog' : 'msgLog');

    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Task Complete',
      message: summary
    });
  }

  appendLog(data, containerId = null) {
    const container = document.getElementById(containerId || (this.activeTab === 'members' ? 'addLog' : 'msgLog'));
    
    const entry = document.createElement('div');
    entry.className = `log-entry ${data.type}`;
    entry.innerHTML = `<span class="log-timestamp">[${data.timestamp}]</span> ${Utils.sanitizeHTML(data.message)}`;
    
    container.appendChild(entry);
    container.scrollTop = container.scrollHeight;
  }

  clearLog(containerId) {
    document.getElementById(containerId).innerHTML = '';
  }

  async loadSettings() {
    const settings = await Storage.getSettings();

    document.getElementById('enableNotifications').checked = settings.enableNotifications;
    document.getElementById('autoPauseErrors').checked = settings.autoPauseErrors;
    document.getElementById('maxRetries').value = settings.maxRetries;
    document.getElementById('screenshotErrors').checked = settings.screenshotErrors;
    document.getElementById('maxPerHour').value = settings.maxPerHour;
    document.getElementById('smartRateLimit').checked = settings.smartRateLimit;
    document.getElementById('cooldownMinutes').value = settings.cooldownMinutes;
    document.getElementById('simulateTyping').checked = settings.simulateTyping;
    document.getElementById('typingDuration').value = settings.typingDuration;
    document.getElementById('markAsRead').checked = settings.markAsRead;
  }

  async saveSettings() {
    const settings = {
      enableNotifications: document.getElementById('enableNotifications').checked,
      autoPauseErrors: document.getElementById('autoPauseErrors').checked,
      maxRetries: parseInt(document.getElementById('maxRetries').value),
      screenshotErrors: document.getElementById('screenshotErrors').checked,
      maxPerHour: parseInt(document.getElementById('maxPerHour').value),
      smartRateLimit: document.getElementById('smartRateLimit').checked,
      cooldownMinutes: parseInt(document.getElementById('cooldownMinutes').value),
      simulateTyping: document.getElementById('simulateTyping').checked,
      typingDuration: parseInt(document.getElementById('typingDuration').value),
      markAsRead: document.getElementById('markAsRead').checked
    };

    await Storage.saveSettings(settings);
    alert('Settings saved successfully!');
  }

  async resetSettings() {
    if (confirm('Are you sure you want to reset all settings to defaults?')) {
      await Storage.resetSettings();
      await this.loadSettings();
      alert('Settings reset to defaults');
    }
  }

  async exportLogs() {
    const logs = await Storage.getLogs();
    const csv = Utils.convertToCSV(logs.map(l => ({
      timestamp: l.timestamp,
      type: l.type,
      message: l.message
    })));
    Utils.downloadFile(csv, `whatsapp-logs-${Date.now()}.csv`);
  }

  async exportResults(type) {
    const addResults = await Storage.getResults('addMembers');
    const msgResults = await Storage.getResults('bulkMessages');

    let data = [];
    
    if (type === 'success') {
      data = [
        ...addResults.success.map(r => r.phone),
        ...msgResults.success.map(r => r.recipient?.phone || r.phone)
      ];
    } else {
      data = [
        ...addResults.failed.map(r => `${r.phone}: ${r.reason}`),
        ...msgResults.failed.map(r => `${r.recipient?.phone || r.phone}: ${r.reason}`)
      ];
    }

    Utils.downloadFile(data.join('\n'), `whatsapp-${type}-${Date.now()}.txt`);
  }

  async clearAllLogs() {
    if (confirm('Are you sure you want to clear all logs?')) {
      await Storage.clearLogs();
      this.clearLog('addLog');
      this.clearLog('msgLog');
      alert('Logs cleared');
    }
  }

  async clearHistory() {
    if (confirm('Are you sure you want to clear message history?')) {
      await Storage.clearMessageHistory();
      await Storage.clearResults('addMembers');
      await Storage.clearResults('bulkMessages');
      alert('History cleared');
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});

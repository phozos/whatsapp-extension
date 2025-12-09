const Storage = {
  defaults: {
    addDelay: 5000,
    addBatchSize: 10,
    addRandomDelay: true,
    msgDelay: 10000,
    msgBatchSize: 10,
    msgBatchBreak: 300000,
    skipDuplicates: true,
    skipRecent: true,
    enableNotifications: true,
    autoPauseErrors: true,
    maxRetries: 3,
    screenshotErrors: false,
    maxPerHour: 50,
    smartRateLimit: true,
    cooldownMinutes: 15,
    simulateTyping: true,
    typingDuration: 3,
    markAsRead: false
  },

  async getSettings() {
    try {
      const result = await chrome.storage.sync.get('settings');
      return { ...this.defaults, ...(result.settings || {}) };
    } catch (error) {
      console.error('Error loading settings:', error);
      return this.defaults;
    }
  },

  async saveSettings(settings) {
    try {
      await chrome.storage.sync.set({ settings: { ...this.defaults, ...settings } });
      return true;
    } catch (error) {
      console.error('Error saving settings:', error);
      return false;
    }
  },

  async resetSettings() {
    try {
      await chrome.storage.sync.set({ settings: this.defaults });
      return true;
    } catch (error) {
      console.error('Error resetting settings:', error);
      return false;
    }
  },

  async getLogs() {
    try {
      const result = await chrome.storage.local.get('logs');
      return result.logs || [];
    } catch (error) {
      console.error('Error loading logs:', error);
      return [];
    }
  },

  async addLog(log) {
    try {
      const logs = await this.getLogs();
      logs.push({
        ...log,
        id: Date.now(),
        timestamp: new Date().toISOString()
      });
      
      if (logs.length > 1000) {
        logs.splice(0, logs.length - 1000);
      }
      
      await chrome.storage.local.set({ logs });
      return true;
    } catch (error) {
      console.error('Error adding log:', error);
      return false;
    }
  },

  async clearLogs() {
    try {
      await chrome.storage.local.set({ logs: [] });
      return true;
    } catch (error) {
      console.error('Error clearing logs:', error);
      return false;
    }
  },

  async getMessageHistory() {
    try {
      const result = await chrome.storage.local.get('messageHistory');
      return result.messageHistory || {};
    } catch (error) {
      console.error('Error loading message history:', error);
      return {};
    }
  },

  async addMessageHistory(phone) {
    try {
      const history = await this.getMessageHistory();
      history[phone] = {
        timestamp: Date.now(),
        count: (history[phone]?.count || 0) + 1
      };
      await chrome.storage.local.set({ messageHistory: history });
      return true;
    } catch (error) {
      console.error('Error adding message history:', error);
      return false;
    }
  },

  async wasRecentlyMessaged(phone, hoursAgo = 24) {
    try {
      const history = await this.getMessageHistory();
      const record = history[phone];
      if (!record) return false;
      
      const hoursDiff = (Date.now() - record.timestamp) / (1000 * 60 * 60);
      return hoursDiff < hoursAgo;
    } catch (error) {
      console.error('Error checking message history:', error);
      return false;
    }
  },

  async clearMessageHistory() {
    try {
      await chrome.storage.local.set({ messageHistory: {} });
      return true;
    } catch (error) {
      console.error('Error clearing message history:', error);
      return false;
    }
  },

  async getResults(type) {
    try {
      const key = `${type}Results`;
      const result = await chrome.storage.local.get(key);
      return result[key] || { success: [], failed: [], skipped: [] };
    } catch (error) {
      console.error('Error loading results:', error);
      return { success: [], failed: [], skipped: [] };
    }
  },

  async saveResults(type, results) {
    try {
      const key = `${type}Results`;
      await chrome.storage.local.set({ [key]: results });
      return true;
    } catch (error) {
      console.error('Error saving results:', error);
      return false;
    }
  },

  async clearResults(type) {
    try {
      const key = `${type}Results`;
      await chrome.storage.local.set({ [key]: { success: [], failed: [], skipped: [] } });
      return true;
    } catch (error) {
      console.error('Error clearing results:', error);
      return false;
    }
  },

  async getState() {
    try {
      const result = await chrome.storage.local.get('automationState');
      return result.automationState || {
        isRunning: false,
        isPaused: false,
        currentTask: null,
        progress: { current: 0, total: 0 }
      };
    } catch (error) {
      console.error('Error loading state:', error);
      return { isRunning: false, isPaused: false, currentTask: null, progress: { current: 0, total: 0 } };
    }
  },

  async saveState(state) {
    try {
      await chrome.storage.local.set({ automationState: state });
      return true;
    } catch (error) {
      console.error('Error saving state:', error);
      return false;
    }
  },

  async getActionCount() {
    try {
      const result = await chrome.storage.local.get('actionCount');
      const data = result.actionCount || { count: 0, hourStart: Date.now() };
      
      if (Date.now() - data.hourStart > 3600000) {
        return { count: 0, hourStart: Date.now() };
      }
      
      return data;
    } catch (error) {
      console.error('Error loading action count:', error);
      return { count: 0, hourStart: Date.now() };
    }
  },

  async incrementActionCount() {
    try {
      const data = await this.getActionCount();
      data.count++;
      await chrome.storage.local.set({ actionCount: data });
      return data.count;
    } catch (error) {
      console.error('Error incrementing action count:', error);
      return 0;
    }
  },

  async resetActionCount() {
    try {
      await chrome.storage.local.set({ actionCount: { count: 0, hourStart: Date.now() } });
      return true;
    } catch (error) {
      console.error('Error resetting action count:', error);
      return false;
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Storage;
}

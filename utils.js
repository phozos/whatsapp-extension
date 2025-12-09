const Utils = {
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  validatePhone(phone) {
    const regex = /^\+\d{10,15}$/;
    return regex.test(phone.replace(/[\s\-\(\)]/g, ''));
  },

  formatPhone(phone) {
    return phone.replace(/[^\d+]/g, '');
  },

  normalizePhone(phone) {
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    if (!cleaned.startsWith('+')) {
      cleaned = '+' + cleaned;
    }
    return cleaned;
  },

  formatDate(date) {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  },

  formatTime(date) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  },

  formatTimestamp(date) {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  },

  replaceVariables(template, data) {
    let result = template;
    
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'gi');
      result = result.replace(regex, data[key] || '');
    });

    result = result.replace(/{{random\((\d+),(\d+)\)}}/g, (match, min, max) => {
      return this.randomInt(parseInt(min), parseInt(max));
    });

    result = result.replace(/{{uppercase:(.+?)}}/g, (match, text) => {
      return text.toUpperCase();
    });

    result = result.replace(/{{lowercase:(.+?)}}/g, (match, text) => {
      return text.toLowerCase();
    });

    result = result.replace(/{{capitalize:(.+?)}}/g, (match, text) => {
      return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
    });

    return result.trim();
  },

  parseCSV(text) {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const data = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCSVLine(lines[i]);
      if (values.length >= headers.length) {
        const obj = {};
        headers.forEach((header, idx) => {
          obj[header] = values[idx]?.trim() || '';
        });
        data.push(obj);
      }
    }

    return data;
  },

  parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    
    return result;
  },

  convertToCSV(data) {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const rows = data.map(row => 
      headers.map(header => {
        const value = String(row[header] || '');
        return value.includes(',') || value.includes('"') 
          ? `"${value.replace(/"/g, '""')}"` 
          : value;
      }).join(',')
    );
    
    return [headers.join(','), ...rows].join('\n');
  },

  downloadFile(content, filename) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  getFileType(file) {
    const mimeType = file.type;
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'document';
  },

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },

  throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      if (!inThrottle) {
        func.apply(this, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  },

  sanitizeHTML(str) {
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML;
  },

  truncate(str, length = 50) {
    if (str.length <= length) return str;
    return str.substring(0, length) + '...';
  },

  calculateETA(current, total, startTime) {
    if (current === 0) return '--';
    
    const elapsed = Date.now() - startTime;
    const avgTimePerItem = elapsed / current;
    const remaining = (total - current) * avgTimePerItem;
    
    if (remaining < 60000) {
      return `${Math.ceil(remaining / 1000)}s`;
    } else if (remaining < 3600000) {
      return `${Math.ceil(remaining / 60000)}m`;
    } else {
      return `${Math.floor(remaining / 3600000)}h ${Math.ceil((remaining % 3600000) / 60000)}m`;
    }
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Utils;
}

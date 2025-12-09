chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('WhatsApp Pro Automation installed');
    
    chrome.storage.sync.set({
      settings: {
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
      }
    });
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'log':
      handleLog(message.data);
      break;
      
    case 'progress':
      handleProgress(message.data);
      break;
      
    case 'connectionStatus':
      handleConnectionStatus(message.connected);
      break;
      
    case 'taskComplete':
      handleTaskComplete(message);
      break;
      
    case 'showNotification':
      showNotification(message.title, message.message);
      break;
  }
  
  return true;
});

function handleLog(data) {
  console.log(`[${data.type}] ${data.message}`);
  
  chrome.storage.local.get(['logs'], (result) => {
    const logs = result.logs || [];
    logs.push({
      ...data,
      id: Date.now()
    });
    
    if (logs.length > 1000) {
      logs.splice(0, logs.length - 1000);
    }
    
    chrome.storage.local.set({ logs });
  });
}

function handleProgress(data) {
  chrome.runtime.sendMessage({
    action: 'progress',
    data
  }).catch(() => {});
}

function handleConnectionStatus(connected) {
  chrome.action.setBadgeText({ 
    text: connected ? '' : '!' 
  });
  chrome.action.setBadgeBackgroundColor({ 
    color: connected ? '#25D366' : '#dc3545' 
  });
}

async function handleTaskComplete(message) {
  const { task, results } = message;
  
  const successCount = results.success?.length || 0;
  const failedCount = results.failed?.length || 0;
  const skippedCount = results.skipped?.length || 0;
  
  const settings = await chrome.storage.sync.get('settings');
  
  if (settings.settings?.enableNotifications) {
    const taskName = task === 'addMembers' ? 'Member Addition' : 'Bulk Messaging';
    showNotification(
      `${taskName} Complete`,
      `Success: ${successCount}, Failed: ${failedCount}, Skipped: ${skippedCount}`
    );
  }
  
  const key = `${task}Results`;
  await chrome.storage.local.set({ [key]: results });
}

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message
  });
}

chrome.alarms.create('resetHourlyCount', { periodInMinutes: 60 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'resetHourlyCount') {
    chrome.storage.local.set({ 
      actionCount: { count: 0, hourStart: Date.now() } 
    });
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (!tab.url?.includes('web.whatsapp.com')) {
    chrome.tabs.create({ url: 'https://web.whatsapp.com' });
  }
});

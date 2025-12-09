(function() {
  if (window.WAInjected) return;
  window.WAInjected = true;

  async function initializeWA() {
    try {
      console.log('[WA-EXT] Waiting for WPP to initialize...');

      const maxAttempts = 300;
      let attempts = 0;

      const waitForWPP = () => {
        return new Promise((resolve, reject) => {
          const check = () => {
            attempts++;
            if (typeof WPP !== 'undefined' && WPP.webpack) {
              resolve();
            } else if (attempts >= maxAttempts) {
              reject(new Error('WPP not found after max attempts'));
            } else {
              setTimeout(check, 200);
            }
          };
          check();
        });
      };

      await waitForWPP();
      console.log('[WA-EXT] WPP object found, waiting for webpack...');

      await WPP.webpack.onReady();
      console.log('[WA-EXT] WPP webpack ready');

      if (WPP.isReady && typeof WPP.isReady.then === 'function') {
        await WPP.isReady;
      } else if (WPP.waitForReady) {
        await WPP.waitForReady();
      }
      console.log('[WA-EXT] WPP fully ready');

      window.WA = {
        ready: true,
        WPP: WPP,

        getChats: function() {
          try {
            console.log('[WA-EXT] getChats: Trying to fetch chats...');
            
            if (WPP.whatsapp && WPP.whatsapp.ChatStore) {
              const chats = WPP.whatsapp.ChatStore.getModelsArray();
              console.log('[WA-EXT] getChats: Got', chats?.length || 0, 'chats from ChatStore');
              if (chats && chats.length > 0) return chats;
            }
            
            if (WPP.chat && WPP.chat.list) {
              try {
                const chats = WPP.chat.list();
                console.log('[WA-EXT] getChats: Got', chats?.length || 0, 'chats from WPP.chat.list');
                if (chats && chats.length > 0) return chats;
              } catch (e) {
                console.log('[WA-EXT] getChats: WPP.chat.list failed:', e.message);
              }
            }
            
            if (typeof Store !== 'undefined' && Store.Chat) {
              try {
                const chats = Store.Chat.getModelsArray ? Store.Chat.getModelsArray() : Store.Chat.models;
                console.log('[WA-EXT] getChats: Got', chats?.length || 0, 'chats from Store.Chat');
                if (chats && chats.length > 0) return chats;
              } catch (e) {
                console.log('[WA-EXT] getChats: Store.Chat failed:', e.message);
              }
            }
            
            console.warn('[WA-EXT] getChats: No chats found from any source');
            return [];
          } catch (e) {
            console.error('[WA-EXT] Error getting chats:', e);
            return [];
          }
        },

        getGroups: function() {
          try {
            console.log('[WA-EXT] getGroups: Fetching groups...');
            const chats = this.getChats();
            
            if (!Array.isArray(chats) || chats.length === 0) {
              console.warn('[WA-EXT] getGroups: No chats available');
              return [];
            }
            
            const isGroup = (c) => {
              if (c.isGroup) return true;
              if (c.id && c.id.server === 'g.us') return true;
              if (c.id && c.id._serialized && c.id._serialized.includes('@g.us')) return true;
              if (c.kind === 'group') return true;
              return false;
            };
            
            const groups = chats.filter(c => isGroup(c) && !c.isReadOnly);
            console.log('[WA-EXT] getGroups: Found', groups.length, 'groups from', chats.length, 'chats');
            
            return groups;
          } catch (e) {
            console.error('[WA-EXT] Error getting groups:', e);
            return [];
          }
        },

        getContacts: function() {
          try {
            if (WPP.whatsapp && WPP.whatsapp.ContactStore) {
              return WPP.whatsapp.ContactStore.getModelsArray();
            }
            return [];
          } catch (e) {
            console.error('[WA-EXT] Error getting contacts:', e);
            return [];
          }
        },

        findChatById: async function(chatId) {
          try {
            const chats = this.getChats();
            let chat = chats.find(c => 
              c.id?._serialized === chatId || 
              c.id === chatId ||
              String(c.id) === chatId
            );
            
            if (!chat && WPP.chat) {
              try {
                chat = await WPP.chat.find(chatId);
              } catch (e) {}
            }
            
            return chat || null;
          } catch (e) {
            console.error('[WA-EXT] Error finding chat:', e);
            return null;
          }
        },

        sendMessage: async function(chatId, message) {
          try {
            if (WPP.chat && WPP.chat.sendTextMessage) {
              return await WPP.chat.sendTextMessage(chatId, message);
            }
            throw new Error('Send method not available');
          } catch (e) {
            console.error('[WA-EXT] Error sending message:', e);
            throw e;
          }
        },

        sendMedia: async function(chatId, base64Data, caption, mediaType) {
          try {
            if (WPP.chat && WPP.chat.sendFileMessage) {
              return await WPP.chat.sendFileMessage(chatId, base64Data, {
                caption: caption,
                type: mediaType
              });
            }
            throw new Error('Media send not available');
          } catch (e) {
            console.error('[WA-EXT] Error sending media:', e);
            throw e;
          }
        },

        addParticipant: async function(groupId, phoneNumber) {
          try {
            const formattedNumber = phoneNumber.replace(/\D/g, '') + '@c.us';
            
            if (WPP.group && WPP.group.addParticipants) {
              return await WPP.group.addParticipants(groupId, [formattedNumber]);
            }
            throw new Error('Add participant method not available');
          } catch (e) {
            console.error('[WA-EXT] Error adding participant:', e);
            throw e;
          }
        },

        checkNumber: async function(phoneNumber) {
          try {
            const formattedNumber = phoneNumber.replace(/\D/g, '');
            
            if (WPP.contact && WPP.contact.queryExists) {
              const result = await WPP.contact.queryExists(formattedNumber + '@c.us');
              return !!result;
            }
            
            return true;
          } catch (e) {
            console.error('[WA-EXT] Error checking number:', e);
            return false;
          }
        },

        markAsRead: async function(chatId) {
          try {
            if (WPP.chat && WPP.chat.markIsRead) {
              return await WPP.chat.markIsRead(chatId);
            }
            return false;
          } catch (e) {
            console.error('[WA-EXT] Error marking as read:', e);
            return false;
          }
        },

        setPresence: async function(chatId, state) {
          try {
            if (WPP.chat && WPP.chat.markIsComposing) {
              if (state === 'composing') {
                await WPP.chat.markIsComposing(chatId);
              } else {
                await WPP.chat.markIsPaused(chatId);
              }
              return true;
            }
            return false;
          } catch (e) {
            console.error('[WA-EXT] Error setting presence:', e);
            return false;
          }
        },

        getGroupParticipants: async function(groupId) {
          try {
            if (WPP.group && WPP.group.getParticipants) {
              return await WPP.group.getParticipants(groupId);
            }
            
            const chat = await this.findChatById(groupId);
            if (chat && chat.groupMetadata && chat.groupMetadata.participants) {
              return chat.groupMetadata.participants.getModelsArray ? 
                chat.groupMetadata.participants.getModelsArray() : 
                chat.groupMetadata.participants;
            }
            
            return [];
          } catch (e) {
            console.error('[WA-EXT] Error getting participants:', e);
            return [];
          }
        },

        isParticipant: async function(groupId, phoneNumber) {
          try {
            const participants = await this.getGroupParticipants(groupId);
            const cleanNumber = phoneNumber.replace(/\D/g, '');
            return participants.some(p => {
              const pId = p.id?._serialized || p.id || '';
              return pId.includes(cleanNumber);
            });
          } catch (e) {
            console.error('[WA-EXT] Error checking participant:', e);
            return false;
          }
        },

        isWebpackReady: function() {
          return typeof WPP !== 'undefined' && WPP.webpack && WPP.webpack.isReady;
        }
      };

      console.log('[WA-EXT] WhatsApp API initialized successfully');
      
      // Create DOM bridge element for cross-context communication
      let bridge = document.getElementById('wa-extension-bridge');
      if (!bridge) {
        bridge = document.createElement('div');
        bridge.id = 'wa-extension-bridge';
        bridge.style.display = 'none';
        document.body.appendChild(bridge);
      }
      bridge.setAttribute('data-ready', 'true');
      bridge.removeAttribute('data-error');
      
      // Use postMessage for cross-context communication (custom events don't cross context boundaries)
      window.postMessage({ type: 'WA_EXTENSION_READY', ready: true }, '*');

    } catch (e) {
      console.error('[WA-EXT] Error initializing WhatsApp API:', e);
      window.WA = {
        ready: false,
        error: e.message
      };
      
      // Update DOM bridge with error state
      let bridge = document.getElementById('wa-extension-bridge');
      if (!bridge) {
        bridge = document.createElement('div');
        bridge.id = 'wa-extension-bridge';
        bridge.style.display = 'none';
        document.body.appendChild(bridge);
      }
      bridge.setAttribute('data-ready', 'false');
      bridge.setAttribute('data-error', e.message);
      
      // Send error via postMessage
      window.postMessage({ type: 'WA_EXTENSION_READY', ready: false, error: e.message }, '*');
    }
  }

  if (document.readyState === 'complete') {
    setTimeout(initializeWA, 1000);
  } else {
    window.addEventListener('load', () => setTimeout(initializeWA, 1000));
  }
})();

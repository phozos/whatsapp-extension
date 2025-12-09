(function() {
  if (window.WAInjected) return;
  window.WAInjected = true;

  function findModule(query) {
    if (!window.mR) {
      const webpackGlobal = Object.keys(window).find(key => 
        key.startsWith('webpackChunkwhatsapp_web_client')
      );
      
      if (webpackGlobal) {
        window.mR = {
          modules: {},
          findModule: function(name) {
            return Object.values(this.modules).filter(m => 
              m && m.default && m.default[name]
            );
          }
        };
      }
    }

    try {
      const modules = [];
      const require = window.mR?.m || (window.require && window.require.c) || {};
      
      Object.keys(require).forEach(key => {
        try {
          const mod = require[key];
          if (mod && mod.exports) {
            const exp = mod.exports;
            if (exp[query] || exp.default?.[query]) {
              modules.push(exp[query] || exp.default[query]);
            }
          }
        } catch (e) {}
      });
      
      return modules;
    } catch (e) {
      return [];
    }
  }

  function initializeStore() {
    const maxAttempts = 100;
    let attempts = 0;

    const tryInit = () => {
      attempts++;
      
      try {
        const storeModules = findModule('Chat');
        const store = storeModules[0] || {};

        window.WA = {
          Store: store,
          ready: false,

          getChats: function() {
            try {
              if (this.Store.Chat?.getModelsArray) {
                return this.Store.Chat.getModelsArray();
              }
              return [];
            } catch (e) {
              console.error('Error getting chats:', e);
              return [];
            }
          },

          getGroups: function() {
            try {
              return this.getChats().filter(c => c.isGroup && !c.isReadOnly);
            } catch (e) {
              console.error('Error getting groups:', e);
              return [];
            }
          },

          getContacts: function() {
            try {
              if (this.Store.Contact?.getModelsArray) {
                return this.Store.Contact.getModelsArray();
              }
              return [];
            } catch (e) {
              console.error('Error getting contacts:', e);
              return [];
            }
          },

          findChat: function(query) {
            try {
              const chats = this.getChats();
              return chats.find(c => 
                c.name?.toLowerCase().includes(query.toLowerCase()) || 
                c.id?._serialized?.includes(query.replace(/\D/g, ''))
              );
            } catch (e) {
              console.error('Error finding chat:', e);
              return null;
            }
          },

          findChatById: async function(chatId) {
            try {
              if (this.Store.Chat?.find) {
                return await this.Store.Chat.find(chatId);
              }
              return null;
            } catch (e) {
              console.error('Error finding chat by ID:', e);
              return null;
            }
          },

          sendMessage: async function(chatId, message) {
            try {
              const chat = await this.findChatById(chatId);
              if (!chat) throw new Error('Chat not found');

              if (this.Store.SendTextMsgToChat) {
                return await this.Store.SendTextMsgToChat(chat, message);
              }

              if (chat.sendMessage) {
                return await chat.sendMessage(message);
              }

              throw new Error('Send method not available');
            } catch (e) {
              console.error('Error sending message:', e);
              throw e;
            }
          },

          sendMedia: async function(chatId, base64Data, caption, mediaType) {
            try {
              const chat = await this.findChatById(chatId);
              if (!chat) throw new Error('Chat not found');

              if (this.Store.OpaqueData?.createFromData && this.Store.SendMediaMsgToChat) {
                const media = await this.Store.OpaqueData.createFromData(base64Data, mediaType);
                return await this.Store.SendMediaMsgToChat(chat, media, { caption });
              }

              throw new Error('Media send not available');
            } catch (e) {
              console.error('Error sending media:', e);
              throw e;
            }
          },

          addParticipant: async function(groupId, phoneNumber) {
            try {
              const formattedNumber = phoneNumber.replace(/\D/g, '') + '@c.us';
              
              if (this.Store.GroupParticipants?.addParticipants) {
                return await this.Store.GroupParticipants.addParticipants(groupId, [formattedNumber]);
              }

              if (this.Store.Participants?.addParticipants) {
                return await this.Store.Participants.addParticipants(groupId, [formattedNumber]);
              }

              throw new Error('Add participant method not available');
            } catch (e) {
              console.error('Error adding participant:', e);
              throw e;
            }
          },

          checkNumber: async function(phoneNumber) {
            try {
              const formattedNumber = phoneNumber.replace(/\D/g, '') + '@c.us';
              
              if (this.Store.Contact?.findOrCreate) {
                const contact = await this.Store.Contact.findOrCreate(formattedNumber);
                return contact && contact.id !== undefined;
              }

              if (this.Store.NumberInfo?.checkNumber) {
                const result = await this.Store.NumberInfo.checkNumber(phoneNumber);
                return result && result.status === 200;
              }

              return true;
            } catch (e) {
              console.error('Error checking number:', e);
              return false;
            }
          },

          markAsRead: async function(chatId) {
            try {
              const chat = await this.findChatById(chatId);
              if (!chat) return false;

              if (this.Store.ReadSeen?.sendSeen) {
                return await this.Store.ReadSeen.sendSeen(chat);
              }

              if (chat.sendSeen) {
                return await chat.sendSeen();
              }

              return false;
            } catch (e) {
              console.error('Error marking as read:', e);
              return false;
            }
          },

          setPresence: function(chatId, state) {
            try {
              if (this.Store.ChatStates?.sendChatStateComposing) {
                if (state === 'composing') {
                  this.Store.ChatStates.sendChatStateComposing(chatId);
                } else {
                  this.Store.ChatStates.sendChatStatePaused(chatId);
                }
                return true;
              }
              return false;
            } catch (e) {
              console.error('Error setting presence:', e);
              return false;
            }
          },

          getGroupParticipants: function(group) {
            try {
              if (group.participants?.getModelsArray) {
                return group.participants.getModelsArray();
              }
              if (group.groupMetadata?.participants) {
                return group.groupMetadata.participants;
              }
              return [];
            } catch (e) {
              console.error('Error getting participants:', e);
              return [];
            }
          },

          isParticipant: function(group, phoneNumber) {
            try {
              const participants = this.getGroupParticipants(group);
              const cleanNumber = phoneNumber.replace(/\D/g, '');
              return participants.some(p => 
                p.id?._serialized?.includes(cleanNumber) ||
                p.id?.user?.includes(cleanNumber)
              );
            } catch (e) {
              console.error('Error checking participant:', e);
              return false;
            }
          }
        };

        if (window.WA.getChats().length > 0 || attempts > 50) {
          window.WA.ready = true;
          console.log('WhatsApp API initialized successfully');
          window.dispatchEvent(new CustomEvent('WAReady'));
        } else if (attempts < maxAttempts) {
          setTimeout(tryInit, 500);
        }

      } catch (e) {
        console.error('Error initializing WhatsApp Store:', e);
        if (attempts < maxAttempts) {
          setTimeout(tryInit, 1000);
        }
      }
    };

    tryInit();
  }

  if (document.readyState === 'complete') {
    setTimeout(initializeStore, 2000);
  } else {
    window.addEventListener('load', () => setTimeout(initializeStore, 2000));
  }
})();

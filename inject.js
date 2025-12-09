(function() {
  if (window.WAInjected) return;
  window.WAInjected = true;

  let moduleCache = null;
  let parasite = null;
  const requiredModules = {};

  function interceptWebpackChunk() {
    const chunkKey = 'webpackChunk_nicegram_nicegram_web_frontend';
    const chunkKeyAlt = 'webpackChunkwhatsapp_web_client';
    
    const tryIntercept = (key) => {
      if (window[key]) {
        const chunk = window[key];
        if (Array.isArray(chunk) && chunk.push) {
          const origPush = chunk.push.bind(chunk);
          chunk.push = function(data) {
            try {
              if (data && data[2]) {
                data[2]((r) => { 
                  parasite = r;
                  if (r.c) moduleCache = r.c;
                });
              }
            } catch (e) {}
            return origPush.apply(chunk, arguments);
          };
          
          if (chunk.length > 0) {
            try {
              chunk.push([['waext_init'], {}, (r) => { 
                parasite = r; 
                if (r?.c) moduleCache = r.c;
              }]);
            } catch (e) {}
          }
        }
        return true;
      }
      return false;
    };

    const keys = Object.keys(window).filter(k => 
      k.startsWith('webpackChunk') || k.includes('webpack')
    );
    
    for (const key of keys) {
      tryIntercept(key);
    }
    
    if (!tryIntercept(chunkKey)) {
      tryIntercept(chunkKeyAlt);
    }

    Object.keys(window).forEach(key => {
      try {
        const val = window[key];
        if (val && typeof val === 'function' && val.m && val.c) {
          parasite = val;
          moduleCache = val.c;
        }
      } catch (e) {}
    });
  }

  function searchAllModules(predicate) {
    const results = [];
    const searched = new Set();

    if (moduleCache) {
      for (const id in moduleCache) {
        if (searched.has(id)) continue;
        searched.add(id);
        
        try {
          const mod = moduleCache[id];
          if (!mod?.exports) continue;
          
          const exp = mod.exports;
          if (predicate(exp)) results.push(exp);
          if (exp?.default && predicate(exp.default)) results.push(exp.default);
          
          for (const key in exp) {
            try {
              if (exp[key] && typeof exp[key] === 'object' && predicate(exp[key])) {
                results.push(exp[key]);
              }
            } catch (e) {}
          }
        } catch (e) {}
      }
    }

    if (parasite?.c) {
      for (const id in parasite.c) {
        if (searched.has(id)) continue;
        searched.add(id);
        
        try {
          const mod = parasite.c[id];
          if (!mod?.exports) continue;
          
          const exp = mod.exports;
          if (predicate(exp)) results.push(exp);
          if (exp?.default && predicate(exp.default)) results.push(exp.default);
        } catch (e) {}
      }
    }

    if (results.length === 0) {
      const winKeys = Object.getOwnPropertyNames(window);
      for (const key of winKeys) {
        try {
          const obj = window[key];
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            if (predicate(obj)) results.push(obj);
            if (obj.default && predicate(obj.default)) results.push(obj.default);
          }
        } catch (e) {}
      }
    }

    return results;
  }

  function findModuleByProp(prop, condition) {
    const results = searchAllModules(m => {
      try {
        return m && m[prop] && (!condition || condition(m[prop]));
      } catch (e) { return false; }
    });
    return results[0] || null;
  }

  function findByCondition(condition) {
    const results = searchAllModules(condition);
    return results[0] || null;
  }

  function buildStore() {
    const store = {};

    const chatMod = findByCondition(m => m?.Chat?.getModelsArray);
    if (chatMod) store.Chat = chatMod.Chat;

    const contactMod = findByCondition(m => m?.Contact?.getModelsArray);
    if (contactMod) store.Contact = contactMod.Contact;

    const sendMod = findByCondition(m => typeof m?.SendTextMsgToChat === 'function');
    if (sendMod) store.SendTextMsgToChat = sendMod.SendTextMsgToChat;

    const sendMod2 = findByCondition(m => typeof m?.sendTextMsgToChat === 'function');
    if (sendMod2) store.SendTextMsgToChat = store.SendTextMsgToChat || sendMod2.sendTextMsgToChat;

    const mediaMod = findByCondition(m => m?.OpaqueData?.createFromData);
    if (mediaMod) store.OpaqueData = mediaMod.OpaqueData;

    const sendMediaMod = findByCondition(m => typeof m?.SendMediaMsgToChat === 'function');
    if (sendMediaMod) store.SendMediaMsgToChat = sendMediaMod.SendMediaMsgToChat;

    const groupMod = findByCondition(m => m?.GroupParticipants?.addParticipants);
    if (groupMod) store.GroupParticipants = groupMod.GroupParticipants;

    const partMod = findByCondition(m => m?.Participants?.addParticipants);
    if (partMod) store.Participants = partMod.Participants;

    const numMod = findByCondition(m => m?.NumberInfo?.checkNumber);
    if (numMod) store.NumberInfo = numMod.NumberInfo;

    const chatStatesMod = findByCondition(m => typeof m?.sendChatStateComposing === 'function');
    if (chatStatesMod) store.ChatStates = chatStatesMod;

    const chatStatesMod2 = findByCondition(m => m?.ChatStates?.sendChatStateComposing);
    if (chatStatesMod2) store.ChatStates = store.ChatStates || chatStatesMod2.ChatStates;

    const readMod = findByCondition(m => m?.ReadSeen?.sendSeen);
    if (readMod) store.ReadSeen = readMod.ReadSeen;

    return store;
  }

  function initializeStore() {
    const maxAttempts = 200;
    let attempts = 0;

    const tryInit = () => {
      attempts++;
      interceptWebpackChunk();
      
      try {
        const store = buildStore();
        const hasChat = !!store.Chat?.getModelsArray;
        const hasContact = !!store.Contact?.getModelsArray;
        
        window.WA = {
          Store: store,
          ready: false,
          moduleStatus: {
            Chat: hasChat,
            Contact: hasContact,
            SendTextMsgToChat: !!store.SendTextMsgToChat,
            GroupParticipants: !!(store.GroupParticipants || store.Participants),
            ChatStates: !!store.ChatStates,
            ReadSeen: !!store.ReadSeen
          },

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
              const chats = this.getChats();
              return chats.find(c => c.id?._serialized === chatId || c.id === chatId);
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

        const chatsLoaded = window.WA.getChats().length > 0;
        
        if (hasChat && chatsLoaded) {
          window.WA.ready = true;
          console.log('WhatsApp API initialized with modules:', window.WA.moduleStatus);
          window.dispatchEvent(new CustomEvent('WAReady'));
        } else if (hasChat && attempts > 60) {
          window.WA.ready = true;
          console.log('WhatsApp API ready (modules found):', window.WA.moduleStatus);
          window.dispatchEvent(new CustomEvent('WAReady'));
        } else if (attempts < maxAttempts) {
          setTimeout(tryInit, attempts < 50 ? 500 : 1000);
        } else {
          console.warn('WhatsApp API: Module discovery incomplete. Status:', window.WA.moduleStatus);
          window.WA.ready = false;
          window.WA.error = 'Some modules not found';
          window.dispatchEvent(new CustomEvent('WAError', { detail: window.WA.moduleStatus }));
        }

      } catch (e) {
        console.error('Error initializing WhatsApp Store:', e);
        if (attempts < maxAttempts) {
          setTimeout(tryInit, 1000);
        }
      }
    };

    setTimeout(tryInit, 1000);
  }

  if (document.readyState === 'complete') {
    initializeStore();
  } else {
    window.addEventListener('load', initializeStore);
  }
})();

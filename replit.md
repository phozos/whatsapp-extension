# WhatsApp Pro Automation

## Overview
A Chrome extension for bulk adding members to WhatsApp groups and sending personalized messages with templates.

## Project Type
Chrome Extension (Manifest V3)

## Structure
- `manifest.json` - Extension configuration
- `popup.html/js` - Extension popup UI
- `content.js` - Content script injected into WhatsApp Web
- `background.js` - Background service worker
- `whatsapp-api.js` - WhatsApp API wrapper
- `inject.js` - Script injected into page context
- `storage.js` - Storage utilities
- `utils.js` - Helper functions
- `icons/` - Extension icons
- `server.py` - Simple landing page server for Replit

## Development
This is a Chrome extension - it doesn't run on a traditional server. The server.py provides a landing page with installation instructions.

### To Install the Extension
1. Download/clone this project
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode"
4. Click "Load unpacked" and select this folder
5. The extension will appear in your toolbar

### Connection Status
The extension shows "Disconnected" when:
- Not on web.whatsapp.com
- WhatsApp Web is showing QR code (not logged in)
- Page is still loading
- Content script hasn't been injected (refresh the page)

## Recent Changes
- Dec 2024: Fixed groups not loading issue by integrating WPPConnect WA-JS library
  - Replaced outdated webpack interception with bundled WA-JS library (v3.19.4)
  - Extension now works with WhatsApp Web 2.3000+ (post-webpack versions)
  - Added wppconnect-wa.js as bundled dependency
- Initial Replit setup with landing page server

## Dependencies
- wppconnect-wa.js: Bundled WPPConnect WA-JS library for WhatsApp Web module access
  - Update periodically from: https://github.com/wppconnect-team/wa-js/releases

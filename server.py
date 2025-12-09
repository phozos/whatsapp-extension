import http.server
import socketserver
import os

PORT = 5000
HOST = "0.0.0.0"

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()
            
            html = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>WhatsApp Pro Automation - Chrome Extension</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #25D366 0%, #128C7E 100%);
            min-height: 100vh;
            padding: 40px 20px;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            border-radius: 16px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            padding: 40px;
        }
        h1 {
            color: #128C7E;
            font-size: 2rem;
            margin-bottom: 10px;
        }
        .version {
            color: #666;
            margin-bottom: 30px;
        }
        .description {
            font-size: 1.1rem;
            color: #333;
            margin-bottom: 30px;
            line-height: 1.6;
        }
        h2 {
            color: #333;
            margin: 30px 0 15px;
            font-size: 1.3rem;
        }
        ol, ul {
            margin-left: 25px;
            line-height: 1.8;
            color: #444;
        }
        li { margin: 8px 0; }
        code {
            background: #f4f4f4;
            padding: 2px 8px;
            border-radius: 4px;
            font-family: monospace;
        }
        .warning {
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 8px;
            padding: 15px;
            margin: 20px 0;
        }
        .files {
            background: #f8f9fa;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
        }
        .files a {
            color: #128C7E;
            text-decoration: none;
        }
        .files a:hover { text-decoration: underline; }
        .feature {
            display: inline-block;
            background: #e8f5e9;
            color: #2e7d32;
            padding: 5px 12px;
            border-radius: 20px;
            margin: 5px;
            font-size: 0.9rem;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>WhatsApp Pro Automation</h1>
        <p class="version">Version 2.0.0 - Chrome Extension</p>
        
        <p class="description">
            A powerful Chrome extension for bulk adding members to WhatsApp groups 
            and sending personalized messages with templates.
        </p>
        
        <div>
            <span class="feature">Bulk Add Members</span>
            <span class="feature">Message Templates</span>
            <span class="feature">Batch Processing</span>
            <span class="feature">Random Delays</span>
        </div>
        
        <h2>Installation Instructions</h2>
        <ol>
            <li>Download or clone this project to your local machine</li>
            <li>Open Chrome and go to <code>chrome://extensions/</code></li>
            <li>Enable <strong>"Developer mode"</strong> (toggle in top-right)</li>
            <li>Click <strong>"Load unpacked"</strong></li>
            <li>Select the folder containing these extension files</li>
            <li>The extension icon will appear in your toolbar</li>
        </ol>
        
        <h2>How to Use</h2>
        <ol>
            <li>Open <a href="https://web.whatsapp.com" target="_blank">web.whatsapp.com</a> and log in</li>
            <li>Click the extension icon in your browser toolbar</li>
            <li>Select a group to add members to</li>
            <li>Enter phone numbers (one per line)</li>
            <li>Configure delay and batch settings</li>
            <li>Click "Start Adding" to begin</li>
        </ol>
        
        <div class="warning">
            <strong>Note:</strong> This extension requires you to be logged into WhatsApp Web. 
            If you see "Disconnected" status, make sure you're on the WhatsApp Web page and logged in.
        </div>
        
        <h2>Extension Files</h2>
        <div class="files">
            <ul>
                <li><a href="/manifest.json">manifest.json</a> - Extension configuration</li>
                <li><a href="/popup.html">popup.html</a> - Extension popup UI</li>
                <li><a href="/popup.js">popup.js</a> - Popup logic</li>
                <li><a href="/content.js">content.js</a> - Content script</li>
                <li><a href="/background.js">background.js</a> - Background service worker</li>
                <li><a href="/whatsapp-api.js">whatsapp-api.js</a> - WhatsApp API integration</li>
            </ul>
        </div>
    </div>
</body>
</html>'''
            self.wfile.write(html.encode())
        else:
            super().do_GET()

with socketserver.TCPServer((HOST, PORT), CustomHandler) as httpd:
    print(f"Serving WhatsApp Pro Automation extension at http://{HOST}:{PORT}")
    httpd.serve_forever()

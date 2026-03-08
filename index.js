// ============================================
// ULTRAMSG WEBHOOK VERSION - Quick Alternative
// Instance: instance164538
// Token: hx9i1oh5xas09loe
// ============================================

require('dotenv').config();

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { getAIResponse } = require('./modules/ai/ai');
const { handleIslamicCommand, initializeIslamicModule, islamicIsEnabled } = require('./modules/islamic/islamicModule');

// UltraMsg Configuration
const ULTRAMSG_INSTANCE = 'instance164538';
const ULTRAMSG_TOKEN = 'hx9i1oh5xas09loe';
const ULTRAMSG_API = `https://api.ultramsg.com/${ULTRAMSG_INSTANCE}`;

const CONFIG = {
    botName: process.env.BOT_NAME || 'Botly',
    botOwner: process.env.BOT_OWNER || 'مقداد',
    port: process.env.PORT || 8080,
    ownerNumber: process.env.OWNER_NUMBER || '249962204268',
    adminNumber: '249962204268'
};

// State files
const AI_STATE_FILE = path.join(__dirname, 'ai_state.json');
const BAN_LIST_FILE = path.join(__dirname, 'ban_list.json');

function loadAIState() {
    try {
        if (fs.existsSync(AI_STATE_FILE)) {
            return JSON.parse(fs.readFileSync(AI_STATE_FILE, 'utf-8')).enabled || false;
        }
    } catch (error) {}
    return false;
}

function saveAIState(enabled) {
    try {
        fs.writeFileSync(AI_STATE_FILE, JSON.stringify({ enabled }), 'utf-8');
    } catch (error) {}
}

function loadBanList() {
    try {
        if (fs.existsSync(BAN_LIST_FILE)) {
            return JSON.parse(fs.readFileSync(BAN_LIST_FILE, 'utf-8'));
        }
    } catch (error) {}
    return [];
}

function saveBanList(list) {
    try {
        fs.writeFileSync(BAN_LIST_FILE, JSON.stringify(list), 'utf-8');
    } catch (error) {}
}

let AI_ENABLED = loadAIState();
let BANNED_USERS = loadBanList();

// Message deduplication
const processedMessages = new Set();
const userMemory = new Map();
const MAX_MEMORY_SIZE = 10;

function addToUserMemory(userId, message) {
    if (!userMemory.has(userId)) {
        userMemory.set(userId, []);
    }
    const memory = userMemory.get(userId);
    memory.push(message);
    if (memory.length > MAX_MEMORY_SIZE) {
        memory.shift();
    }
}

function getUserMemory(userId) {
    return userMemory.get(userId) || [];
}

// ============================================
// ULTRAMSG API FUNCTIONS
// ============================================

function sendMessage(to, text) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({
            token: ULTRAMSG_TOKEN,
            to: to,
            body: text
        });
        
        const options = {
            hostname: 'api.ultramsg.com',
            path: `/${ULTRAMSG_INSTANCE}/messages/chat`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };
        
        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', (chunk) => body += chunk);
            res.on('end', () => {
                if (res.statusCode === 200) {
                    resolve(JSON.parse(body));
                } else {
                    reject(new Error(`Status ${res.statusCode}: ${body}`));
                }
            });
        });
        
        req.on('error', reject);
        req.write(data);
        req.end();
    });
}

// Create sock wrapper for Islamic module
const sockWrapper = {
    sendMessage: async (jid, content) => {
        // Convert WhatsApp format to phone number
        const phone = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
        if (content.text) {
            await sendMessage(phone, content.text);
        }
    },
    user: {
        id: CONFIG.ownerNumber
    }
};

// ============================================
// WEBHOOK HANDLER
// ============================================

const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }
    
    // Webhook endpoint
    if (req.url === '/webhook' && req.method === 'POST') {
        let body = '';
        
        req.on('data', chunk => {
            body += chunk.toString();
        });
        
        req.on('end', async () => {
            try {
                const webhook = JSON.parse(body);
                console.log('\n📨 Webhook received:', JSON.stringify(webhook, null, 2));
                
                // Extract message data
                const data = webhook.data;
                if (!data) {
                    res.writeHead(200);
                    res.end('OK');
                    return;
                }
                
                const from = data.from;
                const body_text = data.body;
                const messageId = data.id;
                
                // Skip if no text
                if (!body_text || !from) {
                    res.writeHead(200);
                    res.end('OK');
                    return;
                }
                
                // Deduplication
                if (processedMessages.has(messageId)) {
                    res.writeHead(200);
                    res.end('OK');
                    return;
                }
                processedMessages.add(messageId);
                setTimeout(() => processedMessages.delete(messageId), 60000);
                
                console.log(`📩 Message from: ${from}`);
                console.log(`📝 Text: ${body_text}`);
                
                // Check if banned
                if (BANNED_USERS.includes(from)) {
                    console.log(`🚫 Banned user: ${from}`);
                    res.writeHead(200);
                    res.end('OK');
                    return;
                }
                
                const isOwner = from === CONFIG.ownerNumber || from === CONFIG.adminNumber;
                
                // Admin commands
                if (isOwner && body_text.trim() === '/تشغيل') {
                    AI_ENABLED = true;
                    saveAIState(true);
                    await sendMessage(from, '✅ تم تشغيل AI');
                    res.writeHead(200);
                    res.end('OK');
                    return;
                }
                
                if (isOwner && body_text.trim() === '/توقف') {
                    AI_ENABLED = false;
                    saveAIState(false);
                    await sendMessage(from, '🛑 تم إيقاف AI');
                    res.writeHead(200);
                    res.end('OK');
                    return;
                }
                
                if (isOwner && body_text.trim() === '/ban') {
                    if (!BANNED_USERS.includes(from)) {
                        BANNED_USERS.push(from);
                        saveBanList(BANNED_USERS);
                    }
                    await sendMessage(from, '✅ تم الحظر');
                    res.writeHead(200);
                    res.end('OK');
                    return;
                }
                
                if (isOwner && body_text.trim() === '/unban') {
                    BANNED_USERS = BANNED_USERS.filter(u => u !== from);
                    saveBanList(BANNED_USERS);
                    await sendMessage(from, '✅ تم إلغاء الحظر');
                    res.writeHead(200);
                    res.end('OK');
                    return;
                }
                
                // Islamic module commands
                if (islamicIsEnabled() && isOwner) {
                    const islamicCommands = ['/اسلام', '/islam', '/ادارة', '/admin'];
                    if (islamicCommands.includes(body_text.trim()) || /^\d+$/.test(body_text.trim())) {
                        const msgWrapper = {
                            key: {
                                remoteJid: from + '@s.whatsapp.net',
                                fromMe: false
                            }
                        };
                        
                        const handled = await handleIslamicCommand(sockWrapper, msgWrapper, body_text, from + '@s.whatsapp.net');
                        if (handled) {
                            res.writeHead(200);
                            res.end('OK');
                            return;
                        }
                    }
                }
                
                // AI Response
                if (AI_ENABLED) {
                    console.log('🤖 Processing with AI...');
                    
                    try {
                        const memory = getUserMemory(from);
                        const aiResponse = await getAIResponse(body_text, CONFIG.botName, CONFIG.botOwner, memory);
                        
                        await sendMessage(from, aiResponse);
                        
                        addToUserMemory(from, { role: 'user', content: body_text });
                        addToUserMemory(from, { role: 'assistant', content: aiResponse });
                        
                        console.log('✅ AI response sent');
                    } catch (error) {
                        console.error('❌ AI error:', error.message);
                    }
                }
                
                res.writeHead(200);
                res.end('OK');
                
            } catch (error) {
                console.error('❌ Webhook error:', error);
                res.writeHead(500);
                res.end('Error');
            }
        });
        
        return;
    }
    
    // Status page
    if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${CONFIG.botName} - UltraMsg</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 600px;
        }
        h1 { color: #667eea; }
        .badge {
            background: #10b981;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            display: inline-block;
            margin: 20px 0;
        }
        .info {
            background: #f3f4f6;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            text-align: right;
            direction: rtl;
        }
        .info-item {
            margin: 10px 0;
            padding: 10px;
            background: white;
            border-radius: 8px;
        }
        .code {
            background: #1f2937;
            color: #10b981;
            padding: 15px;
            border-radius: 8px;
            font-family: monospace;
            text-align: left;
            margin: 20px 0;
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 ${CONFIG.botName}</h1>
        <div class="badge">UltraMsg Webhook Version</div>
        
        <div class="info">
            <div class="info-item"><strong>📱 البوت:</strong> ${CONFIG.botName}</div>
            <div class="info-item"><strong>👤 المالك:</strong> ${CONFIG.botOwner}</div>
            <div class="info-item"><strong>🤖 AI:</strong> ${AI_ENABLED ? '✅ مفعّل' : '❌ معطّل'}</div>
            <div class="info-item"><strong>📿 القسم الإسلامي:</strong> ${islamicIsEnabled() ? '✅ مفعّل' : '❌ معطّل'}</div>
        </div>
        
        <h3>⚙️ Webhook Setup</h3>
        <div class="code">
Webhook URL: https://your-app-url.com/webhook<br>
Instance: ${ULTRAMSG_INSTANCE}<br>
Status: ✅ Ready
        </div>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Configure this webhook URL in your UltraMsg dashboard
        </p>
    </div>
</body>
</html>
        `);
        return;
    }
    
    // Health check
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            instance: ULTRAMSG_INSTANCE,
            aiEnabled: AI_ENABLED,
            islamicEnabled: islamicIsEnabled()
        }));
        return;
    }
    
    res.writeHead(404);
    res.end('Not Found');
});

// ============================================
// START SERVER
// ============================================

server.listen(CONFIG.port, async () => {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║     📱 UltraMsg Webhook Bot Started!        ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    
    console.log(`🌐 Server: http://localhost:${CONFIG.port}`);
    console.log(`📱 Instance: ${ULTRAMSG_INSTANCE}`);
    console.log(`🔑 Token: ${ULTRAMSG_TOKEN.substring(0, 8)}...`);
    console.log(`🤖 AI: ${AI_ENABLED ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`📿 Islamic: ${islamicIsEnabled() ? '✅ Enabled' : '❌ Disabled'}\n`);
    
    console.log('⚙️ Configuration Steps:');
    console.log('   1. Go to UltraMsg Dashboard');
    console.log('   2. Settings > Webhooks');
    console.log('   3. Set webhook URL to: https://your-clever-cloud-url.com/webhook');
    console.log('   4. Enable "Messages" events\n');
    
    // Initialize Islamic module if enabled
    if (islamicIsEnabled()) {
        console.log('🔄 Initializing Islamic module...');
        try {
            await initializeIslamicModule(sockWrapper);
            console.log('✅ Islamic module ready\n');
        } catch (e) {
            console.error('❌ Islamic module error:', e.message, '\n');
        }
    }
    
    console.log('✅ Bot ready! Waiting for webhooks...\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down...');
    process.exit(0);
});

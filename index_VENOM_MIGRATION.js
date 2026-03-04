// ============================================
// VENOM-BOT with Baileys Session Migration
// Best of Both Worlds!
// ============================================

// Load .env
const isCloudEnvironment = !!(process.env.CC_DEPLOYMENT_ID || process.env.CLEVER_CLOUD || process.env.PORT);

if (!isCloudEnvironment && !process.env.ISLAMIC_GROUP_ID) {
    console.log('📂 Loading .env file (local development)');
    require('dotenv').config();
} else {
    console.log('☁️ Using cloud environment variables');
}

console.log(`🔑 ISLAMIC_GROUP_ID: ${process.env.ISLAMIC_GROUP_ID ? '✅ موجود' : '❌ غير موجود'}`);
console.log(`🔑 GOOGLE_SHEET_ID: ${process.env.GOOGLE_SHEET_ID ? '✅ موجود' : '❌ غير موجود'}`);

// ============================================
// IMPORTS
// ============================================
const venom = require('venom-bot');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { getAIResponse } = require('./modules/ai/ai');
const { handleIslamicCommand, initializeIslamicModule, islamicIsEnabled } = require('./modules/islamic/islamicModule');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================
// SESSION MIGRATION HELPER
// ============================================

async function migrateBaileysToVenom() {
    const baileysPath = path.join(__dirname, 'auth_info');
    const venomPath = path.join(__dirname, 'tokens', 'botly-session');
    
    console.log('\n🔍 Checking for Baileys session...');
    
    // Check if Baileys session exists
    if (fs.existsSync(baileysPath)) {
        const credsPath = path.join(baileysPath, 'creds.json');
        
        if (fs.existsSync(credsPath)) {
            console.log('✅ Found Baileys session in auth_info/');
            
            // Check if already migrated
            if (!fs.existsSync(venomPath)) {
                console.log('🔄 Migrating Baileys session to Venom format...');
                
                try {
                    // Create tokens directory
                    const tokensDir = path.join(__dirname, 'tokens');
                    if (!fs.existsSync(tokensDir)) {
                        fs.mkdirSync(tokensDir, { recursive: true });
                    }
                    
                    // Create session directory
                    if (!fs.existsSync(venomPath)) {
                        fs.mkdirSync(venomPath, { recursive: true });
                    }
                    
                    // Copy all files from Baileys to Venom
                    const files = fs.readdirSync(baileysPath);
                    for (const file of files) {
                        const srcPath = path.join(baileysPath, file);
                        const destPath = path.join(venomPath, file);
                        
                        if (fs.statSync(srcPath).isFile()) {
                            fs.copyFileSync(srcPath, destPath);
                        }
                    }
                    
                    console.log(`✅ Migrated ${files.length} files to Venom!`);
                    console.log('📁 Session location: ./tokens/botly-session/\n');
                    
                    return true;
                } catch (e) {
                    console.error('❌ Migration failed:', e.message);
                    return false;
                }
            } else {
                console.log('✅ Venom session already exists');
                return true;
            }
        }
    }
    
    console.log('⚠️ No Baileys session found');
    console.log('💡 Venom will create new session with QR code\n');
    return false;
}

// Message Deduplication
const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;

const CONFIG = {
    botName: process.env.BOT_NAME || 'Botly',
    botOwner: process.env.BOT_OWNER || 'مقداد',
    prefix: process.env.PREFIX || '!',
    port: process.env.PORT || 8080,
    replyInGroups: false,
    ownerNumber: process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER + '@c.us' : null,
    showIgnoredMessages: process.env.SHOW_IGNORED_MESSAGES === 'true',
    adminNumber: '249962204268@c.us',
    allowedGroups: process.env.ALLOWED_GROUPS ? process.env.ALLOWED_GROUPS.split(',').map(g => g.trim()) : [],
    blockedContacts: process.env.BLOCKED_CONTACTS ? process.env.BLOCKED_CONTACTS.split(',').map(c => c.trim()) : []
};

// State files
const AI_STATE_FILE = path.join(__dirname, 'ai_state.json');
const BAN_LIST_FILE = path.join(__dirname, 'ban_list.json');
const ALLOWED_GROUPS_FILE = path.join(__dirname, 'allowed_groups.json');

// Helper functions
function loadAIState() {
    try {
        if (fs.existsSync(AI_STATE_FILE)) {
            const data = fs.readFileSync(AI_STATE_FILE, 'utf-8');
            return JSON.parse(data).enabled || false;
        }
    } catch (error) {
        console.log('⚠️ خطأ في قراءة حالة AI');
    }
    return false;
}

function saveAIState(enabled) {
    try {
        fs.writeFileSync(AI_STATE_FILE, JSON.stringify({ enabled }), 'utf-8');
    } catch (error) {
        console.error('❌ خطأ في حفظ حالة AI:', error.message);
    }
}

function loadBanList() {
    try {
        if (fs.existsSync(BAN_LIST_FILE)) {
            return JSON.parse(fs.readFileSync(BAN_LIST_FILE, 'utf-8'));
        }
    } catch (error) {
        console.log('⚠️ خطأ في قراءة قائمة الحظر');
    }
    return [];
}

function saveBanList(list) {
    try {
        fs.writeFileSync(BAN_LIST_FILE, JSON.stringify(list), 'utf-8');
    } catch (error) {
        console.error('❌ خطأ في حفظ قائمة الحظر:', error.message);
    }
}

function loadAllowedGroupsList() {
    try {
        if (fs.existsSync(ALLOWED_GROUPS_FILE)) {
            return JSON.parse(fs.readFileSync(ALLOWED_GROUPS_FILE, 'utf-8'));
        }
    } catch (error) {
        console.log('⚠️ خطأ في قراءة قائمة المجموعات');
    }
    return [];
}

function saveAllowedGroupsList(list) {
    try {
        fs.writeFileSync(ALLOWED_GROUPS_FILE, JSON.stringify(list), 'utf-8');
    } catch (error) {
        console.error('❌ خطأ في حفظ قائمة المجموعات:', error.message);
    }
}

let AI_ENABLED = loadAIState();
let BANNED_USERS = loadBanList();
let ALLOWED_GROUPS = loadAllowedGroupsList().length > 0 ? loadAllowedGroupsList() : CONFIG.allowedGroups;

// User memory for AI
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

function cleanProcessedMessages() {
    if (processedMessages.size > MAX_PROCESSED_CACHE) {
        const toDelete = processedMessages.size - MAX_PROCESSED_CACHE;
        const iterator = processedMessages.values();
        for (let i = 0; i < toDelete; i++) {
            processedMessages.delete(iterator.next().value);
        }
    }
}

// ============================================
// VENOM-BOT INITIALIZATION
// ============================================

let globalClient = null;
let botStartTime = Date.now();
let reconnectionTimer = null;

async function startVenomBot() {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║   🦎 VENOM-BOT with Baileys Migration       ║');
    console.log('║        Maximum Stability & Compatibility!      ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    
    // Migrate Baileys session if exists
    await migrateBaileysToVenom();
    
    try {
        const client = await venom.create({
            session: 'botly-session',
            multidevice: true,
            headless: 'new',
            devtools: false,
            useChrome: true,
            debug: false,
            logQR: false,
            
            browserArgs: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            
            autoClose: 60000, // 60s for QR
            disableWelcome: true,
            
            statusFind: (statusSession, session) => {
                console.log(`📊 Status: ${statusSession}`);
                console.log(`   Session: ${session}`);
                
                if (statusSession === 'qrReadSuccess') {
                    console.log('✅ QR Code scanned successfully!');
                }
            },
            
            folderNameToken: './tokens',
            mkdirFolderToken: '',
            createPathFileToken: true
        });
        
        globalClient = client;
        
        console.log('\n✅ ════════════════════════════════════');
        console.log(`   متصل بواتساب بنجاح! 🎉`);
        console.log(`   البوت: ${CONFIG.botName}`);
        console.log(`   المالك: ${CONFIG.botOwner}`);
        console.log(`   AI: ${AI_ENABLED ? '✅' : '❌'}`);
        console.log(`   القسم الإسلامي: ${islamicIsEnabled() ? '✅' : '❌'}`);
        console.log('════════════════════════════════════\n');
        
        botStartTime = Date.now();
        
        // Initialize Islamic module
        if (islamicIsEnabled()) {
            console.log('🔄 تهيئة القسم الإسلامي...');
            try {
                const sockWrapper = {
                    sendMessage: async (jid, content) => {
                        const chatId = jid.replace('@s.whatsapp.net', '@c.us').replace('@g.us', '@g.us');
                        if (content.text) {
                            await client.sendText(chatId, content.text);
                        }
                    },
                    user: {
                        id: (await client.getHostDevice()).id.user
                    }
                };
                
                await initializeIslamicModule(sockWrapper);
                console.log('✅ القسم الإسلامي جاهز للعمل\n');
            } catch (e) {
                console.error('❌ فشل تهيئة القسم الإسلامي:', e.message);
            }
        }
        
        // MESSAGE HANDLER
        const handlerId = Date.now();
        console.log(`📡 Attaching message handler [ID: ${handlerId}]\n`);
        
        client.onMessage(async (message) => {
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`📨 MESSAGE RECEIVED [Handler: ${handlerId}]`);
            console.log(`   From: ${message.from}`);
            console.log(`   Body: ${message.body?.substring(0, 50) || 'N/A'}`);
            console.log(`   Time: ${new Date().toLocaleString('ar-EG', {timeZone: 'Africa/Cairo'})}`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
            
            try {
                if (!message.body) {
                    console.log('⏭️ No message body\n');
                    return;
                }
                
                if (processedMessages.has(message.id)) return;
                processedMessages.add(message.id);
                cleanProcessedMessages();
                
                const text = message.body;
                const sender = message.from;
                const isGroup = message.isGroupMsg;
                const chatId = message.chatId;
                
                if (BANNED_USERS.includes(sender)) {
                    console.log(`🚫 محظور: ${sender}`);
                    return;
                }
                
                const isOwner = message.fromMe || 
                               sender === CONFIG.ownerNumber || 
                               sender === CONFIG.adminNumber;
                
                // Admin commands
                const adminCommands = ['/تشغيل', '/توقف', '/ban', '/unban', '/id'];
                if (isOwner && adminCommands.includes(text.trim())) {
                    console.log(`📩 Admin command: ${text}`);
                    
                    if (text.trim() === '/id') {
                        await client.sendText(chatId, `📋 معلومات:\n\nChat ID:\n${chatId}\n\n${isGroup ? '👥 مجموعة' : '👤 خاص'}`);
                        return;
                    }
                    
                    if (text.trim() === '/تشغيل') {
                        AI_ENABLED = true;
                        saveAIState(true);
                        await client.sendText(chatId, '✅ تم تشغيل AI');
                        return;
                    }
                    
                    if (text.trim() === '/توقف') {
                        AI_ENABLED = false;
                        saveAIState(false);
                        await client.sendText(chatId, '🛑 تم إيقاف AI');
                        return;
                    }
                    
                    if (text.trim() === '/ban') {
                        if (!BANNED_USERS.includes(sender)) {
                            BANNED_USERS.push(sender);
                            saveBanList(BANNED_USERS);
                        }
                        await client.sendText(chatId, '✅ تم الحظر');
                        return;
                    }
                    
                    if (text.trim() === '/unban') {
                        BANNED_USERS = BANNED_USERS.filter(u => u !== sender);
                        saveBanList(BANNED_USERS);
                        await client.sendText(chatId, '✅ تم إلغاء الحظر');
                        return;
                    }
                }
                
                // Islamic module
                if (islamicIsEnabled()) {
                    const islamicCommands = ['/اسلام', '/islam', '/ادارة', '/admin'];
                    if (isOwner && islamicCommands.includes(text.trim())) {
                        const msgWrapper = {
                            key: { remoteJid: chatId, fromMe: message.fromMe }
                        };
                        
                        const sockWrapper = {
                            sendMessage: async (jid, content) => {
                                if (content.text) {
                                    await client.sendText(jid, content.text);
                                }
                            },
                            user: { id: (await client.getHostDevice()).id.user }
                        };
                        
                        const handled = await handleIslamicCommand(sockWrapper, msgWrapper, text, sender);
                        if (handled) return;
                    }
                    
                    if (isOwner && /^\d+$/.test(text.trim())) {
                        const msgWrapper = {
                            key: { remoteJid: chatId, fromMe: message.fromMe }
                        };
                        
                        const sockWrapper = {
                            sendMessage: async (jid, content) => {
                                if (content.text) {
                                    await client.sendText(jid, content.text);
                                }
                            }
                        };
                        
                        const handled = await handleIslamicCommand(sockWrapper, msgWrapper, text, sender);
                        if (handled) return;
                    }
                }
                
                // Ignore non-allowed groups
                if (isGroup && !CONFIG.replyInGroups && !ALLOWED_GROUPS.includes(chatId)) {
                    if (CONFIG.showIgnoredMessages) {
                        console.log(`⏭️ مجموعة غير مسموحة: ${chatId}`);
                    }
                    return;
                }
                
                // AI Response
                if (AI_ENABLED && !message.fromMe) {
                    console.log(`AI Response for: ${sender}`);
                    
                    try {
                        const memory = getUserMemory(sender);
                        const aiResponse = await getAIResponse(text, CONFIG.botName, CONFIG.botOwner, memory);
                        
                        await client.sendText(chatId, aiResponse);
                        
                        addToUserMemory(sender, { role: 'user', content: text });
                        addToUserMemory(sender, { role: 'assistant', content: aiResponse });
                        
                        console.log(`✅ AI response sent\n`);
                    } catch (error) {
                        console.error(`❌ AI error: ${error.message}\n`);
                    }
                }
                
            } catch (error) {
                console.error('❌ Message handler error:', error);
            }
        });
        
        // STATE CHANGE HANDLER
        client.onStateChange((state) => {
            console.log(`\n📊 State: ${state} - ${new Date().toLocaleString('ar-EG', {timeZone: 'Africa/Cairo'})}\n`);
            
            if (state === 'CONFLICT' || state === 'UNPAIRED') {
                console.log('⚠️ Session conflict - restarting in 5s...');
                setTimeout(() => process.exit(1), 5000);
            } else if (state === 'CONNECTED') {
                console.log('✅ Connected!');
                if (reconnectionTimer) {
                    clearTimeout(reconnectionTimer);
                    reconnectionTimer = null;
                }
            }
        });
        
        // STREAM CHANGE HANDLER with Safety Net
        client.onStreamChange((state) => {
            console.log(`\n📡 Stream: ${state} - ${new Date().toLocaleString('ar-EG', {timeZone: 'Africa/Cairo'})}\n`);
            
            if (state === 'DISCONNECTED') {
                console.log('⚠️ Disconnected - Venom will auto-reconnect');
                console.log('⏱️ Safety net: 90s timeout...\n');
                
                if (reconnectionTimer) clearTimeout(reconnectionTimer);
                
                reconnectionTimer = setTimeout(async () => {
                    console.log('⏰ 90s passed - checking connection...');
                    
                    try {
                        const status = await client.getConnectionState();
                        if (status !== 'CONNECTED') {
                            console.log('❌ Still disconnected - forcing restart');
                            console.log('🔄 Restarting in 3s...\n');
                            await delay(3000);
                            process.exit(0);
                        }
                    } catch (e) {
                        console.log('❌ Cannot check status - forcing restart\n');
                        await delay(3000);
                        process.exit(0);
                    }
                }, 90000);
                
            } else if (state === 'CONNECTED') {
                console.log('✅ Stream connected!');
                if (reconnectionTimer) {
                    clearTimeout(reconnectionTimer);
                    reconnectionTimer = null;
                    console.log('✅ Timer cleared\n');
                }
            }
        });
        
        console.log('✅ البوت جاهز ومتصل!\n');
        
    } catch (error) {
        console.error('❌ Venom-Bot error:', error);
        console.log('⏳ Retry in 30s...');
        await delay(30000);
        return startVenomBot();
    }
}

// ============================================
// HTTP SERVER
// ============================================

const server = http.createServer(async (req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${CONFIG.botName} - Venom Bot</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        h1 { color: #667eea; margin-bottom: 10px; }
        .badge {
            display: inline-block;
            background: #10b981;
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: bold;
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
        .status {
            font-size: 18px;
            color: #10b981;
            font-weight: bold;
            margin: 20px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🦎 ${CONFIG.botName}</h1>
        <div class="badge">Venom-Bot + Baileys Migration</div>
        
        <div class="status">✅ البوت متصل ويعمل</div>
        
        <div class="info">
            <div class="info-item"><strong>📱 البوت:</strong> ${CONFIG.botName}</div>
            <div class="info-item"><strong>👤 المالك:</strong> ${CONFIG.botOwner}</div>
            <div class="info-item"><strong>🤖 AI:</strong> ${AI_ENABLED ? '✅ مفعّل' : '❌ معطّل'}</div>
            <div class="info-item"><strong>📿 القسم الإسلامي:</strong> ${islamicIsEnabled() ? '✅ مفعّل' : '❌ معطّل'}</div>
            <div class="info-item"><strong>⏱️ وقت التشغيل:</strong> ${Math.floor((Date.now() - botStartTime) / 1000 / 60)} دقيقة</div>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            🔄 Session migrated from Baileys to Venom<br>
            ✅ Maximum stability & compatibility
        </p>
    </div>
</body>
</html>
        `);
    } else if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            connected: !!globalClient,
            uptime: Math.floor((Date.now() - botStartTime) / 1000),
            aiEnabled: AI_ENABLED,
            islamicEnabled: islamicIsEnabled()
        }));
    } else if (req.url === '/debug') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            connected: !!globalClient,
            botStartTime: new Date(botStartTime).toISOString(),
            uptime: Math.floor((Date.now() - botStartTime) / 1000),
            processedMessagesCount: processedMessages.size,
            aiEnabled: AI_ENABLED,
            islamicEnabled: islamicIsEnabled(),
            library: 'venom-bot',
            sessionMigrated: fs.existsSync(path.join(__dirname, 'tokens', 'botly-session')),
            hasReconnectionTimer: !!reconnectionTimer
        }, null, 2));
    } else if (req.url.startsWith('/test-message')) {
        if (!globalClient) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Not connected' }));
            return;
        }
        
        try {
            const hostDevice = await globalClient.getHostDevice();
            const target = hostDevice.id.user + '@c.us';
            
            await globalClient.sendText(target, `🧪 Test from Venom-Bot\nTime: ${new Date().toLocaleString()}\n✅ Session migrated from Baileys!`);
            
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, to: target }));
        } catch (e) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: e.message }));
        }
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(CONFIG.port, () => {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log(`║  🌐 Server: http://localhost:${CONFIG.port}            ║`);
    console.log('╚════════════════════════════════════════════════╝\n');
});

// ============================================
// START
// ============================================

console.log(`\n⚙️ ═══════ إعدادات البوت ═══════`);
console.log(`📱 اسم البوت: ${CONFIG.botName}`);
console.log(`👤 المالك: ${CONFIG.botOwner}`);
console.log(`🤖 AI: ${AI_ENABLED ? '✅ مفعّل' : '❌ معطّل'}`);
console.log(`📿 القسم الإسلامي: ${islamicIsEnabled() ? '✅ مفعّل' : '❌ معطّل'}`);
console.log(`═══════════════════════════════════\n`);

startVenomBot().catch(error => {
    console.error('❌ Failed:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Stopping...');
    if (reconnectionTimer) clearTimeout(reconnectionTimer);
    if (globalClient) await globalClient.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Stopping...');
    if (reconnectionTimer) clearTimeout(reconnectionTimer);
    if (globalClient) await globalClient.close();
    process.exit(0);
});

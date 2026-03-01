// ============================================
// VENOM-BOT VERSION - More Stable!
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
// VENOM-BOT IMPORTS
// ============================================
const venom = require('venom-bot');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { getAIResponse } = require('./modules/ai/ai');
const { handleIslamicCommand, initializeIslamicModule, islamicIsEnabled } = require('./modules/islamic/islamicModule');
const adminPanel = require('./modules/admin/adminPanel');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Message Deduplication
const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;

const CONFIG = {
    botName: process.env.BOT_NAME || 'Botly',
    botOwner: process.env.BOT_OWNER || 'مقداد',
    prefix: process.env.PREFIX || '!',
    port: process.env.PORT || 8080,
    replyInGroups: false,
    ownerNumber: process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER + '@c.us' : null, // Venom uses @c.us
    showIgnoredMessages: process.env.SHOW_IGNORED_MESSAGES === 'true',
    adminNumber: '249962204268@c.us',
    allowedGroups: process.env.ALLOWED_GROUPS ? process.env.ALLOWED_GROUPS.split(',').map(g => g.trim()) : [],
    blockedContacts: process.env.BLOCKED_CONTACTS ? process.env.BLOCKED_CONTACTS.split(',').map(c => c.trim()) : []
};

// State files
const AI_STATE_FILE = path.join(__dirname, 'ai_state.json');
const BAN_LIST_FILE = path.join(__dirname, 'ban_list.json');
const ALLOWED_GROUPS_FILE = path.join(__dirname, 'allowed_groups.json');

// ============================================
// HELPER FUNCTIONS
// ============================================

function loadAIState() {
    try {
        if (fs.existsSync(AI_STATE_FILE)) {
            const data = fs.readFileSync(AI_STATE_FILE, 'utf-8');
            const state = JSON.parse(data);
            return state.enabled || false;
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
            const data = fs.readFileSync(BAN_LIST_FILE, 'utf-8');
            return JSON.parse(data);
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
            const data = fs.readFileSync(ALLOWED_GROUPS_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.log('⚠️ خطأ في قراءة قائمة المجموعات المسموحة');
    }
    return [];
}

function saveAllowedGroupsList(list) {
    try {
        fs.writeFileSync(ALLOWED_GROUPS_FILE, JSON.stringify(list), 'utf-8');
    } catch (error) {
        console.error('❌ خطأ في حفظ قائمة المجموعات المسموحة:', error.message);
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

async function startVenomBot() {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log('║        🦎 Starting VENOM-BOT Version         ║');
    console.log('║           More Stable Connection!             ║');
    console.log('╚════════════════════════════════════════════════╝\n');
    
    try {
        const client = await venom.create({
            session: 'botly-session', // Session name
            multidevice: true, // Enable multi-device
            
            // Headless browser settings
            headless: 'new', // Use new headless mode
            devtools: false,
            useChrome: true,
            debug: false,
            logQR: false,
            
            // Browser args for Clever Cloud
            browserArgs: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ],
            
            // Auto-close after 30 seconds of QR
            autoClose: 30000,
            
            // Disable QR terminal (we'll use web interface)
            disableWelcome: true,
            
            // Status callback
            statusFind: (statusSession, session) => {
                console.log(`📊 Status: ${statusSession}`);
                console.log(`   Session: ${session}`);
            },
            
            // Folder for session data
            folderNameToken: './tokens',
            mkdirFolderToken: '',
            
            // Create folder if not exists
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
        
        // Initialize Islamic module if enabled
        if (islamicIsEnabled()) {
            console.log('🔄 تهيئة القسم الإسلامي...');
            try {
                // Create a wrapper to mimic Baileys sock
                const sockWrapper = {
                    sendMessage: async (jid, content) => {
                        // Convert @c.us to proper format
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
        
        // ============================================
        // MESSAGE HANDLER
        // ============================================
        
        // Track if handler is attached
        const handlerId = Date.now();
        console.log(`📡 Attaching message handler [ID: ${handlerId}]\n`);
        
        client.onMessage(async (message) => {
            // Log every message event
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
            console.log(`📨 MESSAGE RECEIVED [Handler: ${handlerId}]`);
            console.log(`   From: ${message.from}`);
            console.log(`   Body: ${message.body?.substring(0, 50) || 'N/A'}`);
            console.log(`   Type: ${message.type}`);
            console.log(`   Time: ${new Date().toLocaleString('ar-EG', {timeZone: 'Africa/Cairo'})}`);
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
            
            try {
                // Skip if no message body
                if (!message.body) {
                    console.log('⏭️ No message body - skipping\n');
                    return;
                }
                
                // Deduplication
                if (processedMessages.has(message.id)) return;
                processedMessages.add(message.id);
                cleanProcessedMessages();
                
                const text = message.body;
                const sender = message.from;
                const isGroup = message.isGroupMsg;
                const chatId = message.chatId;
                
                // Check if banned
                if (BANNED_USERS.includes(sender)) {
                    console.log(`🚫 رسالة من مستخدم محظور: ${sender}`);
                    return;
                }
                
                // Check if from me
                const isOwner = message.fromMe || 
                               sender === CONFIG.ownerNumber || 
                               sender === CONFIG.adminNumber;
                
                // Admin commands (from owner only)
                const adminCommands = ['/تشغيل', '/توقف', '/ban', '/unban', '/id'];
                if (isOwner && adminCommands.includes(text.trim())) {
                    console.log('\n' + '='.repeat(50));
                    console.log(`📩 👤 أدمن: ${sender}`);
                    console.log(`📝 ${text}`);
                    console.log('='.repeat(50));
                    
                    if (text.trim() === '/id') {
                        await client.sendText(chatId, `📋 معلومات:\n\nChat ID:\n${chatId}\n\n${isGroup ? '👥 هذه مجموعة' : '👤 هذه محادثة خاصة'}`);
                        console.log(`📋 تم إرسال ID: ${chatId}\n`);
                        return;
                    }
                    
                    if (text.trim() === '/تشغيل') {
                        AI_ENABLED = true;
                        saveAIState(true);
                        await client.sendText(chatId, '✅ تم تشغيل AI');
                        console.log('✅ AI تم تشغيله بواسطة الأدمن\n');
                        return;
                    }
                    
                    if (text.trim() === '/توقف') {
                        AI_ENABLED = false;
                        saveAIState(false);
                        await client.sendText(chatId, '🛑 تم إيقاف AI');
                        console.log('⏸️ AI تم إيقافه بواسطة الأدمن\n');
                        return;
                    }
                    
                    if (text.trim() === '/ban') {
                        if (!BANNED_USERS.includes(sender)) {
                            BANNED_USERS.push(sender);
                            saveBanList(BANNED_USERS);
                        }
                        await client.sendText(chatId, '✅ تم الحظر');
                        console.log(`🚫 تم حظر: ${sender}\n`);
                        return;
                    }
                    
                    if (text.trim() === '/unban') {
                        BANNED_USERS = BANNED_USERS.filter(u => u !== sender);
                        saveBanList(BANNED_USERS);
                        await client.sendText(chatId, '✅ تم إلغاء الحظر');
                        console.log(`✅ تم إلغاء حظر: ${sender}\n`);
                        return;
                    }
                }
                
                // Islamic module commands
                if (islamicIsEnabled()) {
                    const islamicCommands = ['/اسلام', '/islam', '/ادارة', '/admin'];
                    if (isOwner && islamicCommands.includes(text.trim())) {
                        // Create message wrapper
                        const msgWrapper = {
                            key: {
                                remoteJid: chatId,
                                fromMe: message.fromMe
                            }
                        };
                        
                        // Create sock wrapper
                        const sockWrapper = {
                            sendMessage: async (jid, content) => {
                                if (content.text) {
                                    await client.sendText(jid, content.text);
                                }
                            },
                            user: {
                                id: (await client.getHostDevice()).id.user
                            }
                        };
                        
                        const handled = await handleIslamicCommand(sockWrapper, msgWrapper, text, sender);
                        if (handled) return;
                    }
                    
                    // Check if it's a number (for menu navigation)
                    if (isOwner && /^\d+$/.test(text.trim())) {
                        const msgWrapper = {
                            key: {
                                remoteJid: chatId,
                                fromMe: message.fromMe
                            }
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
                
                // Ignore groups unless allowed
                if (isGroup && !CONFIG.replyInGroups && !ALLOWED_GROUPS.includes(chatId)) {
                    if (CONFIG.showIgnoredMessages) {
                        console.log(`⏭️ تجاهل رسالة من مجموعة غير مسموحة: ${chatId}`);
                    }
                    return;
                }
                
                // AI Response
                if (AI_ENABLED && !message.fromMe) {
                    console.log('\n' + '='.repeat(50));
                    console.log(`📩 👤: ${sender}`);
                    console.log(`📝 ${text}`);
                    console.log('='.repeat(50));
                    
                    try {
                        const memory = getUserMemory(sender);
                        const aiResponse = await getAIResponse(text, CONFIG.botName, CONFIG.botOwner, memory);
                        
                        await client.sendText(chatId, aiResponse);
                        
                        addToUserMemory(sender, { role: 'user', content: text });
                        addToUserMemory(sender, { role: 'assistant', content: aiResponse });
                        
                        console.log(`✅ تم الرد بواسطة AI\n`);
                    } catch (error) {
                        console.error(`❌ خطأ في AI: ${error.message}\n`);
                    }
                }
                
            } catch (error) {
                console.error('❌ خطأ في معالجة الرسالة:', error);
            }
        });
        
        // ============================================
        // STATE CHANGE HANDLER
        // ============================================
        
        client.onStateChange((state) => {
            console.log(`\n📊 ═══════════════════════════════`);
            console.log(`   State changed: ${state}`);
            console.log(`   Time: ${new Date().toLocaleString('ar-EG', {timeZone: 'Africa/Cairo'})}`);
            console.log(`═══════════════════════════════\n`);
            
            if (state === 'CONFLICT' || state === 'UNPAIRED') {
                console.log('⚠️ Session conflict detected');
                console.log('🔄 Full restart required');
                console.log('⏳ Restarting in 5 seconds...\n');
                setTimeout(() => {
                    process.exit(1); // Clever Cloud will restart
                }, 5000);
            } else if (state === 'DISCONNECTED') {
                console.log('⚠️ Disconnected - Venom will auto-reconnect');
            }
        });
        
        // ============================================
        // DISCONNECT HANDLER
        // ============================================
        
        client.onStreamChange((state) => {
            console.log(`\n📡 ═══════════════════════════════`);
            console.log(`   Stream state: ${state}`);
            console.log(`   Time: ${new Date().toLocaleString('ar-EG', {timeZone: 'Africa/Cairo'})}`);
            console.log(`═══════════════════════════════\n`);
            
            if (state === 'DISCONNECTED') {
                console.log('⚠️ Stream disconnected');
                console.log('💡 Venom-Bot will attempt auto-reconnect');
            }
        });
        
        console.log('✅ البوت جاهز ومتصل!\n');
        
    } catch (error) {
        console.error('❌ خطأ في بدء Venom-Bot:', error);
        console.log('⏳ محاولة إعادة الاتصال في 30 ثانية...');
        await delay(30000);
        return startVenomBot();
    }
}

// ============================================
// HTTP SERVER (for pairing)
// ============================================

const server = http.createServer((req, res) => {
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
        h1 {
            color: #667eea;
            margin-bottom: 10px;
        }
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
        <div class="badge">Powered by Venom-Bot</div>
        
        <div class="status">✅ البوت متصل ويعمل</div>
        
        <div class="info">
            <div class="info-item">
                <strong>📱 اسم البوت:</strong> ${CONFIG.botName}
            </div>
            <div class="info-item">
                <strong>👤 المالك:</strong> ${CONFIG.botOwner}
            </div>
            <div class="info-item">
                <strong>🤖 AI:</strong> ${AI_ENABLED ? '✅ مفعّل' : '❌ معطّل'}
            </div>
            <div class="info-item">
                <strong>📿 القسم الإسلامي:</strong> ${islamicIsEnabled() ? '✅ مفعّل' : '❌ معطّل'}
            </div>
            <div class="info-item">
                <strong>⏱️ وقت التشغيل:</strong> ${Math.floor((Date.now() - botStartTime) / 1000 / 60)} دقيقة
            </div>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Venom-Bot يوفر اتصال أكثر استقراراً من Baileys المباشر
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
        // Debug endpoint
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            connected: !!globalClient,
            botStartTime: new Date(botStartTime).toISOString(),
            uptime: Math.floor((Date.now() - botStartTime) / 1000),
            processedMessagesCount: processedMessages.size,
            aiEnabled: AI_ENABLED,
            islamicEnabled: islamicIsEnabled(),
            library: 'venom-bot'
        }, null, 2));
    } else if (req.url.startsWith('/test-message')) {
        // Test message endpoint
        if (!globalClient) {
            res.writeHead(503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'Bot not connected' }));
            return;
        }
        
        (async () => {
            try {
                const hostDevice = await globalClient.getHostDevice();
                const target = hostDevice.id.user + '@c.us';
                
                await globalClient.sendText(target, `🧪 Test message from Venom-Bot\nTime: ${new Date().toLocaleString()}\nBot CAN send! ✅`);
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: true, 
                    message: 'Test message sent to yourself',
                    to: target
                }));
            } catch (e) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ 
                    success: false, 
                    error: e.message 
                }));
            }
        })();
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(CONFIG.port, () => {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log(`║  🌐 الواجهة متاحة على:                         ║`);
    console.log(`║  http://localhost:${CONFIG.port}                     ║`);
    console.log('╚════════════════════════════════════════════════╝\n');
});

// ============================================
// START BOT
// ============================================

console.log(`\n⚙️ ═══════ إعدادات البوت ═══════`);
console.log(`📱 اسم البوت: ${CONFIG.botName}`);
console.log(`👤 المالك: ${CONFIG.botOwner}`);
console.log(`👥 الرد في المجموعات: ${CONFIG.replyInGroups ? '✅' : '❌'}`);
console.log(`🤖 AI: ${AI_ENABLED ? '✅ مفعّل' : '❌ معطّل'}`);
console.log(`📿 القسم الإسلامي: ${islamicIsEnabled() ? '✅ مفعّل' : '❌ معطّل'}`);
console.log(`═══════════════════════════════════\n`);

// Start Venom-Bot
startVenomBot().catch(error => {
    console.error('❌ فشل بدء البوت:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 إيقاف البوت...');
    if (globalClient) {
        await globalClient.close();
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 إيقاف البوت...');
    if (globalClient) {
        await globalClient.close();
    }
    process.exit(0);
});

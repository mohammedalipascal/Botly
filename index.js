// Load .env only if not in cloud environment
// Clever Cloud and most cloud platforms inject ENV vars directly
const isCloudEnvironment = !!(process.env.CC_DEPLOYMENT_ID || process.env.CLEVER_CLOUD || process.env.PORT);

if (!isCloudEnvironment && !process.env.ISLAMIC_GROUP_ID) {
    console.log('📂 Loading .env file (local development)');
    require('dotenv').config();
} else {
    console.log('☁️ Using cloud environment variables');
}

// Log key ENV vars (without exposing full values)
console.log(`🔑 ISLAMIC_GROUP_ID: ${process.env.ISLAMIC_GROUP_ID ? '✅ موجود' : '❌ غير موجود'}`);
console.log(`🔑 GOOGLE_SHEET_ID: ${process.env.GOOGLE_SHEET_ID ? '✅ موجود' : '❌ غير موجود'}`);

const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const P = require('pino');
const http = require('http');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');
const { getAIResponse } = require('./modules/ai/ai');
const { handleIslamicCommand, initializeIslamicModule, islamicIsEnabled } = require('./modules/islamic/islamicModule');
const adminPanel = require('./modules/admin/adminPanel');

// ========== MONGODB + RECONNECTION IMPORTS ==========
const { useMongoDBAuthState } = require('./database/mongoAuthState');
const { ReconnectionManager } = require('./utils/reconnectionManager');

// MongoDB URL from ENV
const MONGO_URL = process.env.MONGO_URL;
const USE_MONGODB = !!MONGO_URL;

// Reconnection Manager
const reconnectionManager = new ReconnectionManager({
    maxAttempts: Infinity,
    baseDelay: 1000,
    maxDelay: 60000
});
// ====================================================

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Message Deduplication
const processedMessages = new Set();

const CONFIG = {
    botName: process.env.BOT_NAME || 'Botly',
    botOwner: process.env.BOT_OWNER || 'مقداد',
    prefix: process.env.PREFIX || '!',
    port: process.env.PORT || 8080,
    replyInGroups: false,
    ownerNumber: process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER + '@s.whatsapp.net' : null,
    showIgnoredMessages: process.env.SHOW_IGNORED_MESSAGES === 'true',
    logLevel: process.env.LOG_LEVEL || 'silent',
    adminNumber: '249962204268@s.whatsapp.net',
    allowedGroups: process.env.ALLOWED_GROUPS ? process.env.ALLOWED_GROUPS.split(',').map(g => g.trim()) : [],
    blockedContacts: process.env.BLOCKED_CONTACTS ? process.env.BLOCKED_CONTACTS.split(',').map(c => c.trim()) : []
};

const AI_STATE_FILE = path.join(__dirname, 'ai_state.json');
const BAN_LIST_FILE = path.join(__dirname, 'ban_list.json');
const ALLOWED_GROUPS_FILE = path.join(__dirname, 'allowed_groups.json');

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
        console.error('❌ خطأ في حفظ قائمة المجموعات:', error.message);
    }
}

let AI_ENABLED = loadAIState();
let BANNED_USERS = loadBanList();
let ALLOWED_GROUPS_LIST = loadAllowedGroupsList();

const AI_CONFIG = {
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 500,
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7
};

const authPath = path.join(__dirname, 'auth_info');
const hasSession = fs.existsSync(authPath) && fs.existsSync(path.join(authPath, 'creds.json'));

console.log('\n⚙️ ═══════ إعدادات البوت ═══════');
console.log(`📱 اسم البوت: ${CONFIG.botName}`);
console.log(`👤 المالك: ${CONFIG.botOwner}`);
console.log(`👥 الرد في المجموعات: ${CONFIG.replyInGroups ? '✅' : '❌'}`);
console.log(`🤖 AI: ${AI_ENABLED ? '✅ مفعّل' : '❌ معطّل'}`);
console.log(`📿 القسم الإسلامي: ${islamicIsEnabled() ? '✅ مفعّل' : '❌ معطّل'}`);
console.log(`💾 الجلسة: ${hasSession ? 'موجودة في الـ repo ✅' : '⚠️ غير موجودة - سيتم إنشاء جلسة جديدة'}`);
console.log('═══════════════════════════════════\n');

let requestCount = 0;
let pairingCode = null;
let pairingStatus = 'waiting';
let pairingError = null;
let phoneNumber = null;

const server = http.createServer((req, res) => {
    requestCount++;
    
    if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        try {
            let html = fs.readFileSync(path.join(__dirname, 'pairing.html'), 'utf-8');
            html = html.replace(/{{BOT_NAME}}/g, CONFIG.botName);
            html = html.replace(/{{BOT_OWNER}}/g, CONFIG.botOwner);
            res.end(html);
        } catch (e) {
            res.end('<h1>Pairing page not found</h1>');
        }
        return;
    }
    
    if (req.url.startsWith('/get-code')) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const phone = url.searchParams.get('phone');
        
        if (!phone) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'رقم الهاتف مطلوب' }));
            return;
        }
        
        phoneNumber = phone;
        pairingStatus = 'generating';
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            if (pairingCode && pairingStatus === 'ready') {
                clearInterval(checkInterval);
                res.end(JSON.stringify({ 
                    success: true, 
                    code: pairingCode,
                    phone: phoneNumber
                }));
            } else if (pairingStatus === 'error') {
                clearInterval(checkInterval);
                res.end(JSON.stringify({ 
                    success: false, 
                    error: pairingError || 'فشل توليد الكود'
                }));
            } else if (Date.now() - startTime > 30000) {
                clearInterval(checkInterval);
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'انتهى وقت الانتظار'
                }));
            }
        }, 500);
        
        return;
    }
    
    if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: pairingStatus,
            code: pairingCode,
            phone: phoneNumber,
            botName: CONFIG.botName,
            connected: globalSock && globalSock.user ? true : false
        }));
        return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: CONFIG.botName,
        uptime: process.uptime(),
        requests: requestCount,
        time: new Date().toISOString(),
        connected: globalSock && globalSock.user ? true : false
    }));
});

server.listen(CONFIG.port, () => {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log(`║  🌐 الواجهة متاحة على:                         ║`);
    console.log(`║  http://localhost:${CONFIG.port}                     ║`);
    console.log('╚════════════════════════════════════════════════╝\n');
});

setInterval(() => {
    const url = `http://localhost:${CONFIG.port}`;
    http.get(url, (res) => {
        console.log(`💓 Keep-alive: ${res.statusCode}`);
    }).on('error', () => {});
}, 5 * 60 * 1000);

async function generateNewSession(attemptNumber = 1) {
    const MAX_SESSION_ATTEMPTS = 3;
    
    if (attemptNumber > MAX_SESSION_ATTEMPTS) {
        console.error('\n❌ فشلت جميع المحاولات لإنشاء الجلسة\n');
        console.log('⏳ سيتم المحاولة مرة أخرى بعد 30 ثانية...\n');
        await delay(30000);
        return generateNewSession(1);
    }
    
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log(`║    🔐 إنشاء جلسة جديدة - محاولة ${attemptNumber}/${MAX_SESSION_ATTEMPTS}     ║`);
    console.log('╚════════════════════════════════════════════════╝\n');
    
    pairingCode = null;
    pairingStatus = 'waiting';
    pairingError = null;
    
    let connectionResolved = false;
    
    try {
        const authPath = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
        }
        
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')}\n`);
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const msgRetryCounterCache = new NodeCache();
        
        const sock = makeWASocket({
            version,
            logger: P({ level: 'fatal' }),
            printQRInTerminal: false,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'fatal' }))
            },
            markOnlineOnConnect: true,
            syncFullHistory: false,
            msgRetryCounterCache,
            getMessage: async () => undefined
        });
        
        sock.ev.on('creds.update', saveCreds);
        
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                if (!connectionResolved) {
                    console.log('\n⏰ انتهى وقت الانتظار - إعادة المحاولة...\n');
                    connectionResolved = true;
                    sock.end();
                    reject(new Error('timeout'));
                }
            }, 10 * 60 * 1000);
            
            console.log('📱 في انتظار رقم الهاتف من الواجهة...');
            console.log(`🌐 افتح: http://localhost:${CONFIG.port}\n`);
            
            const checkPhoneInterval = setInterval(async () => {
                if (phoneNumber && pairingStatus === 'generating') {
                    clearInterval(checkPhoneInterval);
                    
                    try {
                        console.log(`📞 رقم الهاتف المُدخل: ${phoneNumber}`);
                        console.log('🔄 جاري توليد كود الربط...\n');
                        
                        const code = await sock.requestPairingCode(phoneNumber);
                        pairingCode = code;
                        pairingStatus = 'ready';
                        
                        console.log('\n╔════════════════════════════════════════════════╗');
                        console.log(`║           🔑 كود الربط: ${code}            ║`);
                        console.log('╚════════════════════════════════════════════════╝\n');
                        
                        console.log('📱 أدخل هذا الكود في WhatsApp:\n');
                        console.log('   1️⃣ افتح WhatsApp');
                        console.log('   2️⃣ الإعدادات > الأجهزة المرتبطة');
                        console.log('   3️⃣ ربط جهاز');
                        console.log('   4️⃣ ربط برقم الهاتف بدلاً من ذلك');
                        console.log(`   5️⃣ أدخل الكود: ${code}\n`);
                        
                    } catch (error) {
                        console.error('❌ فشل توليد الكود:', error.message);
                        pairingStatus = 'error';
                        pairingError = error.message;
                    }
                }
            }, 1000);
            
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;
                
                if (connection === 'close') {
                    if (connectionResolved) return;
                    
                    clearInterval(checkPhoneInterval);
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log(`\n⚠️ الاتصال مغلق - كود: ${statusCode}`);
                    
                    if (statusCode === 515 || statusCode === 503 || statusCode === 408 || !statusCode) {
                        console.log('🔄 سيتم إعادة المحاولة...\n');
                        connectionResolved = true;
                        clearTimeout(timeoutId);
                        sock.end();
                        reject(new Error(`retry_${statusCode || 'unknown'}`));
                        return;
                    }
                    
                    console.log(`❌ خطأ غير قابل للإصلاح: ${statusCode}\n`);
                    connectionResolved = true;
                    clearTimeout(timeoutId);
                    sock.end();
                    reject(new Error(`fatal_${statusCode}`));
                }
                
                if (connection === 'open') {
                    connectionResolved = true;
                    clearTimeout(timeoutId);
                    clearInterval(checkPhoneInterval);
                    pairingStatus = 'connected';
                    
                    console.log('\n✅ ════════════════════════════════════');
                    console.log('   🎉 تم الاتصال بنجاح!');
                    console.log(`   📱 ${sock.user.id.split(':')[0]}`);
                    console.log('════════════════════════════════════\n');
                    
                    console.log('⏳ انتظار 45 ثانية للمزامنة الكاملة...');
                    console.log('💡 نصيحة: أرسل رسالة في أي مجموعة الآن!\n');
                    await delay(45000);
                    
                    console.log('✅ تم حفظ الجلسة محلياً في auth_info/');
                    console.log('💡 الجلسة ستبقى على السيرفر\n');
                    
                    sock.end();
                    resolve();
                }
            });
        });
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء الجلسة:', error.message);
        
        if (error.message.startsWith('retry_') || 
            error.message === 'timeout') {
            console.log(`⏳ انتظار 10 ثواني قبل المحاولة التالية...\n`);
            await delay(10000);
            return generateNewSession(attemptNumber + 1);
        }
        
        throw error;
    }
}

const MAX_PROCESSED_CACHE = 1000;
let globalSock = null;
let botStartTime = Date.now();

let badMacErrorCount = 0;
const MAX_BAD_MAC_ERRORS = 10;
let lastBadMacReset = Date.now();

const userMemory = new Map();
const MAX_MEMORY_PER_USER = 5;

function addToUserMemory(userId, message) {
    if (!userMemory.has(userId)) {
        userMemory.set(userId, []);
    }
    
    const memory = userMemory.get(userId);
    memory.push(message);
    
    if (memory.length > MAX_MEMORY_PER_USER) {
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

async function startBot() {
    try {
        const authPath = path.join(__dirname, 'auth_info');
        const credsPath = path.join(authPath, 'creds.json');
        
        if (!fs.existsSync(authPath) || !fs.existsSync(credsPath)) {
            console.log('⚠️ لا توجد جلسة - سيتم إنشاء جلسة جديدة\n');
            
            try {
                await generateNewSession();
            } catch (error) {
                console.error('❌ فشل إنشاء الجلسة:', error.message);
                console.log('⏳ سيتم المحاولة مرة أخرى بعد 3 ثانية...\n');
                await delay(3000);
                return startBot();
            }
            
            console.log('🔄 إعادة التشغيل للاتصال بالجلسة الجديدة...\n');
            await delay(3000);
            process.exit(0);
        }
        
        try {
            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
            if (!creds.noiseKey) {
                throw new Error('creds.json غير مكتمل');
            }
            console.log('✅ تم العثور على جلسة صالحة\n');
        } catch (e) {
            console.error('❌ الجلسة تالفة:', e.message);
            console.log('🗑️ حذف الجلسة التالفة وإنشاء جديدة...\n');
            fs.rmSync(authPath, { recursive: true, force: true });
            
            try {
                await generateNewSession();
            } catch (error) {
                console.error('❌ فشل إنشاء الجلسة:', error.message);
                console.log('⏳ سيتم المحاولة مرة أخرى بعد 3 ثواني...\n');
                await delay(3000);
                return startBot();
            }
            
            await delay(3000);
            process.exit(0);
        }
        
        console.log('🚀 بدء البوت...\n');
        
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')}, أحدث: ${isLatest ? '✅' : '⚠️'}\n`);
        
        // ========== USE MONGODB IF AVAILABLE, FALLBACK TO FILESYSTEM ==========
        let state, saveCreds;
        
        if (USE_MONGODB) {
            console.log('📊 Using MongoDB for session storage...');
            try {
                const mongoAuth = await useMongoDBAuthState(MONGO_URL, {
                    sessionId: 'main_session',
                    dbName: 'whatsapp_bot'
                });
                state = mongoAuth.state;
                saveCreds = mongoAuth.saveCreds;
                
                // ⚠️ Check if creds are complete (not just initialized)
                if (!state.creds.me || !state.creds.me.id) {
                    console.log('⚠️ MongoDB session incomplete - using filesystem instead');
                    throw new Error('Incomplete session');
                }
                
                console.log('✅ MongoDB session loaded\n');
            } catch (e) {
                console.error('❌ MongoDB failed, falling back to filesystem:', e.message);
                const fsAuth = await useMultiFileAuthState('auth_info');
                state = fsAuth.state;
                saveCreds = fsAuth.saveCreds;
            }
        } else {
            console.log('📁 Using filesystem for session storage...');
            const fsAuth = await useMultiFileAuthState('auth_info');
            state = fsAuth.state;
            saveCreds = fsAuth.saveCreds;
            console.log('✅ Filesystem session loaded\n');
        }
        // ======================================================================
        
        const msgRetryCounterCache = new NodeCache();
        
        const sock = makeWASocket({
            version,
            logger: P({ level: 'fatal' }),
            printQRInTerminal: false,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'fatal' }))
            },
            
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            
            msgRetryCounterCache,
            
            getMessage: async (key) => undefined,
            
            shouldIgnoreJid: (jid) => jid.endsWith('@newsletter')
        });

        globalSock = sock;

        sock.ev.on('creds.update', saveCreds);
        
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            
            try {
                if (msgRetryCounterCache) {
                    try {
                        msgRetryCounterCache.flushAll();
                    } catch (e) {
                        // Silent
                    }
                }
                
                if (type !== 'notify') return;
                
                const msg = messages[0];
                if (!msg || !msg.message) return;
                
                const sender = msg.key.remoteJid;
                const messageId = msg.key.id;
                const isGroup = sender.endsWith('@g.us');
                const isLid = sender.endsWith('@lid');
                
                // Ignore @lid protocol/status messages (cause loop)
                if (isLid) {
                    // Empty messages or status updates
                    if (!msg.message || Object.keys(msg.message).length === 0) {
                        return;
                    }
                    // Protocol messages (reactions, read receipts, etc)
                    if (msg.message.protocolMessage || msg.message.reactionMessage) {
                        return;
                    }
                    // Bot's own echoes
                    if (msg.key.fromMe) {
                        return;
                    }
                }
                
                // Ignore polls
                if (msg.message?.pollUpdateMessage || 
                    msg.message?.pollCreationMessage ||
                    msg.message?.pollCreationMessageV2 ||
                    msg.message?.pollCreationMessageV3) {
                    return;
                }
                
                // Standard deduplication
                const msgKey = `${sender}_${messageId}`;
                if (processedMessages.has(msgKey)) {
                    return;
                }
                processedMessages.add(msgKey);
                setTimeout(() => processedMessages.delete(msgKey), 60000);
                
                const messageTime = msg.messageTimestamp * 1000;
                if (messageTime < botStartTime - 60000) {
                    return;
                }

                if (msg.message?.listResponseMessage || msg.message?.buttonsResponseMessage) {
                    const isHandled = await handleIslamicCommand(sock, msg, '', sender);
                    if (isHandled) {
                        console.log('✅ List/Button معالج بواسطة القسم الإسلامي');
                        return;
                    }
                }
                
                const messageText = 
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption || '';
                
                const adminCommands = ['/تشغيل', '/توقف', '/ban', '/unban', '/id'];
                if (msg.key.fromMe && adminCommands.includes(messageText.trim())) {
                    console.log('\n' + '='.repeat(50));
                    console.log(`📩 👤 أدمن: ${sender}`);
                    console.log(`📝 ${messageText}`);
                    console.log('='.repeat(50));
                    
                    if (messageText.trim() === '/id') {
                        await sock.sendMessage(sender, {
                            text: `📋 معلومات:\n\nChat ID:\n${sender}\n\n${isGroup ? '👥 هذه مجموعة' : '👤 هذه محادثة خاصة'}`
                        }, { quoted: msg });
                        console.log(`📋 تم إرسال ID: ${sender}\n`);
                        return;
                    }
                    
                    if (messageText.trim() === '/تشغيل') {
                        AI_ENABLED = true;
                        saveAIState(true);
                        await sock.sendMessage(sender, {
                            react: { text: '✅', key: msg.key }
                        });
                        console.log('✅ AI تم تشغيله بواسطة الأدمن\n');
                        return;
                    }
                    
                    if (messageText.trim() === '/توقف') {
                        AI_ENABLED = false;
                        saveAIState(false);
                        await sock.sendMessage(sender, {
                            react: { text: '🛑', key: msg.key }
                        });
                        console.log('⏸️ AI تم إيقافه بواسطة الأدمن\n');
                        return;
                    }
                    
                    if (messageText.trim() === '/ban') {
                        if (!BANNED_USERS.includes(sender)) {
                            BANNED_USERS.push(sender);
                            saveBanList(BANNED_USERS);
                        }
                        await sock.sendMessage(sender, {
                            react: { text: '✅', key: msg.key }
                        });
                        console.log(`🚫 تم حظر: ${sender}\n`);
                        return;
                    }
                    
                    if (messageText.trim() === '/unban') {
                        BANNED_USERS = BANNED_USERS.filter(u => u !== sender);
                        saveBanList(BANNED_USERS);
                        await sock.sendMessage(sender, {
                            react: { text: '✅', key: msg.key }
                        });
                        console.log(`✅ تم إلغاء الحظر: ${sender}\n`);
                        return;
                    }
                }
                
                const isAdminInGroup = isGroup && msg.key.participant && (
                    msg.key.participant.includes('249962204268') ||
                    msg.key.participant.includes('231211024814174')
                );
                const isAdminDirect = msg.key.fromMe;
                
                if (isAdminDirect && !isGroup && messageText.trim().startsWith('سماح ')) {
                    const groupId = messageText.trim().substring(5).trim();
                    if (groupId.endsWith('@g.us')) {
                        if (!ALLOWED_GROUPS_LIST.includes(groupId)) {
                            ALLOWED_GROUPS_LIST.push(groupId);
                            saveAllowedGroupsList(ALLOWED_GROUPS_LIST);
                        }
                        await sock.sendMessage(sender, {
                            text: `✅ تم السماح للمجموعة:\n${groupId}`
                        }, { quoted: msg });
                        console.log(`✅ تم السماح للمجموعة: ${groupId}\n`);
                        return;
                    }
                }
                
                if (isAdminDirect && !isGroup && messageText.trim().startsWith('منع ')) {
                    const groupId = messageText.trim().substring(4).trim();
                    if (groupId.endsWith('@g.us')) {
                        ALLOWED_GROUPS_LIST = ALLOWED_GROUPS_LIST.filter(g => g !== groupId);
                        saveAllowedGroupsList(ALLOWED_GROUPS_LIST);
                        await sock.sendMessage(sender, {
                            text: `🚫 تم منع المجموعة:\n${groupId}`
                        }, { quoted: msg });
                        console.log(`🚫 تم منع المجموعة: ${groupId}\n`);
                        return;
                    }
                }
                
                if ((isAdminInGroup || isAdminDirect) && (messageText.trim() === '/سماح' || messageText.trim() === '/منع')) {
                    if (!isGroup) {
                        console.log('⚠️ أمر /سماح أو /منع يجب أن يُرسل داخل المجموعة\n');
                        return;
                    }
                    
                    console.log('\n' + '='.repeat(50));
                    console.log(`📩 👥 أدمن في مجموعة: ${sender}`);
                    console.log(`📝 ${messageText}`);
                    console.log('='.repeat(50));
                    
                    if (messageText.trim() === '/سماح') {
                        if (!ALLOWED_GROUPS_LIST.includes(sender)) {
                            ALLOWED_GROUPS_LIST.push(sender);
                            saveAllowedGroupsList(ALLOWED_GROUPS_LIST);
                        }
                        await sock.sendMessage(sender, {
                            text: 'تم السماح للبوت بالتحدث داخل المجموعة'
                        }, { quoted: msg });
                        console.log(`✅ تم السماح للمجموعة: ${sender}\n`);
                        return;
                    }
                    
                    if (messageText.trim() === '/منع') {
                        ALLOWED_GROUPS_LIST = ALLOWED_GROUPS_LIST.filter(g => g !== sender);
                        saveAllowedGroupsList(ALLOWED_GROUPS_LIST);
                        await sock.sendMessage(sender, {
                            text: 'تم منع البوت من التحدث داخل المجموعة'
                        }, { quoted: msg });
                        console.log(`🚫 تم منع المجموعة: ${sender}\n`);
                        return;
                    }
                }
                
                // لوحة الإدارة (قبل القسم الإسلامي)
                const isAdminCommand = await adminPanel.handleAdminCommand(sock, msg, messageText, sender);
                if (isAdminCommand) return;
                
                // القسم الإسلامي
                const isIslamicCommand = await handleIslamicCommand(sock, msg, messageText, sender);
                if (isIslamicCommand) return;
                                
                if (msg.key.fromMe) return;
                
                if (sender.endsWith('@newsletter')) {
                    if (CONFIG.showIgnoredMessages) {
                        console.log('⏭️ رسالة من قناة - متجاهلة');
                    }
                    return;
                }
                
                if (BANNED_USERS.includes(sender)) {
                    if (CONFIG.showIgnoredMessages) {
                        console.log('⏭️ مستخدم محظور - متجاهل');
                    }
                    return;
                }
                
                if (CONFIG.blockedContacts.length > 0) {
                    const isBlocked = CONFIG.blockedContacts.some(blocked => sender.includes(blocked));
                    if (isBlocked) {
                        if (CONFIG.showIgnoredMessages) {
                            console.log('⏭️ رقم محظور من ENV - متجاهل');
                        }
                        return;
                    }
                }
                
                if (isGroup) {
                    const isAllowedByCommand = ALLOWED_GROUPS_LIST.includes(sender);
                    const isAllowedByEnv = CONFIG.allowedGroups.length > 0 && 
                                          CONFIG.allowedGroups.some(groupId => sender.includes(groupId));
                    
                    if (!isAllowedByCommand && !isAllowedByEnv) {
                        if (CONFIG.showIgnoredMessages) {
                            console.log('⏭️ مجموعة غير مسموحة - متجاهل');
                        }
                        return;
                    }
                }
                
                if (sender === 'status@broadcast') return;
                if (processedMessages.has(messageId)) return;
                if (Date.now() - messageTime > 60000) return;
                
                const messageType = Object.keys(msg.message)[0];
                if (['protocolMessage', 'senderKeyDistributionMessage', 'reactionMessage'].includes(messageType)) return;

                if (!messageText.trim()) return;

                console.log('\n' + '='.repeat(50));
                console.log(`📩 ${isGroup ? '👥' : '👤'}: ${sender}`);
                console.log(`📝 ${messageText}`);
                console.log('='.repeat(50));

                processedMessages.add(messageId);
                cleanProcessedMessages();

                addToUserMemory(sender, messageText);
                const recentMessages = getUserMemory(sender);

                try {
                    if (AI_ENABLED) {
                        const aiResponse = await getAIResponse(messageText, {...AI_CONFIG, enabled: true}, sender, recentMessages);
                        
                        if (aiResponse) {
                            await sock.sendMessage(sender, { text: aiResponse }, { quoted: msg });
                            console.log('✅ تم الرد\n');
                        }
                    }
                    
                } catch (error) {
                    console.error('❌ خطأ في الرد:', error.message);
                }
                
            } catch (error) {
                if (error.message && error.message.includes('Bad MAC')) {
                    badMacErrorCount++;
                    
                    // إعادة تعيين العداد كل 5 دقائق
                    if (Date.now() - lastBadMacReset > 5 * 60 * 1000) {
                        badMacErrorCount = 1;
                        lastBadMacReset = Date.now();
                    }
                    
                    // log فقط كل 5 أخطاء
                    if (badMacErrorCount % 5 === 0) {
                        console.log(`⚠️ Bad MAC Errors: ${badMacErrorCount}/${MAX_BAD_MAC_ERRORS}`);
                    }
                    
                    // إعادة تشغيل عند تجاوز الحد
                    if (badMacErrorCount >= MAX_BAD_MAC_ERRORS) {
                        console.log('\n🔄 تجاوز حد أخطاء Bad MAC - إعادة تشغيل...\n');
                        sock.end();
                        await delay(3000);
                        process.exit(0);
                    }
                } else if (error.message && !error.message.includes('Bad MAC')) {
                    console.error('❌ خطأ في معالجة الرسالة:', error.message);
                }
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.error('\n❌ خطأ: تم طلب QR بعد تحميل الجلسة!\n');
                console.error('⚠️ الجلسة تالفة - حذفها وإعادة المحاولة...\n');
                
                // Clear MongoDB session
                if (USE_MONGODB) {
                    try {
                        const { MongoDBAuthState } = require('./database/mongoAuthState');
                        const mongoAuth = new MongoDBAuthState(MONGO_URL, {
                            sessionId: 'main_session',
                            dbName: 'whatsapp_bot'
                        });
                        await mongoAuth.connect();
                        await mongoAuth.clearSession();
                        await mongoAuth.close();
                        console.log('🗑️ MongoDB session cleared');
                    } catch (e) {
                        console.error('Error clearing MongoDB:', e.message);
                    }
                }
                
                // Clear filesystem
                fs.rmSync(authPath, { recursive: true, force: true });
                console.log('🗑️ Filesystem session cleared');
                
                console.log('⏳ إعادة المحاولة بعد 10 ثواني...\n');
                await delay(10000);
                
                sock.end();
                await startBot();
                return;
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const error = lastDisconnect?.error;
                
                console.log('\n⚠️ ════════════════════════════════');
                console.log(`   Connection Closed`);
                console.log(`   Status: ${statusCode || 'N/A'}`);
                console.log(`   Error: ${error?.message || 'Unknown'}`);
                console.log(`   Time: ${new Date().toLocaleString('ar-EG', {timeZone: 'Africa/Cairo'})}`);
                console.log('════════════════════════════════\n');
                
                // Cleanup socket
                try {
                    sock.end();
                } catch (e) {
                    console.log('Socket already closed');
                }
                
                // Check if session invalid (don't reconnect)
                if (statusCode === DisconnectReason.loggedOut ||
                    statusCode === 401 || statusCode === 403 || statusCode === 428) {
                    console.error('❌ Session invalid - cannot reconnect\n');
                    
                    // Clear MongoDB session if using it
                    if (USE_MONGODB) {
                        try {
                            const { MongoDBAuthState } = require('./database/mongoAuthState');
                            const mongoAuth = new MongoDBAuthState(MONGO_URL, {
                                sessionId: 'main_session',
                                dbName: 'whatsapp_bot'
                            });
                            await mongoAuth.connect();
                            await mongoAuth.clearSession();
                            await mongoAuth.close();
                            console.log('🗑️ MongoDB session cleared');
                        } catch (e) {
                            console.error('Error clearing MongoDB:', e.message);
                        }
                    }
                    
                    // Clear filesystem session
                    if (fs.existsSync(authPath)) {
                        fs.rmSync(authPath, { recursive: true, force: true });
                        console.log('🗑️ Filesystem session cleared');
                    }
                    
                    console.log('⏹️ Bot stopped - need new pairing\n');
                    process.exit(1);
                    return;
                }
                
                // ========== SMART RECONNECTION ==========
                if (!reconnectionManager.shouldReconnect(statusCode)) {
                    console.error('❌ Cannot reconnect');
                    process.exit(1);
                    return;
                }
                
                // Reconnect with exponential backoff
                try {
                    await reconnectionManager.reconnect(async () => {
                        console.log('🔄 Executing reconnection...\n');
                        await startBot();
                    });
                } catch (e) {
                    console.error('Reconnection attempt failed:', e.message);
                    // Will auto-retry due to reconnectionManager logic
                }
                // =======================================
                
            } else if (connection === 'open') {
                
                // ============ LOGGING ADDED HERE ============
                const now = new Date().toLocaleString('ar-EG', {timeZone: 'Africa/Cairo'});
                console.log('\n✅ ════════════════════════════════════');
                console.log(`   متصل بواتساب بنجاح! 🎉`);
                console.log(`   البوت: ${CONFIG.botName}`);
                console.log(`   الرقم: ${sock.user?.id?.split(':')[0] || '---'}`);
                console.log(`   الوقت: ${now}`);
                console.log(`   AI: ${AI_ENABLED ? '✅' : '❌'}`);
                console.log(`   القسم الإسلامي: ${islamicIsEnabled() ? '✅' : '❌'}`);
                console.log('════════════════════════════════════\n');
                
                console.log('🔍 ===== POST-CONNECTION DIAGNOSTICS =====');
                console.log(`   📊 processedMessages: ${processedMessages.size}`);
                console.log(`   🕐 botStartTime: ${new Date(botStartTime).toLocaleString('ar-EG')}`);
                console.log(`   📡 globalSock: ${globalSock ? 'SET' : 'NULL'}`);
                
                console.log('\n   🧹 Step 1/5: Clearing processedMessages...');
                processedMessages.clear();
                console.log(`   ✅ Cleared → ${processedMessages.size}`);
                
                console.log('\n   🕐 Step 2/5: Updating botStartTime...');
                botStartTime = Date.now();
                console.log(`   ✅ Updated → ${new Date(botStartTime).toLocaleString('ar-EG')}`);
                
                console.log('\n   🔄 Step 3/5: Resetting Bad MAC...');
                badMacErrorCount = 0;
                lastBadMacReset = Date.now();
                console.log(`   ✅ Reset → ${badMacErrorCount}`);
                
                // Reset reconnection counter on success
                reconnectionManager.reset();
                console.log('   ✅ Reconnection counter reset');
                
                console.log('\n   🎧 Step 4/5: Event listeners...');
                let msgListeners = 'N/A';
                let connListeners = 'N/A';
                try {
                    if (sock.ev.listenerCount) {
                        msgListeners = sock.ev.listenerCount('messages.upsert');
                        connListeners = sock.ev.listenerCount('connection.update');
                    } else {
                        // Fallback for older Baileys versions
                        msgListeners = sock.ev.listeners('messages.upsert').length;
                        connListeners = sock.ev.listeners('connection.update').length;
                    }
                } catch (e) {
                    console.log('   ⚠️ Cannot count listeners (old Baileys)');
                }
                console.log(`   📨 messages.upsert: ${msgListeners}`);
                console.log(`   🔌 connection.update: ${connListeners}`);
                
                console.log('\n   📿 Step 5/5: Islamic Module...');
                if (islamicIsEnabled()) {
                    try {
                        await initializeIslamicModule(sock);
                        console.log('   ✅ Islamic Module initialized');
                    } catch (e) {
                        console.error(`   ❌ Init failed: ${e.message}`);
                    }
                } else {
                    console.log('   ⏭️ Disabled');
                }
                
                console.log('\n===== DIAGNOSTICS COMPLETE =====');
                console.log('⚡ Bot ready - send a test message\n');
                // ============ END LOGGING ============
                
                // ========== SYNC SESSION TO MONGODB ==========
                if (USE_MONGODB && sock.user?.id) {
                    console.log('💾 Syncing session to MongoDB...');
                    try {
                        // Force save current state to MongoDB
                        await saveCreds();
                        console.log('✅ Session synced to MongoDB\n');
                    } catch (e) {
                        console.error('⚠️ MongoDB sync failed:', e.message, '\n');
                    }
                }
                // ============================================
                
            } else if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال...');
            }
        });

        console.log('✅ البوت جاهز ✨\n');
        
    } catch (error) {
        console.error('❌ خطأ في بدء البوت:', error);
        console.log('⏳ إعادة المحاولة بعد 30 ثانية...\n');
        await delay(30000);
        return startBot();
    }
}

process.on('SIGINT', async () => {
    console.log('\n👋 إيقاف البوت...\n');
    
    // Close MongoDB connection if using it
    if (USE_MONGODB) {
        try {
            const { MongoDBAuthState } = require('./database/mongoAuthState');
            const mongoAuth = new MongoDBAuthState(MONGO_URL, {
                sessionId: 'main_session',
                dbName: 'whatsapp_bot'
            });
            await mongoAuth.close();
            console.log('✅ MongoDB connection closed');
        } catch (e) {
            console.log('MongoDB already closed');
        }
    }
    
    server.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n👋 إيقاف البوت...\n');
    
    // Close MongoDB connection if using it
    if (USE_MONGODB) {
        try {
            const { MongoDBAuthState } = require('./database/mongoAuthState');
            const mongoAuth = new MongoDBAuthState(MONGO_URL, {
                sessionId: 'main_session',
                dbName: 'whatsapp_bot'
            });
            await mongoAuth.close();
            console.log('✅ MongoDB connection closed');
        } catch (e) {
            console.log('MongoDB already closed');
        }
    }
    
    server.close();
    process.exit(0);
});

startBot();

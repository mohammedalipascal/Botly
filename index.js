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
const { handleIslamicCommand, initializeIslamicModule, islamicIsEnabled, resetIslamicModule } = require('./modules/islamic/islamicModule');
const adminPanel = require('./modules/admin/adminPanel');

// ========== MONGODB IMPORTS ==========
const { useMongoDBAuthState } = require('./database/mongoAuthState');
const { ReconnectionManager } = require('./utils/reconnectionManager');

const MONGO_URL = process.env.MONGO_URL;
const USE_MONGODB = !!MONGO_URL;

const reconnectionManager = new ReconnectionManager({
    maxAttempts: Infinity,
    baseDelay: 1000,
    maxDelay: 60000
});
// ====================================

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

// Keep-alive removed - server stays alive natively

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
                    console.log(`\n⚠️ Pairing connection closed - code: ${statusCode}`);
                    
                    // These are normal pairing errors - retry
                    if (statusCode === 515 || statusCode === 503 || statusCode === 408 || !statusCode) {
                        console.log('🔄 Pairing failed - will retry...\n');
                        connectionResolved = true;
                        clearTimeout(timeoutId);
                        sock.end();
                        reject(new Error(`retry_${statusCode || 'unknown'}`));
                        return;
                    }
                    
                    // Fatal errors
                    console.log(`❌ Fatal pairing error: ${statusCode}\n`);
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
                    console.log('   🎉 Pairing successful!');
                    console.log(`   📱 ${sock.user.id.split(':')[0]}`);
                    console.log('════════════════════════════════════\n');
                    
                    console.log('⏳ Waiting 45s for full sync...');
                    console.log('💡 Tip: Send a message in any group now!\n');
                    await delay(45000);
                    
                    console.log('✅ Session saved locally in auth_info/');
                    
                    // ========== COPY TO MONGODB NOW ==========
                    if (USE_MONGODB) {
                        console.log('💾 Copying session to MongoDB...');
                        try {
                            const authPath = path.join(__dirname, 'auth_info');
                            const { useMongoDBAuthState } = require('./database/mongoAuthState');
                            
                            // Initialize MongoDB auth
                            const mongoAuth = await useMongoDBAuthState(MONGO_URL, {
                                sessionId: 'main_session',
                                dbName: 'whatsapp_bot'
                            });
                            
                            // Read all files from auth_info
                            const files = fs.readdirSync(authPath);
                            
                            for (const file of files) {
                                const filePath = path.join(authPath, file);
                                if (fs.statSync(filePath).isFile()) {
                                    const content = fs.readFileSync(filePath, 'utf-8');
                                    const key = file.replace('.json', '');
                                    const data = JSON.parse(content);
                                    
                                    // Write to MongoDB
                                    await mongoAuth.writeData(key, data);
                                }
                            }
                            
                            console.log(`✅ Copied ${files.length} files to MongoDB!`);
                        } catch (e) {
                            console.error('⚠️ MongoDB copy failed:', e.message);
                            console.log('⚠️ Session only in filesystem - may need pairing after restart');
                        }
                    }
                    // =========================================
                    
                    console.log('💡 Ready to use!\n');
                    
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

// Session management
let isSessionActive = false;
let currentSessionId = null;
let isManualRestart = false; // Flag for manual restart

// Backup interval management
let backupInterval = null;
let presenceInterval = null; // Keep-alive interval

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

// Cleanup old session before starting new one
async function cleanupOldSession() {
    if (globalSock) {
        console.log('🧹 Cleaning up old socket...');
        try {
            globalSock.end();
            globalSock = null;
        } catch (e) {
            console.log('Socket already closed');
        }
    }
    
    // Clear backup interval
    if (backupInterval) {
        clearInterval(backupInterval);
        backupInterval = null;
        console.log('🧹 Backup interval cleared');
    }
    
    // Clear presence interval
    if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
        console.log('🧹 Presence interval cleared');
    }
    
    // Reset session state
    isSessionActive = false;
    processedMessages.clear();
    badMacErrorCount = 0;
    
    // Give it a moment
    await delay(1000);
}

async function startBot() {
    // Prevent multiple sessions running simultaneously
    const sessionId = Date.now();
    
    if (isSessionActive) {
        console.log('⚠️ Session already active - waiting for cleanup...');
        await delay(5000);
        
        if (isSessionActive && currentSessionId !== sessionId) {
            console.log('⚠️ Another session still active - aborting this attempt');
            return;
        }
    }
    
    // Cleanup any old socket
    await cleanupOldSession();
    
    // Mark this session as active
    isSessionActive = true;
    currentSessionId = sessionId;
    console.log(`🆔 Session ID: ${sessionId}\n`);
    
    try {
        const authPath = path.join(__dirname, 'auth_info');
        const credsPath = path.join(authPath, 'creds.json');
        
        // ========== STEP 1: Try MongoDB First ==========
        if (USE_MONGODB) {
            console.log('🔍 Checking MongoDB for existing session...');
            try {
                const mongoAuth = await useMongoDBAuthState(MONGO_URL, {
                    sessionId: 'main_session',
                    dbName: 'whatsapp_bot'
                });
                
                // Check if MongoDB has complete session
                if (mongoAuth.state.creds.me && mongoAuth.state.creds.me.id) {
                    console.log('✅ Found valid session in MongoDB!');
                    console.log(`📱 Phone: ${mongoAuth.state.creds.me.id.split(':')[0]}\n`);
                    // Use MongoDB session directly
                    return await startBotWithSession(mongoAuth.state, mongoAuth.saveCreds);
                }
                
                console.log('⚠️ MongoDB session incomplete or missing\n');
            } catch (e) {
                console.log(`⚠️ MongoDB check failed: ${e.message}\n`);
            }
        }
        
        // ========== STEP 2: Check Filesystem ==========
        console.log('🔍 Checking filesystem for session...');
        
        if (fs.existsSync(authPath) && fs.existsSync(credsPath)) {
            try {
                const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
                if (creds.noiseKey && creds.me && creds.me.id) {
                    console.log('✅ Found valid session in filesystem!');
                    console.log(`📱 Phone: ${creds.me.id.split(':')[0]}\n`);
                    // Use filesystem session
                    return await startBotWithSession(null, null);
                }
            } catch (e) {
                console.log('⚠️ Filesystem session invalid\n');
            }
        } else {
            console.log('⚠️ No filesystem session found\n');
        }
        
        // ========== STEP 3: Generate New Session ==========
        console.log('🔐 No valid session found - generating new...\n');
        
        // Clear any incomplete sessions first
        if (USE_MONGODB) {
            try {
                console.log('🧹 Clearing incomplete MongoDB session...');
                const { MongoDBAuthState } = require('./database/mongoAuthState');
                const mongoAuth = new MongoDBAuthState(MONGO_URL, {
                    sessionId: 'main_session',
                    dbName: 'whatsapp_bot'
                });
                await mongoAuth.connect();
                await mongoAuth.clearSession();
                await mongoAuth.close();
                console.log('✅ MongoDB cleared');
            } catch (e) {
                console.log('⚠️ MongoDB clear skipped:', e.message);
            }
        }
        
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('✅ Filesystem cleared');
        }
        
        console.log('✅ Clean slate - ready for pairing\n');
        
        // Generate new session
        try {
            await generateNewSession();
        } catch (error) {
            console.error('❌ Session generation failed:', error.message);
            console.log('⏳ Retrying in 3 seconds...\n');
            isSessionActive = false;
            await delay(3000);
            return startBot();
        }
        
        console.log('🔄 Restarting to load new session...\n');
        await delay(3000);
        process.exit(0);
        
    } catch (error) {
        console.error('❌ Fatal error in startBot:', error);
        console.log('⏳ Retrying in 30 seconds...\n');
        await delay(30000);
        return startBot();
    }
}

// ========== Extracted Bot Initialization ==========
async function startBotWithSession(stateOverride = null, saveCredsOverride = null) {
    try {
        console.log('🚀 Starting bot with session...\n');
        
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')}, Latest: ${isLatest ? '✅' : '⚠️'}\n`);
        
        // Load session (MongoDB or filesystem)
        let state, saveCreds;
        
        if (stateOverride && saveCredsOverride) {
            // Using MongoDB session
            console.log('📊 Using provided MongoDB session\n');
            state = stateOverride;
            saveCreds = saveCredsOverride;
        } else {
            // Using filesystem session
            console.log('📁 Loading from filesystem...\n');
            const fsAuth = await useMultiFileAuthState('auth_info');
            state = fsAuth.state;
            saveCreds = fsAuth.saveCreds;
        }
        
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
            
            // Optimized timeouts to prevent 500 errors
            defaultQueryTimeoutMs: 90000, // 90s
            connectTimeoutMs: 90000,
            keepAliveIntervalMs: 25000, // More aggressive keep-alive
            retryRequestDelayMs: 500,
            
            msgRetryCounterCache,
            
            getMessage: async (key) => undefined,
            
            shouldIgnoreJid: (jid) => jid.endsWith('@newsletter')
        });

        globalSock = sock;
        
        console.log('📡 Attaching event listeners...');
        
        sock.ev.on('creds.update', saveCreds);
        
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            console.log(`📨 Message event received: type=${type}, count=${messages.length}`);
            
            try {
                if (msgRetryCounterCache) {
                    try {
                        msgRetryCounterCache.flushAll();
                    } catch (e) {
                        // تجاهل
                    }
                }
                
                if (type !== 'notify') return;
                
                const msg = messages[0];
                if (!msg || !msg.message) return;
                
                const sender = msg.key.remoteJid;
                const messageId = msg.key.id;
                const isGroup = sender.endsWith('@g.us');
                
                // تجاهل poll updates/creation تماماً
                if (msg.message?.pollUpdateMessage || 
                    msg.message?.pollCreationMessage ||
                    msg.message?.pollCreationMessageV2 ||
                    msg.message?.pollCreationMessageV3) {
                    return;
                }
                
                // Message Deduplication
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
                
                const adminCommands = ['/تشغيل', '/توقف', '/ban', '/unban', '/id', '.restart'];
                if (msg.key.fromMe && adminCommands.includes(messageText.trim())) {
                    console.log('\n' + '='.repeat(50));
                    console.log(`📩 👤 أدمن: ${sender}`);
                    console.log(`📝 ${messageText}`);
                    console.log('='.repeat(50));
                    
                    // ========== SOLUTION 3: .restart COMMAND ==========
                    if (messageText.trim() === '.restart') {
                        await sock.sendMessage(sender, {
                            text: '🔄 Restarting bot and syncing from MongoDB...\n\n⏰ Please wait 10 seconds...'
                        }, { quoted: msg });
                        
                        console.log('📱 Manual restart requested by owner');
                        console.log('💾 Saving current state to MongoDB...');
                        
                        // Set manual restart flag
                        isManualRestart = true;
                        
                        // Save current state
                        if (USE_MONGODB) {
                            try {
                                await saveCreds();
                                console.log('✅ State saved to MongoDB');
                            } catch (e) {
                                console.error('Failed to save:', e.message);
                            }
                        }
                        
                        // Close socket
                        console.log('🔌 Closing connection...');
                        try {
                            sock.end();
                        } catch (e) {}
                        
                        // Reset flags
                        isSessionActive = false;
                        if (backupInterval) {
                            clearInterval(backupInterval);
                            backupInterval = null;
                        }
                        
                        // Restart with MongoDB sync
                        setTimeout(async () => {
                            console.log('\n🔄 ════════════════════════════════');
                            console.log('   MANUAL RESTART - SYNC FROM MONGODB');
                            console.log('════════════════════════════════\n');
                            isManualRestart = false; // Reset flag
                            await startBot(); // Will load fresh from MongoDB
                        }, 10000);
                        
                        return;
                    }
                    // ================================================
                    
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
                        console.log('\n⚠️ ════════════════════════════════');
                        console.log('   TOO MANY BAD MAC ERRORS!');
                        console.log('   Session keys are corrupted/outdated');
                        console.log('   Clearing session and restarting...');
                        console.log('════════════════════════════════\n');
                        
                        // Clear MongoDB session
                        if (USE_MONGODB) {
                            try {
                                console.log('🗑️ Clearing MongoDB session...');
                                const { MongoDBAuthState } = require('./database/mongoAuthState');
                                const mongoAuth = new MongoDBAuthState(MONGO_URL, {
                                    sessionId: 'main_session',
                                    dbName: 'whatsapp_bot'
                                });
                                await mongoAuth.connect();
                                await mongoAuth.clearSession();
                                await mongoAuth.close();
                                console.log('✅ MongoDB cleared');
                            } catch (e) {
                                console.error('Error clearing MongoDB:', e.message);
                            }
                        }
                        
                        // Clear filesystem
                        const authPath = path.join(__dirname, 'auth_info');
                        if (fs.existsSync(authPath)) {
                            fs.rmSync(authPath, { recursive: true, force: true });
                            console.log('✅ Filesystem cleared');
                        }
                        
                        console.log('\n╔════════════════════════════════════════════════╗');
                        console.log('║  ⚠️  SESSION CLEARED DUE TO BAD MAC           ║');
                        console.log('║                                                ║');
                        console.log('║  📱 Go to: http://localhost:8080              ║');
                        console.log('║  🔐 Enter your phone to get new pairing code  ║');
                        console.log('╚════════════════════════════════════════════════╝\n');
                        
                        sock.end();
                        isSessionActive = false;
                        await delay(5000);
                        return startBot(); // Will go to pairing mode
                    }
                } else if (error.message && !error.message.includes('Bad MAC')) {
                    console.error('❌ خطأ في معالجة الرسالة:', error.message);
                }
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            console.log(`\n🔍 ===== CONNECTION UPDATE =====`);
            console.log(`   connection: ${connection || 'N/A'}`);
            console.log(`   qr: ${qr ? 'موجود' : 'لا'}`);
            console.log(`   lastDisconnect: ${lastDisconnect ? 'موجود' : 'لا'}`);
            if (lastDisconnect) {
                console.log(`   - statusCode: ${lastDisconnect?.error?.output?.statusCode || 'N/A'}`);
                console.log(`   - error: ${lastDisconnect?.error?.message || 'N/A'}`);
                console.log(`   - payload: ${JSON.stringify(lastDisconnect?.error?.output?.payload || {})}`);
            }
            console.log(`==============================\n`);
            
            if (qr) {
                console.error('\n❌ خطأ: تم طلب QR بعد تحميل الجلسة!\n');
                console.error('⚠️ الجلسة تالفة - حذفها وإعادة المحاولة...\n');
                
                fs.rmSync(authPath, { recursive: true, force: true });
                
                console.log('⏳ إعادة المحاولة بعد 10 ثواني...\n');
                await delay(10000);
                
                sock.end();
                await startBot();
                return;
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.output?.payload?.error;
                const error = lastDisconnect?.error;
                
                console.log(`\n⚠️ ════════════════════════════════`);
                console.log(`   Connection Closed`);
                console.log(`   Status: ${statusCode || 'N/A'}`);
                console.log(`   Reason: ${reason || 'Unknown'}`);
                console.log(`   Error: ${error?.message || 'Unknown'}`);
                console.log(`   Time: ${new Date().toLocaleString('ar-EG', {timeZone: 'Africa/Cairo'})}`);
                console.log(`════════════════════════════════\n`);
                
                // Cleanup socket
                try {
                    sock.end();
                } catch (e) {
                    console.log('Socket already closed');
                }
                
                // ========== SESSION INVALID - MUST EXIT ==========
                if (statusCode === DisconnectReason.loggedOut ||
                    statusCode === 401 || statusCode === 403 || statusCode === 428) {
                    console.error('❌ Session invalid - cleaning up...\n');
                    
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
                    const authPath = path.join(__dirname, 'auth_info');
                    if (fs.existsSync(authPath)) {
                        fs.rmSync(authPath, { recursive: true, force: true });
                        console.log('🗑️ Filesystem session cleared');
                    }
                    
                    console.log('\n╔════════════════════════════════════════════════╗');
                    console.log('║  ⚠️  SESSION INVALID - RETURNING TO PAIRING   ║');
                    console.log('║                                                ║');
                    console.log('║  📱 Go to: http://localhost:8080              ║');
                    console.log('║  🔐 Enter your phone to get new pairing code  ║');
                    console.log('╚════════════════════════════════════════════════╝\n');
                    
                    // Mark session as inactive
                    isSessionActive = false;
                    
                    // Restart bot process to go back to pairing mode
                    // This will check MongoDB → not found → generate new session
                    console.log('🔄 Restarting to pairing mode in 5 seconds...\n');
                    await delay(5000);
                    return startBot();
                }
                
                // ========== MANUAL RESTART - SKIP RECONNECTION ==========
                if (isManualRestart) {
                    console.log('⏸️ Manual restart in progress - skipping reconnection');
                    return; // Don't trigger reconnection manager
                }
                
                // ========== TEMPORARY ERROR (500, 408, etc) - RECONNECT ==========
                console.log('🔄 Temporary error - smart reconnection...');
                
                // SOLUTION 2: Smart Reconnection with Full Sync
                // Save current state to MongoDB first
                if (USE_MONGODB && state && saveCreds) {
                    console.log('💾 Saving current state to MongoDB before reconnect...');
                    try {
                        await saveCreds();
                        console.log('✅ State saved');
                    } catch (e) {
                        console.error('Save failed:', e.message);
                    }
                }
                
                // Close current socket
                try {
                    sock.end();
                } catch (e) {
                    console.log('Socket already closed');
                }
                
                // Mark as inactive temporarily
                isSessionActive = false;
                
                // Delay for WhatsApp to register disconnect
                await delay(5000);
                
                // Smart reconnection with fresh MongoDB sync
                try {
                    await reconnectionManager.reconnect(async () => {
                        console.log('🚀 Smart reconnection - loading fresh from MongoDB...\n');
                        
                        if (USE_MONGODB) {
                            // Load FRESH session from MongoDB
                            try {
                                const mongoAuth = await useMongoDBAuthState(MONGO_URL, {
                                    sessionId: 'main_session',
                                    dbName: 'whatsapp_bot'
                                });
                                
                                if (mongoAuth.state.creds.me?.id) {
                                    console.log('✅ Fresh session loaded from MongoDB');
                                    isSessionActive = false;
                                    await cleanupOldSession();
                                    return await startBotWithSession(mongoAuth.state, mongoAuth.saveCreds);
                                }
                            } catch (e) {
                                console.error('MongoDB load failed:', e.message);
                            }
                        }
                        
                        // Fallback: use memory state
                        console.log('💡 Using memory state as fallback');
                        isSessionActive = false;
                        await cleanupOldSession();
                        return await startBotWithSession(state, saveCreds);
                    });
                } catch (e) {
                    console.error('Smart reconnection failed:', e.message);
                    console.log('⏳ Full restart in 10s...');
                    isSessionActive = false;
                    await delay(10000);
                    await startBot(); // Full restart as last resort
                }
                // ================================================
                
            } else if (connection === 'open') {
                const now = new Date().toLocaleString('ar-EG', {timeZone: 'Africa/Cairo'});
                console.log('\n✅ ════════════════════════════════════');
                console.log(`   متصل بواتساب بنجاح! 🎉`);
                console.log(`   البوت: ${CONFIG.botName}`);
                console.log(`   الرقم: ${sock.user?.id?.split(':')[0] || '---'}`);
                console.log(`   الوقت: ${now}`);
                console.log(`   AI: ${AI_ENABLED ? '✅' : '❌'}`);
                console.log(`   القسم الإسلامي: ${islamicIsEnabled() ? '✅' : '❌'}`);
                console.log('════════════════════════════════════\n');
                
                processedMessages.clear();
                botStartTime = Date.now();
                
                badMacErrorCount = 0;
                lastBadMacReset = Date.now();
                
                // Reset reconnection counter on success
                reconnectionManager.reset();
                console.log('✅ Reconnection counter reset');
                
                if (islamicIsEnabled()) {
                    console.log('🔄 تهيئة القسم الإسلامي...');
                    await initializeIslamicModule(sock);
                    console.log('✅ القسم الإسلامي جاهز للعمل\n');
                }
                
                // ========== SYNC SESSION TO MONGODB ==========
                if (USE_MONGODB && sock.user?.id) {
                    console.log('💾 Syncing session to MongoDB...');
                    try {
                        await saveCreds();
                        console.log('✅ Session synced to MongoDB\n');
                    } catch (e) {
                        console.error('⚠️ MongoDB sync failed:', e.message, '\n');
                    }
                    
                    // ========== AUTO BACKUP EVERY 5 MINUTES ==========
                    // Clear any existing backup interval first!
                    if (backupInterval) {
                        clearInterval(backupInterval);
                        console.log('🧹 Cleared old backup interval');
                    }
                    
                    console.log('🔄 Starting automatic session backup (every 5 minutes)...');
                    backupInterval = setInterval(async () => {
                        if (!sock?.user?.id) {
                            console.log('⚠️ No active session - stopping backup');
                            clearInterval(backupInterval);
                            backupInterval = null;
                            return;
                        }
                        
                        try {
                            await saveCreds();
                            const timestamp = new Date().toLocaleTimeString('ar-EG', {
                                timeZone: 'Africa/Cairo',
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                            console.log(`💾 [${timestamp}] Session backup completed`);
                        } catch (e) {
                            console.error(`❌ [${new Date().toLocaleTimeString()}] Backup failed:`, e.message);
                        }
                    }, 5 * 60 * 1000); // 5 minutes
                    
                    console.log('✅ Auto-backup enabled\n');
                    // ================================================
                    
                    // ========== SOLUTION 1: PRESENCE UPDATES (KEEP-ALIVE) ==========
                    // Clear any existing presence interval first!
                    if (presenceInterval) {
                        clearInterval(presenceInterval);
                        console.log('🧹 Cleared old presence interval');
                    }
                    
                    console.log('👋 Starting presence updates (every 45 minutes)...');
                    presenceInterval = setInterval(async () => {
                        if (!sock?.user?.id) {
                            clearInterval(presenceInterval);
                            presenceInterval = null;
                            return;
                        }
                        
                        try {
                            // Send simple presence update only
                            await sock.sendPresenceUpdate('available');
                            
                            const timestamp = new Date().toLocaleTimeString('ar-EG', {
                                timeZone: 'Africa/Cairo',
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                            console.log(`👋 [${timestamp}] Keep-alive sent`);
                        } catch (e) {
                            console.error(`⚠️ Keep-alive failed: ${e.message}`);
                            // Don't clear interval - will retry next time
                        }
                    }, 45 * 60 * 1000); // Every 45 minutes
                    
                    console.log('✅ Keep-alive enabled (prevents idle disconnects)\n');
                    // ===============================================================
                    
                    // ========== NUCLEAR OPTION: PERIODIC RESTART ==========
                    // After 6 hours, do clean restart to prevent stale connections
                    console.log('🔄 Scheduled restart enabled (every 6 hours)...');
                    setTimeout(async () => {
                        console.log('\n⏰ ════════════════════════════════');
                        console.log('   SCHEDULED RESTART (6 HOURS)');
                        console.log('   Preventing stale connections');
                        console.log('════════════════════════════════\n');
                        
                        // Save to MongoDB before restart
                        if (USE_MONGODB) {
                            try {
                                await saveCreds();
                                console.log('💾 Session saved before restart');
                            } catch (e) {}
                        }
                        
                        // Clean exit - Clever Cloud will restart
                        process.exit(0);
                    }, 6 * 60 * 60 * 1000); // 6 hours
                    console.log('✅ Periodic restart enabled\n');
                    // ====================================================
                }
                // ============================================
                
            } else if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال...');
            }
        });

        console.log('✅ البوت جاهز ✨\n');
        
    } catch (error) {
        console.error('❌ Error in startBot:', error.message);
        
        // Reset session flag on error
        isSessionActive = false;
        
        console.log('⏳ Retrying in 30 seconds...\n');
        await delay(30000);
        return startBot();
    }
}

process.on('SIGINT', async () => {
    console.log('\n👋 Shutting down gracefully...\n');
    
    // Close MongoDB connection
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
    console.log('\n👋 Shutting down gracefully...\n');
    
    // Close MongoDB connection
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

require('dotenv').config();
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
const { getAIResponse } = require('./ai');
const islamicModule = require('./islamicModule');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const CONFIG = {
    botName: process.env.BOT_NAME || 'Botly',
    botOwner: process.env.BOT_OWNER || 'مقداد',
    prefix: process.env.PREFIX || '!',
    port: process.env.PORT || 8080,
    replyInGroups: false,
    ownerNumber: '249962204268@s.whatsapp.net', // ⭐ رقمك مباشرة
    showIgnoredMessages: process.env.SHOW_IGNORED_MESSAGES === 'true',
    logLevel: process.env.LOG_LEVEL || 'silent',
    adminNumber: '249962204268@s.whatsapp.net', // ⭐ رقمك
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
console.log(`🤖 AI: ${AI_ENABLED ? '✅' : '❌'}`);
console.log(`📿 القسم الإسلامي: ${islamicModule.isEnabled() ? '✅' : '❌'}`);
console.log(`💾 الجلسة: ${hasSession ? '✅' : '⚠️'}`);
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
        res.end(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🤖 ${CONFIG.botName}</title>
</head>
<body>
    <h1>${CONFIG.botName} متصل</h1>
    <p>البوت يعمل بنجاح</p>
</body>
</html>
        `);
        return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: CONFIG.botName,
        uptime: process.uptime(),
        time: new Date().toISOString()
    }));
});

server.listen(CONFIG.port, () => {
    console.log(`🌐 http://localhost:${CONFIG.port}\n`);
});

const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;
let globalSock = null;
let botStartTime = Date.now();

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
            console.log('⚠️ لا توجد جلسة\n');
            console.log('💡 قم بربط WhatsApp أولاً\n');
            return;
        }
        
        try {
            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
            if (!creds.noiseKey) {
                throw new Error('creds.json تالف');
            }
            console.log('✅ جلسة صالحة\n');
        } catch (e) {
            console.error('❌ الجلسة تالفة:', e.message);
            fs.rmSync(authPath, { recursive: true, force: true });
            return startBot();
        }
        
        console.log('🚀 بدء البوت...\n');
        
        const { version, isLatest } = await fetchLatestBaileysVersion();
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
            getMessage: async () => undefined,
            shouldIgnoreJid: (jid) => jid.endsWith('@newsletter')
        });

        globalSock = sock;
        sock.ev.on('creds.update', saveCreds);
        
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') return;
                
                const msg = messages[0];
                if (!msg || !msg.message) return;
                
                const sender = msg.key.remoteJid;
                const messageId = msg.key.id;
                const isGroup = sender.endsWith('@g.us');
                
                const messageTime = msg.messageTimestamp * 1000;
                if (messageTime < botStartTime - 60000) return;
                
                // ⭐⭐⭐ معالجة Poll للقسم الإسلامي ⭐⭐⭐
                if (msg.message?.pollUpdateMessage) {
                    const handled = await islamicModule.handleMessage(sock, msg);
                    if (handled) {
                        console.log('✅ Poll معالج');
                        return;
                    }
                }
                
                const messageText = 
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption || '';
                
                // أوامر الأدمن
                const adminCommands = ['/تشغيل', '/توقف', '/ban', '/unban', '/id'];
                if (msg.key.fromMe && adminCommands.includes(messageText.trim())) {
                    console.log('\n' + '='.repeat(50));
                    console.log(`📩 أدمن: ${sender}`);
                    console.log(`📝 ${messageText}`);
                    console.log('='.repeat(50));
                    
                    if (messageText.trim() === '/id') {
                        await sock.sendMessage(sender, {
                            text: `📋 معلومات:\n\nChat ID:\n${sender}`
                        }, { quoted: msg });
                        console.log(`📋 ID: ${sender}\n`);
                        return;
                    }
                    
                    if (messageText.trim() === '/تشغيل') {
                        AI_ENABLED = true;
                        saveAIState(true);
                        await sock.sendMessage(sender, {
                            react: { text: '✅', key: msg.key }
                        });
                        console.log('✅ AI مفعّل\n');
                        return;
                    }
                    
                    if (messageText.trim() === '/توقف') {
                        AI_ENABLED = false;
                        saveAIState(false);
                        await sock.sendMessage(sender, {
                            react: { text: '🛑', key: msg.key }
                        });
                        console.log('⏸️ AI معطّل\n');
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
                        console.log(`🚫 محظور: ${sender}\n`);
                        return;
                    }
                    
                    if (messageText.trim() === '/unban') {
                        BANNED_USERS = BANNED_USERS.filter(u => u !== sender);
                        saveBanList(BANNED_USERS);
                        await sock.sendMessage(sender, {
                            react: { text: '✅', key: msg.key }
                        });
                        console.log(`✅ إلغاء حظر: ${sender}\n`);
                        return;
                    }
                }
                
                // أوامر السماح/المنع
                const isAdminInGroup = isGroup && msg.key.participant && 
                    msg.key.participant.includes('249962204268');
                const isAdminDirect = msg.key.fromMe;
                
                if ((isAdminInGroup || isAdminDirect) && 
                    (messageText.trim() === '/سماح' || messageText.trim() === '/منع')) {
                    
                    if (!isGroup) {
                        console.log('⚠️ /سماح يجب في مجموعة\n');
                        return;
                    }
                    
                    if (messageText.trim() === '/سماح') {
                        if (!ALLOWED_GROUPS_LIST.includes(sender)) {
                            ALLOWED_GROUPS_LIST.push(sender);
                            saveAllowedGroupsList(ALLOWED_GROUPS_LIST);
                        }
                        await sock.sendMessage(sender, {
                            text: 'تم السماح'
                        }, { quoted: msg });
                        console.log(`✅ سماح: ${sender}\n`);
                        return;
                    }
                    
                    if (messageText.trim() === '/منع') {
                        ALLOWED_GROUPS_LIST = ALLOWED_GROUPS_LIST.filter(g => g !== sender);
                        saveAllowedGroupsList(ALLOWED_GROUPS_LIST);
                        await sock.sendMessage(sender, {
                            text: 'تم المنع'
                        }, { quoted: msg });
                        console.log(`🚫 منع: ${sender}\n`);
                        return;
                    }
                }
                
                // ⭐⭐⭐ أوامر القسم الإسلامي ⭐⭐⭐
                const isIslamicCommand = await islamicModule.handleIslamicCommand(sock, msg, messageText, sender);
                if (isIslamicCommand) {
                    console.log('✅ أمر إسلامي');
                    return;
                }
                
                if (msg.key.fromMe) return;
                if (sender.endsWith('@newsletter')) return;
                if (BANNED_USERS.includes(sender)) return;
                
                if (CONFIG.blockedContacts.length > 0) {
                    const isBlocked = CONFIG.blockedContacts.some(blocked => sender.includes(blocked));
                    if (isBlocked) return;
                }
                
                if (isGroup) {
                    const isAllowedByCommand = ALLOWED_GROUPS_LIST.includes(sender);
                    const isAllowedByEnv = CONFIG.allowedGroups.length > 0 && 
                        CONFIG.allowedGroups.some(groupId => sender.includes(groupId));
                    
                    if (!isAllowedByCommand && !isAllowedByEnv) return;
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
                            console.log('✅ رد\n');
                        }
                    }
                } catch (error) {
                    console.error('❌ خطأ:', error.message);
                }
                
            } catch (error) {
                if (!error.message?.includes('Bad MAC')) {
                    console.error('❌ خطأ:', error.message);
                }
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`\n⚠️ مغلق - كود: ${statusCode}\n`);
                
                if (statusCode === DisconnectReason.loggedOut || statusCode === 401 || statusCode === 403) {
                    console.error('❌ جلسة غير صالحة\n');
                    fs.rmSync(authPath, { recursive: true, force: true });
                    await delay(10000);
                    sock.end();
                    await startBot();
                    return;
                }
                
                console.log(`🔄 إعادة الاتصال...\n`);
                await delay(5000);
                sock.end();
                await startBot();
                
            } else if (connection === 'open') {
                console.log('✅ ════════════════════════════════════');
                console.log(`   متصل بنجاح! 🎉`);
                console.log(`   ${CONFIG.botName}`);
                console.log(`   ${sock.user?.id?.split(':')[0] || '---'}`);
                console.log(`   AI: ${AI_ENABLED ? '✅' : '❌'}`);
                console.log(`   القسم الإسلامي: ${islamicModule.isEnabled() ? '✅' : '❌'}`);
                console.log('════════════════════════════════════\n');
                
                processedMessages.clear();
                botStartTime = Date.now();
                
                // ⭐ بدء جدولة القسم الإسلامي
                if (islamicModule.isEnabled()) {
                    await islamicModule.startIslamicSchedule(sock);
                }
                
                // ⭐⭐⭐ لا رسالة اتصال تلقائية ⭐⭐⭐
                
            } else if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال...');
            }
        });

        console.log('✅ البوت جاهز\n');
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        console.log('⏳ إعادة المحاولة...\n');
        await delay(30000);
        return startBot();
    }
}

process.on('SIGINT', () => {
    console.log('\n👋 إيقاف...\n');
    islamicModule.stopIslamicSchedule();
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 إيقاف...\n');
    islamicModule.stopIslamicSchedule();
    server.close();
    process.exit(0);
});

startBot();

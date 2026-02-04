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
const { getAIResponse } = require('./ai');
const islamicModule = require('./islamicModule'); // ⭐ إضافة القسم الإسلامي

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════
// 🔧 الإعدادات
// ═══════════════════════════════════════════════════════════

const CONFIG = {
    botName: process.env.BOT_NAME || 'Botly',
    botOwner: process.env.BOT_OWNER || 'مقداد',
    prefix: process.env.PREFIX || '!',
    port: process.env.PORT || 8080,
    replyInGroups: false, // ⭐ دائماً false - استخدم /سماح للمجموعات
    ownerNumber: process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER + '@s.whatsapp.net' : null,
    showIgnoredMessages: process.env.SHOW_IGNORED_MESSAGES === 'true',
    logLevel: process.env.LOG_LEVEL || 'silent',
    sessionFile: process.env.SESSION_FILE || 'session.json',
    adminNumber: '249962204268@s.whatsapp.net', // ⭐ رقم الأدمن
    // ⭐ القروبات المسموح الرد فيها من ENV (افصلها بفاصلة)
    allowedGroups: process.env.ALLOWED_GROUPS ? process.env.ALLOWED_GROUPS.split(',').map(g => g.trim()) : [],
    // ⭐ الأرقام المحظورة (افصلها بفاصلة)
    blockedContacts: process.env.BLOCKED_CONTACTS ? process.env.BLOCKED_CONTACTS.split(',').map(c => c.trim()) : []
};

// ═══════════════════════════════════════════════════════════
// 💾 حفظ حالة الـ AI في ملف (حل جذري نهائي)
// ═══════════════════════════════════════════════════════════

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
        console.log('⚠️ خطأ في قراءة حالة AI، استخدام القيمة الافتراضية');
    }
    // لو الملف مو موجود، القيمة الافتراضية: false (متوقف)
    return false;
}

function saveAIState(enabled) {
    try {
        fs.writeFileSync(AI_STATE_FILE, JSON.stringify({ enabled }), 'utf-8');
    } catch (error) {
        console.error('❌ خطأ في حفظ حالة AI:', error.message);
    }
}

// ⭐ قائمة المحظورين
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

// ⭐ المجموعات المسموحة (من الأوامر)
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

// ⭐ تحميل حالة الـ AI من الملف (تبقى حتى بعد restart)
let AI_ENABLED = loadAIState();
let BANNED_USERS = loadBanList();
let ALLOWED_GROUPS_LIST = loadAllowedGroupsList();

const AI_CONFIG = {
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 500,
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7
};

console.log('\n⚙️ ═══════ إعدادات البوت ═══════');
console.log(`📱 اسم البوت: ${CONFIG.botName}`);
console.log(`👤 المالك: ${CONFIG.botOwner}`);
console.log(`👥 الرد في المجموعات: ${CONFIG.replyInGroups ? '✅' : '❌'}`);
console.log(`🤖 AI: ${AI_ENABLED ? '✅ مفعّل' : '❌ معطّل'}`);
console.log(`📿 القسم الإسلامي: ${islamicModule.isEnabled() ? '✅ مفعّل' : '❌ معطّل'}`); // ⭐ إضافة
console.log(`📁 ملف الجلسة: ${CONFIG.sessionFile}`);
console.log('═══════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════
// 🌐 HTTP Server + Keep-Alive
// ═══════════════════════════════════════════════════════════

let requestCount = 0;

const server = http.createServer((req, res) => {
    requestCount++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: CONFIG.botName,
        uptime: process.uptime(),
        requests: requestCount,
        time: new Date().toISOString()
    }));
});

server.listen(CONFIG.port, () => {
    console.log(`🌐 HTTP Server: http://localhost:${CONFIG.port}`);
});

setInterval(() => {
    const url = `http://localhost:${CONFIG.port}`;
    http.get(url, (res) => {
        console.log(`💓 Keep-alive ping: ${res.statusCode}`);
    }).on('error', () => {});
}, 5 * 60 * 1000);

// ═══════════════════════════════════════════════════════════
// 💾 تحميل الجلسة
// ═══════════════════════════════════════════════════════════

function loadSessionFromFile() {
    try {
        console.log(`🔐 تحميل الجلسة من: ${CONFIG.sessionFile}...`);
        
        const sessionPath = path.join(__dirname, CONFIG.sessionFile);
        
        if (!fs.existsSync(sessionPath)) {
            throw new Error(`ملف الجلسة غير موجود: ${CONFIG.sessionFile}`);
        }
        
        const fileContent = fs.readFileSync(sessionPath, 'utf-8').trim();
        const sessionData = JSON.parse(fileContent);
        
        const authPath = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
        }
        fs.mkdirSync(authPath, { recursive: true });
        
        for (const [filename, content] of Object.entries(sessionData)) {
            fs.writeFileSync(path.join(authPath, filename), content);
        }
        
        const creds = JSON.parse(fs.readFileSync(path.join(authPath, 'creds.json'), 'utf-8'));
        if (!creds.noiseKey) {
            throw new Error('creds.json غير مكتمل');
        }
        
        console.log('✅ تم تحميل الجلسة بنجاح\n');
        return true;
        
    } catch (error) {
        console.error(`❌ فشل تحميل الجلسة: ${error.message}\n`);
        process.exit(1);
    }
}

// ═══════════════════════════════════════════════════════════
// 📊 متغيرات + ذاكرة مؤقتة
// ═══════════════════════════════════════════════════════════

const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let globalSock = null;
let isReconnecting = false;

// ⭐ كشف البوت المعلق (متصل لكن لا يستقبل رسائل)
let lastMessageTime = Date.now();
const HEARTBEAT_INTERVAL = 10 * 60 * 1000; // 10 دقائق

setInterval(() => {
    const timeSinceLastMessage = Date.now() - lastMessageTime;
    
    // لو مر أكثر من 15 دقيقة بدون رسائل، قد يكون البوت معلق
    if (globalSock && timeSinceLastMessage > 15 * 60 * 1000) {
        console.log('⚠️ تحذير: لم يتم استقبال رسائل منذ 15 دقيقة');
        console.log('🔄 قد يكون البوت معلق - سيتم المراقبة...\n');
        
        // لو مر 30 دقيقة، أعد التشغيل
        if (timeSinceLastMessage > 30 * 60 * 1000) {
            console.log('❌ البوت معلق! إعادة تشغيل...\n');
            process.exit(1); // Clever Cloud سيعيد التشغيل تلقائياً
        }
    }
}, HEARTBEAT_INTERVAL);

// ⭐ ذاكرة مؤقتة لآخر 5 رسائل لكل مستخدم
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

// ═══════════════════════════════════════════════════════════
// 🤖 بدء البوت
// ═══════════════════════════════════════════════════════════

async function startBot() {
    try {
        console.log('🚀 بدء البوت...\n');
        
        loadSessionFromFile();
        
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')}, أحدث: ${isLatest ? '✅' : '⚠️'}\n`);
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
            },
            printQRInTerminal: false,
            logger: P({ level: 'fatal' }),
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            
            syncFullHistory: false,
            markOnlineOnConnect: true,
            emitOwnEvents: false,
            generateHighQualityLinkPreview: false,
            
            defaultQueryTimeoutMs: undefined,
            getMessage: async (key) => {
                return { conversation: '' };
            },
            
            // ⭐ إعدادات لتقليل مشاكل الجلسات وحل Bad MAC Error
            retryRequestDelayMs: 250,
            maxMsgRetryCount: 5,
            msgRetryCounterMap: {},
            connectTimeoutMs: 60000,
            
            // ⭐ تفعيل إعادة المزامنة التلقائية
            syncFullHistory: false,
            fireInitQueries: true,
            
            // ⭐ تقليل التحذيرات
            shouldIgnoreJid: (jid) => jid.endsWith('@newsletter')
        });

        globalSock = sock;

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.error('\n❌ خطأ: تم طلب QR!\n');
                process.exit(1);
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                console.log(`\n❌ الاتصال مغلق - كود: ${statusCode}\n`);
                
                if (isReconnecting) {
                    console.log('⏭️ إعادة اتصال جارية...\n');
                    return;
                }
                
                if (statusCode === DisconnectReason.loggedOut ||
                    statusCode === 401 || statusCode === 403) {
                    console.error('❌ الجلسة غير صالحة!\n');
                    process.exit(1);
                }
                
                if (statusCode === DisconnectReason.badSession || statusCode === 500) {
                    console.log('⚠️ خطأ 500/badSession - إعادة تشغيل كاملة...\n');
                    
                    // ⭐ إعادة تشغيل كاملة بدلاً من reconnect جزئي
                    if (globalSock) {
                        try {
                            globalSock.end(undefined);
                        } catch (e) {}
                        globalSock = null;
                    }
                    
                    isReconnecting = true;
                    await delay(10000);
                    isReconnecting = false;
                    
                    // ⭐ إعادة تشغيل كاملة
                    reconnectAttempts = 0;
                    return startBot();
                }
                
                if (statusCode === 440 || statusCode === DisconnectReason.connectionReplaced) {
                    console.log('⚠️ خطأ 440 - انتظار 15 ثانية...\n');
                    isReconnecting = true;
                    await delay(15000);
                    isReconnecting = false;
                    reconnectWithDelay(15000);
                    return;
                }
                
                if (statusCode === 515) {
                    console.log('⚠️ خطأ 515 - انتظار 5 ثوانٍ...\n');
                    isReconnecting = true;
                    await delay(5000);
                    isReconnecting = false;
                    reconnectWithDelay(5000);
                    return;
                }
                
                reconnectWithDelay();
                
            } else if (connection === 'open') {
                console.log('✅ ════════════════════════════════════');
                console.log(`   متصل بواتساب بنجاح! 🎉`);
                console.log(`   البوت: ${CONFIG.botName}`);
                console.log(`   الرقم: ${sock.user?.id?.split(':')[0] || '---'}`);
                console.log(`   AI: ${AI_ENABLED ? '✅' : '❌'}`);
                console.log(`   القسم الإسلامي: ${islamicModule.isEnabled() ? '✅' : '❌'}`); // ⭐ إضافة
                console.log('════════════════════════════════════\n');
                
                reconnectAttempts = 0;
                isReconnecting = false;
                processedMessages.clear();
                
                // ⭐ بدء القسم الإسلامي
                if (islamicModule.isEnabled()) {
                    islamicModule.startIslamicSchedule(sock);
                }
                
                if (CONFIG.ownerNumber) {
                    try {
                        await delay(3000);
                        await sock.sendMessage(CONFIG.ownerNumber, {
                            text: `✅ *${CONFIG.botName} متصل*\n\n📱 ${sock.user.id.split(':')[0]}\n⏰ ${new Date().toLocaleString('ar-EG')}`
                        });
                    } catch (e) {
                        console.log('⚠️ لم يتم إرسال إشعار\n');
                    }
                }
                
            } else if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال...');
            }
        });

        // ═══════════════════════════════════════════════════════════
        // 💬 معالجة الرسائل
        // ═══════════════════════════════════════════════════════════
        
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                // ⭐ تحديث وقت آخر رسالة (للكشف عن البوت المعلق)
                lastMessageTime = Date.now();
                
                if (type !== 'notify') return;
                
                const msg = messages[0];
                if (!msg || !msg.message) return;
                
                const sender = msg.key.remoteJid;
                const messageId = msg.key.id;
                const isGroup = sender.endsWith('@g.us');
                
                // ⭐ استخراج نص الرسالة
                const messageText = 
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption || '';
                
                // ⭐ فحص أوامر الأدمن أولاً (حتى لو fromMe)
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
                        saveAIState(true); // ⭐ حفظ الحالة في الملف
                        // ⭐ تفاعل بعلامة ✅
                        await sock.sendMessage(sender, {
                            react: { text: '✅', key: msg.key }
                        });
                        console.log('✅ AI تم تشغيله بواسطة الأدمن\n');
                        return;
                    }
                    
                    if (messageText.trim() === '/توقف') {
                        AI_ENABLED = false;
                        saveAIState(false); // ⭐ حفظ الحالة في الملف
                        // ⭐ تفاعل بعلامة 🛑
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
                
                // ⭐ فحص أوامر المجموعات 
                // في المجموعات، participant قد يكون LID أو رقم هاتف
                // نحتاج التحقق من كلاهما
                const isAdminInGroup = isGroup && msg.key.participant && (
                    msg.key.participant.includes('249962204268') || // رقم الهاتف
                    msg.key.participant.includes('231211024814174') // ⭐ الـ LID الخاص بك
                );
                const isAdminDirect = msg.key.fromMe;
                
                // Debug log للمجموعات
                if (isGroup && (messageText.trim() === '/سماح' || messageText.trim() === '/منع')) {
                    console.log(`🔍 [DEBUG] Group command detected!`);
                    console.log(`🔍 [DEBUG] participant: ${msg.key.participant}`);
                    console.log(`🔍 [DEBUG] isAdminInGroup: ${isAdminInGroup}`);
                    console.log(`🔍 [DEBUG] isAdminDirect: ${isAdminDirect}`);
                }
                
                // ⭐ الطريقة البديلة: أرسل "سماح GROUP_ID" في محادثة خاصة
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
                
                // الطريقة الأصلية (في المجموعة نفسها)
                if ((isAdminInGroup || isAdminDirect) && (messageText.trim() === '/سماح' || messageText.trim() === '/منع')) {
                    if (!isGroup) {
                        // لو الأمر مرسول خارج مجموعة، تجاهله
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
                
                // ⭐ معالجة أوامر القسم الإسلامي
                const isIslamicCommand = await islamicModule.handleIslamicCommand(sock, msg, messageText, sender);
                if (isIslamicCommand) return;
                                
                // ⭐ تجاهل باقي الرسائل من نفسك
                if (msg.key.fromMe) return;
                
                if (sender.endsWith('@newsletter')) {
                    if (CONFIG.showIgnoredMessages) {
                        console.log('⏭️ رسالة من قناة - متجاهلة');
                    }
                    return;
                }
                
                // ⭐ فحص قائمة المحظورين (من الأوامر)
                if (BANNED_USERS.includes(sender)) {
                    if (CONFIG.showIgnoredMessages) {
                        console.log('⏭️ مستخدم محظور - متجاهل');
                    }
                    return;
                }
                
                // ⭐ فحص الأرقام المحظورة (من ENV)
                if (CONFIG.blockedContacts.length > 0) {
                    const isBlocked = CONFIG.blockedContacts.some(blocked => sender.includes(blocked));
                    if (isBlocked) {
                        if (CONFIG.showIgnoredMessages) {
                            console.log('⏭️ رقم محظور من ENV - متجاهل');
                        }
                        return;
                    }
                }
                
                // ⭐ فحص المجموعات: البوت لا يرد في أي مجموعة إلا المسموحة بأمر /سماح
                if (isGroup) {
                    // تحقق من قائمة المجموعات المسموحة (من الأوامر)
                    const isAllowedByCommand = ALLOWED_GROUPS_LIST.includes(sender);
                    
                    // تحقق من قائمة ENV
                    const isAllowedByEnv = CONFIG.allowedGroups.length > 0 && 
                                          CONFIG.allowedGroups.some(groupId => sender.includes(groupId));
                    
                    // Debug
                    console.log(`🔍 [GROUP CHECK] ${sender}`);
                    console.log(`🔍 isAllowedByCommand: ${isAllowedByCommand}`);
                    console.log(`🔍 isAllowedByEnv: ${isAllowedByEnv}`);
                    console.log(`🔍 ALLOWED_GROUPS_LIST: ${JSON.stringify(ALLOWED_GROUPS_LIST)}`);
                    console.log(`🔍 CONFIG.allowedGroups: ${JSON.stringify(CONFIG.allowedGroups)}`);
                    
                    // لو المجموعة مش مسموحة لا بالأوامر ولا بالـ ENV
                    if (!isAllowedByCommand && !isAllowedByEnv) {
                        if (CONFIG.showIgnoredMessages) {
                            console.log('⏭️ مجموعة غير مسموحة - متجاهل');
                        }
                        return;
                    }
                }
                
                if (sender === 'status@broadcast') return;
                if (processedMessages.has(messageId)) return;
                
                const messageTime = msg.messageTimestamp * 1000;
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

                // ⭐ حفظ الرسالة في الذاكرة المؤقتة
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
                console.error('❌ خطأ في معالجة الرسالة:', error);
            }
        });

        console.log('✅ البوت جاهز ✨\n');
        
    } catch (error) {
        console.error('❌ خطأ في بدء البوت:', error);
        await delay(10000);
        reconnectWithDelay(10000);
    }
}

function reconnectWithDelay(customDelay = null) {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('❌ فشل بعد عدة محاولات\n');
        process.exit(1);
    }
    
    reconnectAttempts++;
    const delayTime = customDelay || (5000 * reconnectAttempts);
    
    console.log(`🔄 إعادة المحاولة بعد ${delayTime/1000}ث (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})\n`);
    setTimeout(startBot, delayTime);
}

process.on('SIGINT', () => {
    console.log('\n👋 إيقاف...\n');
    islamicModule.stopIslamicSchedule(); // ⭐ إيقاف الجدولة عند الإغلاق
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 إيقاف...\n');
    islamicModule.stopIslamicSchedule(); // ⭐ إيقاف الجدولة عند الإغلاق
    server.close();
    process.exit(0);
});

startBot();

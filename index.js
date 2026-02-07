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

// ⭐⭐⭐ التحقق من وجود جلسة في الـ repo ⭐⭐⭐
const authPath = path.join(__dirname, 'auth_info');
const hasSession = fs.existsSync(authPath) && fs.existsSync(path.join(authPath, 'creds.json'));

console.log('\n⚙️ ═══════ إعدادات البوت ═══════');
console.log(`📱 اسم البوت: ${CONFIG.botName}`);
console.log(`👤 المالك: ${CONFIG.botOwner}`);
console.log(`👥 الرد في المجموعات: ${CONFIG.replyInGroups ? '✅' : '❌'}`);
console.log(`🤖 AI: ${AI_ENABLED ? '✅ مفعّل' : '❌ معطّل'}`);
console.log(`📿 القسم الإسلامي: ${islamicModule.isEnabled() ? '✅ مفعّل' : '❌ معطّل'}`);
console.log(`💾 الجلسة: ${hasSession ? 'موجودة في الـ repo ✅' : '⚠️ غير موجودة - سيتم إنشاء جلسة جديدة'}`);
console.log('═══════════════════════════════════\n');

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
        console.log(`💓 Keep-alive: ${res.statusCode}`);
    }).on('error', () => {});
}, 5 * 60 * 1000);

// ⭐⭐⭐ دوال إنشاء الجلسة ⭐⭐⭐
function generateQRLinks(qrData) {
    const encoded = encodeURIComponent(qrData);
    return {
        primary: `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encoded}`,
        alternative: `https://chart.googleapis.com/chart?chs=500x500&cht=qr&chl=${encoded}`
    };
}

function displayQRLinks(links, attempt) {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log(`║          📱 QR Code #${attempt} - امسحه الآن!                ║`);
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    console.log('🔗 الروابط:');
    console.log(`\n1️⃣ ${links.primary}\n`);
    console.log(`2️⃣ ${links.alternative}\n`);
    console.log('═'.repeat(60) + '\n');
}

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
    
    let qrAttempt = 0;
    const MAX_QR_ATTEMPTS = 10;
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
            getMessage: async () => ({ conversation: '' })
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
            }, 10 * 60 * 1000); // 10 دقائق
            
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                if (qr) {
                    qrAttempt++;
                    if (qrAttempt > MAX_QR_ATTEMPTS) {
                        console.error('\n❌ تجاوز الحد الأقصى لمحاولات QR\n');
                        console.log('🔄 سيتم إعادة المحاولة...\n');
                        connectionResolved = true;
                        clearTimeout(timeoutId);
                        sock.end();
                        reject(new Error('max_qr_attempts'));
                        return;
                    }
                    const links = generateQRLinks(qr);
                    displayQRLinks(links, qrAttempt);
                }
                
                if (connection === 'close') {
                    if (connectionResolved) return; // تجنب المعالجة المكررة
                    
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log(`\n⚠️ الاتصال مغلق - كود: ${statusCode}`);
                    
                    // الأكواد التي تحتاج إعادة محاولة
                    if (statusCode === 515 || statusCode === 503 || statusCode === 408 || !statusCode) {
                        console.log('🔄 سيتم إعادة المحاولة...\n');
                        connectionResolved = true;
                        clearTimeout(timeoutId);
                        sock.end();
                        reject(new Error(`retry_${statusCode || 'unknown'}`));
                        return;
                    }
                    
                    // الأكواد الأخرى
                    console.log(`❌ خطأ غير قابل للإصلاح: ${statusCode}\n`);
                    connectionResolved = true;
                    clearTimeout(timeoutId);
                    sock.end();
                    reject(new Error(`fatal_${statusCode}`));
                }
                
                if (connection === 'open') {
                    connectionResolved = true;
                    clearTimeout(timeoutId);
                    
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
        
        // إعادة المحاولة تلقائياً
        if (error.message.startsWith('retry_') || 
            error.message === 'timeout' || 
            error.message === 'max_qr_attempts') {
            console.log(`⏳ انتظار 10 ثواني قبل المحاولة التالية...\n`);
            await delay(10000);
            return generateNewSession(attemptNumber + 1);
        }
        
        throw error;
    }
}

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
        // ⭐⭐⭐ التحقق من وجود جلسة في الـ repo ⭐⭐⭐
        const authPath = path.join(__dirname, 'auth_info');
        const credsPath = path.join(authPath, 'creds.json');
        
        if (!fs.existsSync(authPath) || !fs.existsSync(credsPath)) {
            console.log('⚠️ لا توجد جلسة - سيتم إنشاء جلسة جديدة\n');
            
            try {
                await generateNewSession();
            } catch (error) {
                console.error('❌ فشل إنشاء الجلسة:', error.message);
                console.log('⏳ سيتم المحاولة مرة أخرى بعد 60 ثانية...\n');
                await delay(60000);
                return startBot(); // إعادة المحاولة
            }
            
            // بعد إنشاء الجلسة، إعادة تشغيل
            console.log('🔄 إعادة التشغيل للاتصال بالجلسة الجديدة...\n');
            await delay(3000);
            process.exit(0);
        }
        
        // التحقق من صحة الجلسة
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
                return startBot(); // إعادة المحاولة
            }
            
            await delay(3000);
            process.exit(0);
        }
        
        console.log('🚀 بدء البوت...\n');
        
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')}, أحدث: ${isLatest ? '✅' : '⚠️'}\n`);
        
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
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            
            msgRetryCounterCache,
            
            getMessage: async (key) => {
                return { conversation: '' };
            },
            
            shouldIgnoreJid: (jid) => jid.endsWith('@newsletter')
        });

        globalSock = sock;

        // حفظ الجلسة محلياً فقط
        sock.ev.on('creds.update', saveCreds);
        
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                // ⭐ تنظيف cache بشكل صحيح لتجنب Bad MAC
                if (msgRetryCounterCache) {
                    try {
                        msgRetryCounterCache.flushAll();
                    } catch (e) {
                        // تجاهل الأخطاء
                    }
                }
                
                if (type !== 'notify') return;
                
                const msg = messages[0];
                if (!msg || !msg.message) return;
                
                const sender = msg.key.remoteJid;
                const messageId = msg.key.id;
                const isGroup = sender.endsWith('@g.us');
                
                const messageTime = msg.messageTimestamp * 1000;
                if (messageTime < botStartTime - 60000) {
                    return;
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
                
                const isIslamicCommand = await islamicModule.handleIslamicCommand(sock, msg, messageText, sender);
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
                if (!error.message.includes('Bad MAC')) {
                    console.error('❌ خطأ في معالجة الرسالة:', error.message);
                }
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.error('\n❌ خطأ: تم طلب QR بعد تحميل الجلسة!\n');
                console.error('⚠️ الجلسة تالفة - حذفها وإعادة المحاولة...\n');
                
                fs.rmSync(authPath, { recursive: true, force: true });
                
                console.log('⏳ إعادة المحاولة بعد 10 ثواني...\n');
                await delay(10000);
                
                // إعادة تشغيل البوت
                sock.end();
                await startBot();
                return;
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                console.log(`\n⚠️ الاتصال مغلق - كود: ${statusCode}\n`);
                
                if (statusCode === DisconnectReason.loggedOut ||
                    statusCode === 401 || statusCode === 403) {
                    console.error('❌ الجلسة غير صالحة - حذفها...\n');
                    
                    fs.rmSync(authPath, { recursive: true, force: true });
                    
                    console.log('⏳ إعادة المحاولة بعد 10 ثواني...\n');
                    await delay(10000);
                    
                    sock.end();
                    await startBot();
                    return;
                }
                
                // أخطاء أخرى - إعادة الاتصال
                console.log(`🔄 إعادة الاتصال بعد 5 ثواني...\n`);
                await delay(5000);
                
                sock.end();
                await startBot();
                
            } else if (connection === 'open') {
                console.log('✅ ════════════════════════════════════');
                console.log(`   متصل بواتساب بنجاح! 🎉`);
                console.log(`   البوت: ${CONFIG.botName}`);
                console.log(`   الرقم: ${sock.user?.id?.split(':')[0] || '---'}`);
                console.log(`   AI: ${AI_ENABLED ? '✅' : '❌'}`);
                console.log(`   القسم الإسلامي: ${islamicModule.isEnabled() ? '✅' : '❌'}`);
                console.log('════════════════════════════════════\n');
                
                processedMessages.clear();
                botStartTime = Date.now();
                
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

        console.log('✅ البوت جاهز ✨\n');
        
    } catch (error) {
        console.error('❌ خطأ في بدء البوت:', error);
        console.log('⏳ إعادة المحاولة بعد 30 ثانية...\n');
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


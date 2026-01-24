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
const { getAIResponse } = require('./ai'); // ⭐ استيراد AI من ملف منفصل

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════
// 🔧 الإعدادات
// ═══════════════════════════════════════════════════════════

const CONFIG = {
    botName: process.env.BOT_NAME || 'Botly',
    botOwner: process.env.BOT_OWNER || 'مقداد',
    prefix: process.env.PREFIX || '!',
    port: process.env.PORT || 8080,
    replyInGroups: process.env.REPLY_IN_GROUPS === 'true',
    ownerNumber: process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER + '@s.whatsapp.net' : null,
    showIgnoredMessages: process.env.SHOW_IGNORED_MESSAGES === 'true',
    logLevel: process.env.LOG_LEVEL || 'silent',
    sessionFile: process.env.SESSION_FILE || 'session.json'
};

const AI_CONFIG = {
    enabled: process.env.AI_ENABLED === 'true',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 500,
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7
};

console.log('\n⚙️ ═══════ إعدادات البوت ═══════');
console.log(`📱 اسم البوت: ${CONFIG.botName}`);
console.log(`👤 المالك: ${CONFIG.botOwner}`);
console.log(`👥 الرد في المجموعات: ${CONFIG.replyInGroups ? '✅' : '❌'}`);
console.log(`🤖 AI: ${AI_CONFIG.enabled ? '✅ مفعّل' : '❌ معطّل'}`);
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

// ⭐ Keep-Alive: ping نفسك كل 5 دقائق لمنع النوم
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
// 📊 متغيرات
// ═══════════════════════════════════════════════════════════

const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let globalSock = null;
let isReconnecting = false;

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
            logger: P({ level: CONFIG.logLevel }),
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            
            syncFullHistory: false,
            markOnlineOnConnect: true,
            emitOwnEvents: false,
            
            defaultQueryTimeoutMs: undefined,
            getMessage: async () => ({ conversation: '' })
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
                
                // جلسة فاسدة
                if (statusCode === DisconnectReason.badSession || 
                    statusCode === DisconnectReason.loggedOut ||
                    statusCode === 401 || statusCode === 403) {
                    console.error('❌ الجلسة غير صالحة!\n');
                    process.exit(1);
                }
                
                // 440
                if (statusCode === 440 || statusCode === DisconnectReason.connectionReplaced) {
                    console.log('⚠️ خطأ 440 - انتظار 15 ثانية...\n');
                    isReconnecting = true;
                    await delay(15000);
                    isReconnecting = false;
                    reconnectWithDelay(15000);
                    return;
                }
                
                // 515
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
                console.log(`   AI: ${AI_CONFIG.enabled ? '✅' : '❌'}`);
                console.log('════════════════════════════════════\n');
                
                reconnectAttempts = 0;
                isReconnecting = false;
                processedMessages.clear();
                
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
                if (type !== 'notify') return;
                
                const msg = messages[0];
                if (!msg || !msg.message || msg.key.fromMe) return;
                
                const sender = msg.key.remoteJid;
                const messageId = msg.key.id;
                const isGroup = sender.endsWith('@g.us');
                
                // ⭐ تجاهل القنوات (Newsletters)
                if (sender.endsWith('@newsletter')) {
                    if (CONFIG.showIgnoredMessages) {
                        console.log('⏭️ رسالة من قناة - متجاهلة');
                    }
                    return;
                }
                
                if (isGroup && !CONFIG.replyInGroups) return;
                if (sender === 'status@broadcast') return;
                if (processedMessages.has(messageId)) return;
                
                const messageTime = msg.messageTimestamp * 1000;
                if (Date.now() - messageTime > 60000) return;
                
                const messageType = Object.keys(msg.message)[0];
                if (['protocolMessage', 'senderKeyDistributionMessage', 'reactionMessage'].includes(messageType)) return;
                
                const messageText = 
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption || '';

                if (!messageText.trim()) return;

                console.log('\n' + '='.repeat(50));
                console.log(`📩 ${isGroup ? '👥' : '👤'}: ${sender}`);
                console.log(`📝 ${messageText}`);
                console.log('='.repeat(50));

                processedMessages.add(messageId);
                cleanProcessedMessages();

                // ⭐ الرد بالـ AI
                try {
                    let replyText;
                    
                    if (AI_CONFIG.enabled) {
                        const aiResponse = await getAIResponse(messageText, AI_CONFIG);
                        replyText = aiResponse || `أهلين`;
                    } else {
                        replyText = `أهلين`;
                    }

                    await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
                    console.log('✅ تم الرد\n');
                    
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
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 إيقاف...\n');
    server.close();
    process.exit(0);
});

startBot();

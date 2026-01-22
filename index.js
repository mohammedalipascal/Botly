require('dotenv').config();
const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
    useMultiFileAuthState, 
    DisconnectReason, 
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════
// 🔧 دالة Delay مخصصة
// ═══════════════════════════════════════════════════════════
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════
// 🔧 الإعدادات من ملف .env
// ═══════════════════════════════════════════════════════════

const CONFIG = {
    botName: process.env.BOT_NAME || 'Botly',
    botOwner: process.env.BOT_OWNER || 'مقداد',
    prefix: process.env.PREFIX || '!',
    port: process.env.PORT || 8080,
    replyInGroups: process.env.REPLY_IN_GROUPS === 'true',
    ownerNumber: process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER + '@s.whatsapp.net' : null,
    sessionData: process.env.SESSION_DATA || null,
    showIgnoredMessages: process.env.SHOW_IGNORED_MESSAGES === 'true',
    logLevel: process.env.LOG_LEVEL || 'silent'
};

console.log('\n⚙️ ═══════ إعدادات البوت ═══════');
console.log(`📱 اسم البوت: ${CONFIG.botName}`);
console.log(`👤 المالك: ${CONFIG.botOwner}`);
console.log(`🔰 البادئة: ${CONFIG.prefix}`);
console.log(`👥 الرد في المجموعات: ${CONFIG.replyInGroups ? '✅ نعم' : '❌ لا'}`);
console.log(`🔐 وضع الجلسة: ${CONFIG.sessionData ? '✅ من ENV' : '📱 سيتم طلب QR'}`);
console.log('═══════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════
// 🌐 سيرفر HTTP للحفاظ على النشاط
// ═══════════════════════════════════════════════════════════

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: CONFIG.botName,
        owner: CONFIG.botOwner,
        groups: CONFIG.replyInGroups,
        time: new Date().toISOString()
    }));
});

server.listen(CONFIG.port, () => {
    console.log(`🌐 HTTP Server running on port ${CONFIG.port}`);
});

// ═══════════════════════════════════════════════════════════
// 💾 إدارة بيانات الجلسة
// ═══════════════════════════════════════════════════════════

async function loadSessionFromEnv() {
    if (!CONFIG.sessionData || CONFIG.sessionData.trim() === '') {
        console.log('⚠️ لا توجد بيانات جلسة في ENV');
        return null;
    }
    
    try {
        console.log('🔐 تحميل الجلسة من ENV...');
        
        // التحقق من صحة البيانات
        const sessionStr = CONFIG.sessionData.trim();
        if (sessionStr.length < 50) {
            throw new Error('بيانات الجلسة قصيرة جداً');
        }
        
        const decoded = Buffer.from(sessionStr, 'base64').toString('utf-8');
        const session = JSON.parse(decoded);
        
        // التحقق من وجود المفاتيح الأساسية
        if (!session.creds || !session.creds.noiseKey) {
            throw new Error('بيانات الجلسة غير كاملة');
        }
        
        // إنشاء مجلد auth_info
        const authPath = path.join(__dirname, 'auth_info');
        if (!fs.existsSync(authPath)) {
            fs.mkdirSync(authPath, { recursive: true });
        }
        
        // حفظ creds.json
        fs.writeFileSync(
            path.join(authPath, 'creds.json'),
            JSON.stringify(session.creds, null, 2)
        );
        
        console.log('✅ تم تحميل الجلسة بنجاح من ENV');
        return true;
    } catch (error) {
        console.error('❌ فشل تحميل الجلسة من ENV:', error.message);
        console.log('📱 سيتم طلب مسح QR Code...');
        
        // حذف ملفات الجلسة التالفة
        const authPath = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('🗑️ تم حذف بيانات الجلسة التالفة');
        }
        
        return null;
    }
}

async function saveSessionToEnv(state) {
    try {
        const credsPath = path.join(__dirname, 'auth_info', 'creds.json');
        
        if (!fs.existsSync(credsPath)) {
            console.log('⏳ انتظار حفظ بيانات الاعتماد...');
            return null;
        }
        
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
        
        // إنشاء كائن الجلسة
        const sessionObj = {
            creds: creds
        };
        
        const sessionString = Buffer.from(JSON.stringify(sessionObj)).toString('base64');
        
        console.log('\n\n');
        console.log('═'.repeat(70));
        console.log('🎉 تم إنشاء الجلسة بنجاح!');
        console.log('═'.repeat(70));
        console.log('\n📋 انسخ السطر التالي وأضفه في ملف .env:\n');
        console.log(`SESSION_DATA=${sessionString}`);
        console.log('\n' + '═'.repeat(70));
        console.log('⚠️ مهم جداً:');
        console.log('1. احفظ هذا الكود في مكان آمن');
        console.log('2. لا تشاركه مع أحد أبداً');
        console.log('3. أضفه في ملف .env وأعد تشغيل البوت');
        console.log('4. بعد إضافته، لن تحتاج لمسح QR Code مرة أخرى');
        console.log('═'.repeat(70) + '\n\n');
        
        return sessionString;
        
    } catch (error) {
        console.error('❌ خطأ في حفظ الجلسة:', error.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════
// 📊 تتبع الرسائل والإحصائيات
// ═══════════════════════════════════════════════════════════

const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;

let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let botStartTime = Date.now();
let sessionString = null;
let globalSock = null;

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
// 📱 عرض QR Code
// ═══════════════════════════════════════════════════════════

function displayQR(qr) {
    console.log('\n\n');
    console.log('█████████████████████████████████████████████████████');
    console.log('█                                                   █');
    console.log('█          QR CODE - امسحه بواتساب الآن!           █');
    console.log('█                                                   █');
    console.log('█████████████████████████████████████████████████████');
    console.log('\n🔗 استخدم هذا الرابط لتوليد QR Code:');
    console.log(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`);
    console.log('\n');
    console.log('📱 الخطوات:');
    console.log('1. انسخ الرابط أعلاه');
    console.log('2. افتحه في المتصفح');
    console.log('3. امسح الكود بواتساب');
    console.log('4. بعد الاتصال، سيتم عرض SESSION_DATA لحفظها');
    console.log('\n█████████████████████████████████████████████████████\n\n');
}

// ═══════════════════════════════════════════════════════════
// 🗑️ حذف بيانات المصادقة
// ═══════════════════════════════════════════════════════════

function deleteAuthFolder() {
    const authPath = path.join(__dirname, 'auth_info');
    if (fs.existsSync(authPath)) {
        try {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('🗑️ تم حذف مجلد auth_info');
            return true;
        } catch (error) {
            console.error('❌ فشل حذف مجلد auth_info:', error.message);
            return false;
        }
    }
    return false;
}

// ═══════════════════════════════════════════════════════════
// 🤖 بدء البوت
// ═══════════════════════════════════════════════════════════

async function startBot() {
    try {
        console.log('🚀 Starting WhatsApp Bot...');
        
        // تحميل الجلسة من ENV إذا وجدت
        await loadSessionFromEnv();
        
        // الحصول على أحدث إصدار من Baileys
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📦 استخدام Baileys v${version.join('.')}, أحدث: ${isLatest}`);
        
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
            defaultQueryTimeoutMs: undefined,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            getMessage: async (key) => {
                return { conversation: '' };
            }
        });

        globalSock = sock;

        // حفظ بيانات المصادقة
        sock.ev.on('creds.update', async () => {
            await saveCreds();
            
            // حفظ الجلسة في ENV بعد الاتصال الأول
            if (!sessionString) {
                await delay(3000); // انتظار حفظ كامل البيانات
                sessionString = await saveSessionToEnv(state);
                
                // إرسال للمالك
                if (sessionString && CONFIG.ownerNumber && sock.user) {
                    try {
                        await delay(2000);
                        await sock.sendMessage(CONFIG.ownerNumber, {
                            text: `🎉 *تم إنشاء جلسة جديدة!*\n\n` +
                                  `📋 احفظ هذا الكود في .env:\n\n` +
                                  `\`\`\`SESSION_DATA=${sessionString}\`\`\`\n\n` +
                                  `⚠️ *مهم:* لا تشارك هذا الكود مع أي شخص!`
                        });
                    } catch (err) {
                        console.log('⚠️ لم يتم إرسال الجلسة للمالك:', err.message);
                    }
                }
            }
        });

        // معالجة الاتصال
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                displayQR(qr);
            }
            
            if (connection === 'close') {
                const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.output?.payload?.error || 'Unknown';
                
                console.log(`❌ الاتصال مغلق. الكود: ${statusCode}, السبب: ${reason}`);
                
                // معالجة الأخطاء المختلفة
                if (statusCode === DisconnectReason.badSession) {
                    console.log('📱 جلسة سيئة - حذف وإعادة المحاولة');
                    deleteAuthFolder();
                    setTimeout(startBot, 3000);
                } 
                else if (statusCode === DisconnectReason.loggedOut) {
                    console.log('🚪 تم تسجيل الخروج - حذف الجلسة');
                    deleteAuthFolder();
                    setTimeout(startBot, 3000);
                }
                else if (statusCode === DisconnectReason.connectionReplaced) {
                    console.log('🔄 تم استبدال الاتصال');
                    console.log('⚠️ أغلق الجلسة الأخرى أولاً');
                }
                else if (statusCode === 401 || statusCode === 403) {
                    console.log('🔑 خطأ في المصادقة - حذف الجلسة');
                    deleteAuthFolder();
                    setTimeout(startBot, 5000);
                }
                else if (statusCode === 405) {
                    console.log('🚫 خطأ 405 - ربما تحتاج تحديث Baileys');
                    console.log('💡 جرب: npm update @whiskeysockets/baileys');
                    deleteAuthFolder();
                    reconnectWithDelay(true);
                }
                else if (statusCode === 500 || statusCode === 503) {
                    console.log('⚠️ خطأ في السيرفر - إعادة المحاولة');
                    reconnectWithDelay(true);
                }
                else if (shouldReconnect) {
                    reconnectWithDelay();
                }
                
            } else if (connection === 'open') {
                console.log('\n✅ ════════════════════════════════════');
                console.log(`   متصل بواتساب بنجاح! 🎉`);
                console.log(`   البوت: ${CONFIG.botName}`);
                console.log(`   الرقم: ${sock.user?.id?.split(':')[0] || 'غير معروف'}`);
                console.log(`   المالك: ${CONFIG.botOwner}`);
                console.log(`   الرد في المجموعات: ${CONFIG.replyInGroups ? 'نعم' : 'لا'}`);
                console.log('════════════════════════════════════\n');
                
                reconnectAttempts = 0;
                botStartTime = Date.now();
                processedMessages.clear();
                
                // إرسال إشعار للمالك
                if (CONFIG.ownerNumber) {
                    try {
                        await delay(2000);
                        await sock.sendMessage(CONFIG.ownerNumber, {
                            text: `✅ *${CONFIG.botName} متصل الآن!*\n\n` +
                                  `📱 الرقم: ${sock.user.id.split(':')[0]}\n` +
                                  `⏰ الوقت: ${new Date().toLocaleString('ar-EG')}\n` +
                                  `👥 الرد في المجموعات: ${CONFIG.replyInGroups ? 'نعم ✅' : 'لا ❌'}`
                        });
                    } catch (err) {
                        console.log('⚠️ لم يتم إرسال إشعار البدء للمالك');
                    }
                }
            } else if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال بواتساب...');
            }
        });

        // ═══════════════════════════════════════════════════════════
        // 💬 معالجة الرسائل
        // ═══════════════════════════════════════════════════════════
        
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') return;
                
                const msg = messages[0];
                if (!msg || !msg.message) return;
                
                // 1️⃣ تجاهل رسائل البوت
                if (msg.key.fromMe) {
                    if (CONFIG.showIgnoredMessages) console.log('⏭️ تجاهل رسالة من البوت');
                    return;
                }
                
                const sender = msg.key.remoteJid;
                const messageId = msg.key.id;
                const timestamp = msg.messageTimestamp;
                const isGroup = sender.endsWith('@g.us');
                
                // 2️⃣ فحص المجموعات
                if (isGroup && !CONFIG.replyInGroups) {
                    if (CONFIG.showIgnoredMessages) {
                        console.log(`⏭️ تجاهل رسالة من مجموعة (REPLY_IN_GROUPS=false)`);
                    }
                    return;
                }
                
                // 3️⃣ تجاهل الحالات
                if (sender === 'status@broadcast') {
                    if (CONFIG.showIgnoredMessages) console.log('⏭️ تجاهل حالة');
                    return;
                }
                
                // 4️⃣ تجاهل الرسائل القديمة
                const messageTime = timestamp * 1000;
                const timeDiff = Date.now() - messageTime;
                
                if (timeDiff > 60000) {
                    if (CONFIG.showIgnoredMessages) {
                        console.log(`⏭️ تجاهل رسالة قديمة (${Math.floor(timeDiff / 1000)}ث)`);
                    }
                    return;
                }
                
                // 5️⃣ تجاهل المُكررة
                if (processedMessages.has(messageId)) {
                    if (CONFIG.showIgnoredMessages) console.log('⏭️ رسالة مكررة');
                    return;
                }
                
                // 6️⃣ تجاهل رسائل البروتوكول
                const messageType = Object.keys(msg.message)[0];
                const ignoredTypes = [
                    'protocolMessage',
                    'senderKeyDistributionMessage',
                    'reactionMessage',
                    'messageContextInfo'
                ];
                
                if (ignoredTypes.includes(messageType)) {
                    return;
                }
                
                // استخراج النص
                const messageText = 
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption ||
                    '';

                if (!messageText.trim()) {
                    if (CONFIG.showIgnoredMessages) console.log('⏭️ رسالة فارغة');
                    return;
                }

                console.log('\n' + '='.repeat(50));
                console.log(`📩 ${isGroup ? '👥 مجموعة' : '👤 خاص'}: ${sender}`);
                console.log(`📝 النص: ${messageText}`);
                console.log(`⏰ ${new Date(messageTime).toLocaleString('ar-EG')}`);
                console.log('='.repeat(50) + '\n');

                processedMessages.add(messageId);
                cleanProcessedMessages();

                // الرد على الرسالة
                try {
                    const replyText = `👋 *مرحباً بك!*

أنا *${CONFIG.botName}* مساعدك الذكي 🤖
من تصميم *${CONFIG.botOwner}* 👨‍💻

شكراً لرسالتك:
_"${messageText}"_

${isGroup ? '👥 رسالة من مجموعة' : '👤 رسالة خاصة'}
البوت يعمل بنجاح! ✅`;

                    await sock.sendMessage(sender, { 
                        text: replyText
                    }, {
                        quoted: msg
                    });
                    
                    console.log('✅ تم الرد بنجاح\n');
                    
                } catch (error) {
                    console.error('❌ خطأ في الرد:', error.message);
                }
                
            } catch (error) {
                console.error('❌ خطأ في معالجة الرسالة:', error);
            }
        });

        console.log('✅ تم تهيئة البوت بنجاح');
        
    } catch (error) {
        console.error('❌ خطأ في بدء البوت:', error);
        console.log('🔄 إعادة المحاولة بعد 10 ثواني...');
        setTimeout(startBot, 10000);
    }
}

// ═══════════════════════════════════════════════════════════
// 🔄 إعادة الاتصال
// ═══════════════════════════════════════════════════════════

function reconnectWithDelay(longDelay = false) {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('❌ فشل الاتصال بعد عدة محاولات');
        console.log('💡 جرب:');
        console.log('1. حذف مجلد auth_info');
        console.log('2. تحديث Baileys: npm update @whiskeysockets/baileys');
        console.log('3. التحقق من اتصال الإنترنت');
        process.exit(1);
    }
    
    reconnectAttempts++;
    const delayTime = longDelay ? 15000 : (5000 * reconnectAttempts);
    
    console.log(`🔄 إعادة الاتصال بعد ${delayTime / 1000}ث... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    setTimeout(startBot, delayTime);
}

// ═══════════════════════════════════════════════════════════
// 🛑 معالجة الإيقاف
// ═══════════════════════════════════════════════════════════

process.on('SIGINT', async () => {
    console.log('\n👋 إيقاف البوت...');
    if (globalSock) {
        try {
            await globalSock.logout();
        } catch (e) {}
    }
    server.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n👋 إيقاف البوت (SIGTERM)...');
    if (globalSock) {
        try {
            await globalSock.logout();
        } catch (e) {}
    }
    server.close();
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    // لا نوقف البوت في حالة الأخطاء غير المتوقعة
});

// ═══════════════════════════════════════════════════════════
// 🚀 بدء البوت
// ═══════════════════════════════════════════════════════════

startBot();

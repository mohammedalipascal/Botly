require('dotenv').config();
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, delay } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const http = require('http');
const fs = require('fs');
const path = require('path');

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
    logLevel: process.env.LOG_LEVEL || 'info'
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
    if (!CONFIG.sessionData) return null;
    
    try {
        console.log('🔐 تحميل الجلسة من ENV...');
        const session = JSON.parse(Buffer.from(CONFIG.sessionData, 'base64').toString());
        
        // إنشاء مجلد auth_info
        const authPath = path.join(__dirname, 'auth_info');
        if (!fs.existsSync(authPath)) {
            fs.mkdirSync(authPath, { recursive: true });
        }
        
        // حفظ creds.json
        fs.writeFileSync(
            path.join(authPath, 'creds.json'),
            JSON.stringify(session, null, 2)
        );
        
        console.log('✅ تم تحميل الجلسة بنجاح من ENV');
        return true;
    } catch (error) {
        console.error('❌ فشل تحميل الجلسة من ENV:', error.message);
        console.log('📱 سيتم طلب مسح QR Code...');
        return null;
    }
}

async function saveSessionToEnv(state) {
    try {
        const credsPath = path.join(__dirname, 'auth_info', 'creds.json');
        
        if (!fs.existsSync(credsPath)) {
            console.log('⏳ انتظار حفظ بيانات الاعتماد...');
            return;
        }
        
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
        const sessionString = Buffer.from(JSON.stringify(creds)).toString('base64');
        
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
        
        // إرسال للمالك إذا كان الرقم موجود
        return sessionString;
        
    } catch (error) {
        console.error('❌ خطأ في حفظ الجلسة:', error.message);
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
    console.log('\nQR Code Data:');
    console.log(qr);
    console.log('\n');
    console.log('🔗 استخدم هذا الرابط لتوليد QR Code:');
    console.log(`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`);
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
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log('🗑️ تم حذف مجلد auth_info');
        return true;
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
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: P({ level: 'silent' }),
            browser: [CONFIG.botName, 'Chrome', '1.0.0'],
            defaultQueryTimeoutMs: undefined,
            getMessage: async (key) => {
                return { conversation: '' };
            }
        });

        // حفظ بيانات المصادقة
        sock.ev.on('creds.update', async () => {
            await saveCreds();
            
            // حفظ الجلسة في ENV بعد الاتصال الأول
            if (!sessionString) {
                sessionString = await saveSessionToEnv(state);
                
                // إرسال للمالك
                if (sessionString && CONFIG.ownerNumber) {
                    try {
                        await delay(2000);
                        await sock.sendMessage(CONFIG.ownerNumber, {
                            text: `🎉 *تم إنشاء جلسة جديدة!*\n\n` +
                                  `📋 احفظ هذا الكود في .env:\n\n` +
                                  `\`\`\`SESSION_DATA=${sessionString}\`\`\`\n\n` +
                                  `⚠️ *مهم:* لا تشارك هذا الكود مع أي شخص!`
                        });
                    } catch (err) {
                        console.log('⚠️ لم يتم إرسال الجلسة للمالك');
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
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.output?.payload?.error || 'Unknown';
                
                console.log(`❌ الاتصال مغلق. الكود: ${statusCode}, السبب: ${reason}`);
                
                switch (statusCode) {
                    case DisconnectReason.badSession:
                        console.log('📱 جلسة سيئة - حذف وإعادة المحاولة');
                        deleteAuthFolder();
                        setTimeout(startBot, 3000);
                        break;
                        
                    case DisconnectReason.connectionClosed:
                        console.log('🔌 الاتصال مغلق - إعادة المحاولة');
                        reconnectWithDelay();
                        break;
                        
                    case DisconnectReason.connectionLost:
                        console.log('📡 فقدان الاتصال - إعادة المحاولة');
                        reconnectWithDelay();
                        break;
                        
                    case DisconnectReason.connectionReplaced:
                        console.log('🔄 تم استبدال الاتصال - جلسة جديدة نشطة');
                        console.log('⚠️ أغلق الجلسة الأخرى أولاً');
                        break;
                        
                    case DisconnectReason.loggedOut:
                        console.log('🚪 تم تسجيل الخروج');
                        deleteAuthFolder();
                        setTimeout(startBot, 3000);
                        break;
                        
                    case DisconnectReason.restartRequired:
                        console.log('🔄 إعادة التشغيل مطلوبة');
                        setTimeout(startBot, 2000);
                        break;
                        
                    case DisconnectReason.timedOut:
                        console.log('⏱️ انتهت المهلة - إعادة المحاولة');
                        reconnectWithDelay();
                        break;
                        
                    case 401:
                        console.log('🔑 خطأ في المصادقة (401)');
                        deleteAuthFolder();
                        setTimeout(startBot, 5000);
                        break;
                        
                    case 515:
                        console.log('🚫 الاتصال مرفوض (515)');
                        console.log('💡 تأكد من عدم وجود جلسة أخرى نشطة');
                        reconnectWithDelay(true);
                        break;
                        
                    default:
                        console.log('❓ خطأ غير معروف - إعادة المحاولة');
                        reconnectWithDelay();
                }
                
            } else if (connection === 'open') {
                console.log('\n✅ ════════════════════════════════════');
                console.log(`   متصل بواتساب بنجاح! 🎉`);
                console.log(`   البوت: ${CONFIG.botName}`);
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

أنا ${CONFIG.botName} مساعدك الذكي 
من تصميم ${CONFIG.botOwner}

شكراً لرسالتك:
"${messageText}"

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
        console.log('🔄 إعادة المحاولة بعد 5 ثواني...');
        setTimeout(startBot, 5000);
    }
}

// ═══════════════════════════════════════════════════════════
// 🔄 إعادة الاتصال
// ═══════════════════════════════════════════════════════════

function reconnectWithDelay(longDelay = false) {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('❌ فشل الاتصال بعد عدة محاولات');
        console.log('💡 جرب حذف مجلد auth_info وإعادة المحاولة');
        return;
    }
    
    reconnectAttempts++;
    const delay = longDelay ? 10000 : (3000 * reconnectAttempts);
    
    console.log(`🔄 إعادة الاتصال بعد ${delay / 1000}ث... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    setTimeout(startBot, delay);
}

// ═══════════════════════════════════════════════════════════
// 🛑 معالجة الإيقاف
// ═══════════════════════════════════════════════════════════

process.on('SIGINT', () => {
    console.log('\n👋 إيقاف البوت...');
    server.close();
    process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

// ═══════════════════════════════════════════════════════════
// 🚀 بدء البوت
// ═══════════════════════════════════════════════════════════

startBot();

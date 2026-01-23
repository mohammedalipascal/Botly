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
// 🔧 دالة Delay
// ═══════════════════════════════════════════════════════════
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
    sessionData: process.env.SESSION_DATA || null,
    showIgnoredMessages: process.env.SHOW_IGNORED_MESSAGES === 'true',
    logLevel: process.env.LOG_LEVEL || 'silent'
};

console.log('\n⚙️ ═══════ إعدادات البوت ═══════');
console.log(`📱 اسم البوت: ${CONFIG.botName}`);
console.log(`👤 المالك: ${CONFIG.botOwner}`);
console.log(`🔰 البادئة: ${CONFIG.prefix}`);
console.log(`👥 الرد في المجموعات: ${CONFIG.replyInGroups ? '✅ نعم' : '❌ لا'}`);
console.log('═══════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════
// ⚠️ فحص SESSION_DATA
// ═══════════════════════════════════════════════════════════

if (!CONFIG.sessionData || CONFIG.sessionData.trim() === '') {
    console.error('\n❌ خطأ: SESSION_DATA غير موجود!\n');
    console.log('📋 الخطوات المطلوبة:');
    console.log('1. شغّل: node generate-stable.js');
    console.log('2. امسح الـ QR Code');
    console.log('3. انسخ SESSION_DATA');
    console.log('4. ضعه في Environment Variables');
    console.log('5. شغّل البوت: node index.js\n');
    process.exit(1);
}

// ═══════════════════════════════════════════════════════════
// 🌐 سيرفر HTTP
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
    console.log(`🌐 HTTP Server: http://localhost:${CONFIG.port}`);
});

// ═══════════════════════════════════════════════════════════
// 💾 تحميل الجلسة - الحل الصحيح 100%
// ═══════════════════════════════════════════════════════════

function loadSessionFromEnv() {
    try {
        console.log('🔐 تحميل الجلسة من SESSION_DATA...');
        
        const sessionStr = CONFIG.sessionData.trim();
        
        // فحص طول SESSION_DATA
        if (sessionStr.length < 100) {
            throw new Error('SESSION_DATA قصير جداً - يجب أن يكون أكثر من 100 حرف');
        }
        
        console.log(`📏 طول SESSION_DATA: ${sessionStr.length} حرف`);
        
        // فك التشفير من Base64
        let decoded;
        try {
            decoded = Buffer.from(sessionStr, 'base64').toString('utf-8');
        } catch (e) {
            throw new Error('فشل فك تشفير Base64 - تأكد من نسخ SESSION_DATA كاملاً');
        }
        
        // تحويل إلى JSON
        let authData;
        try {
            authData = JSON.parse(decoded);
        } catch (e) {
            throw new Error('فشل تحويل JSON - SESSION_DATA تالف');
        }
        
        // التحقق من البنية
        console.log('📂 فحص محتويات الجلسة...');
        console.log(`📁 الملفات الموجودة: ${Object.keys(authData).length}`);
        
        // ⭐ التحقق من وجود creds.json
        if (!authData['creds.json']) {
            throw new Error('creds.json غير موجود في SESSION_DATA');
        }
        
        let credsData;
        try {
            credsData = JSON.parse(authData['creds.json']);
        } catch (e) {
            throw new Error('creds.json تالف - لا يمكن تحويله لـ JSON');
        }
        
        // التحقق من محتويات creds.json
        if (!credsData.noiseKey || !credsData.signedIdentityKey || !credsData.signedPreKey) {
            console.error('⚠️ محتويات creds.json:');
            console.error(`   - noiseKey: ${credsData.noiseKey ? '✅' : '❌'}`);
            console.error(`   - signedIdentityKey: ${credsData.signedIdentityKey ? '✅' : '❌'}`);
            console.error(`   - signedPreKey: ${credsData.signedPreKey ? '✅' : '❌'}`);
            throw new Error('creds.json غير مكتمل - يجب إنشاء جلسة جديدة');
        }
        
        console.log('✅ creds.json صحيح ومكتمل');
        
        // إنشاء مجلد auth_info
        const authPath = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authPath)) {
            console.log('🗑️ حذف auth_info القديم...');
            fs.rmSync(authPath, { recursive: true, force: true });
        }
        fs.mkdirSync(authPath, { recursive: true });
        console.log('📁 تم إنشاء مجلد auth_info');
        
        // ⭐ حفظ كل الملفات من authData
        let savedFiles = 0;
        for (const [filename, content] of Object.entries(authData)) {
            try {
                const filePath = path.join(authPath, filename);
                fs.writeFileSync(filePath, content);
                savedFiles++;
                console.log(`   ✅ ${filename}`);
            } catch (err) {
                console.error(`   ❌ فشل حفظ ${filename}: ${err.message}`);
            }
        }
        
        console.log(`\n✅ تم حفظ ${savedFiles} ملف في auth_info`);
        console.log('✅ تم تحميل الجلسة بنجاح\n');
        return true;
        
    } catch (error) {
        console.error('\n❌ ═══════════════════════════════════');
        console.error(`❌ فشل تحميل الجلسة: ${error.message}`);
        console.error('❌ ═══════════════════════════════════\n');
        
        console.log('📋 الحلول المقترحة:\n');
        console.log('1️⃣ تحقق من SESSION_DATA في Environment Variables:');
        console.log('   • يجب أن يكون أكثر من 1000 حرف');
        console.log('   • تأكد من نسخه كاملاً بدون مسافات زائدة\n');
        
        console.log('2️⃣ أنشئ جلسة جديدة:');
        console.log('   • شغّل: node generate-stable.js');
        console.log('   • امسح QR Code');
        console.log('   • انتظر ظهور SESSION_DATA');
        console.log('   • انسخه كاملاً\n');
        
        console.log('3️⃣ في Clever Cloud:');
        console.log('   • افتح Environment Variables');
        console.log('   • احذف SESSION_DATA القديم');
        console.log('   • أضف SESSION_DATA الجديد');
        console.log('   • احفظ وأعد التشغيل\n');
        
        process.exit(1);
    }
}

// ═══════════════════════════════════════════════════════════
// 📊 متغيرات التتبع
// ═══════════════════════════════════════════════════════════

const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
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
// 🤖 بدء البوت
// ═══════════════════════════════════════════════════════════

async function startBot() {
    try {
        console.log('🚀 بدء البوت...\n');
        
        // تحميل الجلسة من ENV
        loadSessionFromEnv();
        
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
            defaultQueryTimeoutMs: undefined,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            getMessage: async (key) => {
                return { conversation: '' };
            }
        });

        globalSock = sock;

        // حفظ التحديثات
        sock.ev.on('creds.update', saveCreds);

        // معالجة الاتصال
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // ⚠️ إذا ظهر QR = الجلسة فاسدة
            if (qr) {
                console.error('\n❌ خطأ: تم طلب QR Code!');
                console.error('هذا يعني أن SESSION_DATA غير صالح\n');
                console.log('📋 الحل:');
                console.log('1. شغّل: node generate-stable.js');
                console.log('2. احصل على SESSION_DATA جديد\n');
                process.exit(1);
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.output?.payload?.error || 'Unknown';
                
                console.log(`❌ الاتصال مغلق. كود: ${statusCode}, سبب: ${reason}`);
                
                // معالجة الأخطاء
                if (statusCode === DisconnectReason.badSession || 
                    statusCode === DisconnectReason.loggedOut ||
                    statusCode === 401 || statusCode === 403) {
                    
                    console.error('\n❌ الجلسة غير صالحة أو منتهية!\n');
                    console.log('📋 الحل:');
                    console.log('1. شغّل: node generate-stable.js');
                    console.log('2. احصل على SESSION_DATA جديد');
                    console.log('3. حدّث Environment Variables\n');
                    process.exit(1);
                    
                } else if (statusCode === DisconnectReason.connectionReplaced) {
                    console.log('🔄 تم استبدال الاتصال (جلسة أخرى نشطة)\n');
                    process.exit(1);
                    
                } else if (statusCode === 405) {
                    console.log('⚠️ خطأ 405 - تحديث Baileys مطلوب');
                    console.log('💡 جرب: npm update @whiskeysockets/baileys\n');
                    reconnectWithDelay(true);
                    
                } else if (statusCode === 515) {
                    console.log('⚠️ خطأ 515 - إعادة المحاولة بعد 5 ثوانٍ...\n');
                    reconnectWithDelay(false, 5000);
                    
                } else if (statusCode === 500 || statusCode === 503 || 
                           statusCode === DisconnectReason.timedOut ||
                           statusCode === DisconnectReason.connectionLost) {
                    reconnectWithDelay();
                    
                } else {
                    console.log('⚠️ خطأ غير متوقع - إعادة المحاولة\n');
                    reconnectWithDelay();
                }
                
            } else if (connection === 'open') {
                console.log('✅ ════════════════════════════════════');
                console.log(`   متصل بواتساب بنجاح! 🎉`);
                console.log(`   البوت: ${CONFIG.botName}`);
                console.log(`   الرقم: ${sock.user?.id?.split(':')[0] || '---'}`);
                console.log(`   الاسم: ${sock.user?.name || '---'}`);
                console.log(`   المالك: ${CONFIG.botOwner}`);
                console.log(`   المجموعات: ${CONFIG.replyInGroups ? 'نعم ✅' : 'لا ❌'}`);
                console.log('════════════════════════════════════\n');
                
                reconnectAttempts = 0;
                processedMessages.clear();
                
                // إشعار المالك
                if (CONFIG.ownerNumber) {
                    try {
                        await delay(2000);
                        await sock.sendMessage(CONFIG.ownerNumber, {
                            text: `✅ *${CONFIG.botName} متصل الآن!*\n\n` +
                                  `📱 الرقم: ${sock.user.id.split(':')[0]}\n` +
                                  `⏰ ${new Date().toLocaleString('ar-EG')}\n` +
                                  `👥 المجموعات: ${CONFIG.replyInGroups ? 'نعم ✅' : 'لا ❌'}`
                        });
                    } catch (err) {
                        console.log('⚠️ لم يتم إرسال إشعار للمالك');
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
                if (!msg || !msg.message) return;
                
                // تجاهل رسائل البوت
                if (msg.key.fromMe) {
                    if (CONFIG.showIgnoredMessages) console.log('⏭️ رسالة من البوت');
                    return;
                }
                
                const sender = msg.key.remoteJid;
                const messageId = msg.key.id;
                const timestamp = msg.messageTimestamp;
                const isGroup = sender.endsWith('@g.us');
                
                // فحص المجموعات
                if (isGroup && !CONFIG.replyInGroups) {
                    if (CONFIG.showIgnoredMessages) {
                        console.log(`⏭️ مجموعة (الرد معطل)`);
                    }
                    return;
                }
                
                // تجاهل الحالات
                if (sender === 'status@broadcast') {
                    if (CONFIG.showIgnoredMessages) console.log('⏭️ حالة');
                    return;
                }
                
                // تجاهل الرسائل القديمة (أكثر من دقيقة)
                const messageTime = timestamp * 1000;
                const timeDiff = Date.now() - messageTime;
                
                if (timeDiff > 60000) {
                    if (CONFIG.showIgnoredMessages) {
                        console.log(`⏭️ رسالة قديمة (${Math.floor(timeDiff / 1000)}ث)`);
                    }
                    return;
                }
                
                // تجاهل المكررة
                if (processedMessages.has(messageId)) {
                    if (CONFIG.showIgnoredMessages) console.log('⏭️ مكررة');
                    return;
                }
                
                // تجاهل رسائل البروتوكول
                const messageType = Object.keys(msg.message)[0];
                const ignoredTypes = [
                    'protocolMessage',
                    'senderKeyDistributionMessage',
                    'reactionMessage',
                    'messageContextInfo'
                ];
                
                if (ignoredTypes.includes(messageType)) return;
                
                // استخراج النص
                const messageText = 
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption ||
                    '';

                if (!messageText.trim()) {
                    if (CONFIG.showIgnoredMessages) console.log('⏭️ فارغة');
                    return;
                }

                console.log('\n' + '='.repeat(50));
                console.log(`📩 ${isGroup ? '👥 مجموعة' : '👤 خاص'}: ${sender}`);
                console.log(`📝 ${messageText}`);
                console.log(`⏰ ${new Date(messageTime).toLocaleString('ar-EG')}`);
                console.log('='.repeat(50));

                processedMessages.add(messageId);
                cleanProcessedMessages();

                // الرد
                try {
                    const replyText = `👋 *مرحباً بك!*

أنا *${CONFIG.botName}* 🤖
من تصميم *${CONFIG.botOwner}* 👨‍💻

شكراً لرسالتك:
_"${messageText}"_

${isGroup ? '👥 مجموعة' : '👤 خاص'}
البوت يعمل ✅`;

                    await sock.sendMessage(sender, { 
                        text: replyText
                    }, {
                        quoted: msg
                    });
                    
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
        console.log('🔄 إعادة المحاولة بعد 10 ثواني...\n');
        setTimeout(startBot, 10000);
    }
}

// ═══════════════════════════════════════════════════════════
// 🔄 إعادة الاتصال
// ═══════════════════════════════════════════════════════════

function reconnectWithDelay(longDelay = false, customDelay = null) {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('❌ فشل الاتصال بعد عدة محاولات');
        console.log('\n📋 الحلول المقترحة:');
        console.log('1. تحقق من اتصال الإنترنت');
        console.log('2. حدّث Baileys: npm update @whiskeysockets/baileys');
        console.log('3. أنشئ جلسة جديدة: node generate-stable.js\n');
        process.exit(1);
    }
    
    reconnectAttempts++;
    const delayTime = customDelay || (longDelay ? 15000 : (5000 * reconnectAttempts));
    
    console.log(`🔄 إعادة المحاولة بعد ${delayTime / 1000}ث (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})\n`);
    setTimeout(startBot, delayTime);
}

// ═══════════════════════════════════════════════════════════
// 🛑 معالجة الإيقاف
// ═══════════════════════════════════════════════════════════

process.on('SIGINT', async () => {
    console.log('\n\n👋 إيقاف البوت...\n');
    if (globalSock) {
        try {
            await globalSock.logout();
        } catch (e) {}
    }
    server.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\n👋 إيقاف البوت (SIGTERM)...\n');
    if (globalSock) {
        try {
            await globalSock.logout();
        } catch (e) {}
    }
    server.close();
    process.exit(0);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

// ═══════════════════════════════════════════════════════════
// 🚀 بدء البوت
// ═══════════════════════════════════════════════════════════

startBot();

const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const http = require('http');
const fs = require('fs');
const path = require('path');

// سيرفر HTTP للحفاظ على النشاط
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: 'WhatsApp Bot Active',
        time: new Date().toISOString()
    }));
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🌐 HTTP Server running on port ${PORT}`);
});

// تتبع الرسائل المعالجة لتجنب التكرار
const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000; // الحد الأقصى للرسائل المحفوظة

// متغيرات لإدارة إعادة الاتصال
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let botStartTime = Date.now();

// دالة تنظيف ذاكرة الرسائل المعالجة
function cleanProcessedMessages() {
    if (processedMessages.size > MAX_PROCESSED_CACHE) {
        const toDelete = processedMessages.size - MAX_PROCESSED_CACHE;
        const iterator = processedMessages.values();
        for (let i = 0; i < toDelete; i++) {
            processedMessages.delete(iterator.next().value);
        }
        console.log(`🧹 تم تنظيف ${toDelete} رسالة من الذاكرة`);
    }
}

// دالة عرض QR Code في اللوجات
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
    console.log('\n█████████████████████████████████████████████████████\n\n');
}

// دالة حذف بيانات المصادقة
function deleteAuthFolder() {
    const authPath = path.join(__dirname, 'auth_info');
    if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log('🗑️ تم حذف مجلد auth_info');
        return true;
    }
    return false;
}

// دالة بدء البوت
async function startBot() {
    try {
        console.log('🚀 Starting WhatsApp Bot...');
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: P({ level: 'silent' }),
            browser: ['Botly', 'Chrome', '1.0.0'],
            defaultQueryTimeoutMs: undefined,
            getMessage: async (key) => {
                return { conversation: '' };
            }
        });

        // حفظ بيانات المصادقة
        sock.ev.on('creds.update', saveCreds);

        // معالجة الاتصال
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // عرض QR Code يدوياً
            if (qr) {
                displayQR(qr);
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.output?.payload?.error || 'Unknown';
                
                console.log(`❌ الاتصال مغلق. الكود: ${statusCode}, السبب: ${reason}`);
                
                // معالجة الأخطاء المختلفة
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
                        
                    case 401: // خطأ المصادقة
                        console.log('🔑 خطأ في المصادقة (401)');
                        deleteAuthFolder();
                        setTimeout(startBot, 5000);
                        break;
                        
                    case 515: // اتصال مرفوض
                        console.log('🚫 الاتصال مرفوض (515)');
                        console.log('💡 تأكد من عدم وجود جلسة أخرى نشطة');
                        reconnectWithDelay(true); // تأخير أطول
                        break;
                        
                    default:
                        console.log('❓ خطأ غير معروف - إعادة المحاولة');
                        reconnectWithDelay();
                }
                
            } else if (connection === 'open') {
                console.log('\n✅ ════════════════════════════════════');
                console.log('   متصل بواتساب بنجاح! 🎉');
                console.log('   البوت جاهز للعمل');
                console.log('════════════════════════════════════\n');
                
                // إعادة تعيين عداد المحاولات
                reconnectAttempts = 0;
                botStartTime = Date.now();
                
                // تنظيف ذاكرة الرسائل القديمة
                processedMessages.clear();
                
            } else if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال بواتساب...');
            }
        });

        // معالجة الرسائل - محسّنة لمنع الحلقات
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                // تجاهل أنواع الرسائل غير المهمة
                if (type !== 'notify') {
                    console.log(`⏭️ تجاهل رسالة من نوع: ${type}`);
                    return;
                }
                
                const msg = messages[0];
                if (!msg || !msg.message) {
                    console.log('⏭️ رسالة فارغة أو غير صالحة');
                    return;
                }
                
                // 1️⃣ الفحص الأهم: تجاهل الرسائل من البوت نفسه
                if (msg.key.fromMe) {
                    console.log('⏭️ تجاهل رسالة من البوت نفسه');
                    return;
                }
                
                const sender = msg.key.remoteJid;
                const messageId = msg.key.id;
                const timestamp = msg.messageTimestamp;
                
                // 2️⃣ تجاهل رسائل البرودكاست والحالات
                if (sender === 'status@broadcast') {
                    console.log('⏭️ تجاهل رسالة حالة');
                    return;
                }
                
                // 3️⃣ تجاهل الرسائل القديمة (قبل بدء البوت بـ 60 ثانية)
                const messageTime = timestamp * 1000; // تحويل لميللي ثانية
                const timeDiff = Date.now() - messageTime;
                
                if (timeDiff > 60000) { // أكثر من دقيقة
                    console.log(`⏭️ تجاهل رسالة قديمة (${Math.floor(timeDiff / 1000)} ثانية)`);
                    return;
                }
                
                // 4️⃣ تجاهل الرسائل المُعالجة سابقاً
                if (processedMessages.has(messageId)) {
                    console.log('⏭️ تجاهل رسالة تم معالجتها سابقاً');
                    return;
                }
                
                // 5️⃣ تجاهل رسائل البروتوكول والإشعارات
                const messageType = Object.keys(msg.message)[0];
                const ignoredTypes = [
                    'protocolMessage',
                    'senderKeyDistributionMessage',
                    'reactionMessage',
                    'messageContextInfo'
                ];
                
                if (ignoredTypes.includes(messageType)) {
                    console.log(`⏭️ تجاهل رسالة من نوع: ${messageType}`);
                    return;
                }
                
                // استخراج نص الرسالة
                const messageText = 
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption ||
                    '';

                // تجاهل الرسائل الفارغة
                if (!messageText.trim()) {
                    console.log('⏭️ رسالة بدون نص');
                    return;
                }

                console.log('\n' + '='.repeat(50));
                console.log(`📩 رسالة جديدة من ${sender}`);
                console.log(`📝 النص: ${messageText}`);
                console.log(`🆔 ID: ${messageId}`);
                console.log(`⏰ الوقت: ${new Date(messageTime).toLocaleString('ar-EG')}`);
                console.log(`🔍 fromMe: ${msg.key.fromMe}`);
                console.log('='.repeat(50) + '\n');

                // إضافة الرسالة للقائمة المُعالجة
                processedMessages.add(messageId);
                cleanProcessedMessages();

                // الرد مرة واحدة فقط
                try {
                    await sock.sendMessage(sender, { 
                        text: `👋 *مرحباً بك!*

أنا Botly مساعدك الذكي 
من تصميم مقداد

شكراً لرسالتك:
"${messageText}"

البوت يعمل بنجاح! ✅` 
                    }, {
                        quoted: msg // الرد على الرسالة نفسها
                    });
                    
                    console.log('✅ تم الرد على الرسالة بنجاح\n');
                    
                } catch (error) {
                    console.error('❌ خطأ في إرسال الرد:', error.message);
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

// دالة إعادة الاتصال مع تأخير
function reconnectWithDelay(longDelay = false) {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('❌ فشل الاتصال بعد عدة محاولات');
        console.log('💡 جرب حذف مجلد auth_info وإعادة المحاولة');
        return;
    }
    
    reconnectAttempts++;
    const delay = longDelay ? 10000 : (3000 * reconnectAttempts);
    
    console.log(`🔄 إعادة الاتصال بعد ${delay / 1000} ثواني... (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    setTimeout(startBot, delay);
}

// التعامل مع إيقاف التطبيق
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

// بدء البوت
startBot();

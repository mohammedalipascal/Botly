require('dotenv').config();
const { 
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers,
    delay
} = require('@whiskeysockets/baileys');
const P = require('pino');
const http = require('http');
const NodeCache = require('node-cache');

// ═══════════════════════════════════════════════════════════
// 🔧 الإعدادات
// ═══════════════════════════════════════════════════════════

const CONFIG = {
    botName: process.env.BOT_NAME || 'Botly',
    botOwner: process.env.BOT_OWNER || 'مقداد',
    prefix: process.env.PREFIX || '!',
    port: process.env.PORT || 8080,
    replyInGroups: process.env.REPLY_IN_GROUPS === 'true',
    ownerNumber: process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER + '@s.whatsapp.net' : null
};

console.log('\n⚙️ ═══════ إعدادات البوت ═══════');
console.log(`📱 اسم البوت: ${CONFIG.botName}`);
console.log(`👤 المالك: ${CONFIG.botOwner}`);
console.log(`👥 الرد في المجموعات: ${CONFIG.replyInGroups ? '✅ نعم' : '❌ لا'}`);
console.log('═══════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════
// 🌐 سيرفر HTTP
// ═══════════════════════════════════════════════════════════

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: CONFIG.botName,
        time: new Date().toISOString()
    }));
});

server.listen(CONFIG.port, () => {
    console.log(`🌐 HTTP Server: http://localhost:${CONFIG.port}\n`);
});

// ═══════════════════════════════════════════════════════════
// 🔗 دالة توليد روابط QR
// ═══════════════════════════════════════════════════════════

function generateQRLinks(qrData) {
    const encoded = encodeURIComponent(qrData);
    
    const links = {
        primary: `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encoded}`,
        alternative: `https://chart.googleapis.com/chart?chs=400x400&cht=qr&chl=${encoded}`
    };
    
    return links;
}

function displayQRLinks(links) {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║                                                        ║');
    console.log('║           📱 روابط QR Code - افتح أي رابط!           ║');
    console.log('║                                                        ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    
    console.log('🔗 الرابط الرئيسي:');
    console.log(`   ${links.primary}\n`);
    
    console.log('🔗 رابط بديل:');
    console.log(`   ${links.alternative}\n`);
    
    console.log('📱 الخطوات:');
    console.log('   1. انسخ الرابط أعلاه');
    console.log('   2. افتحه في المتصفح');
    console.log('   3. امسح الكود بواتساب');
    console.log('   4. انتظر الاتصال...\n');
    
    console.log('═'.repeat(60) + '\n');
}

// ═══════════════════════════════════════════════════════════
// 💾 Cache للرسائل
// ═══════════════════════════════════════════════════════════

const msgRetryCounterCache = new NodeCache();
const processedMessages = new Set();
const MAX_CACHE = 500;

function cleanCache() {
    if (processedMessages.size > MAX_CACHE) {
        const toDelete = processedMessages.size - MAX_CACHE;
        const iterator = processedMessages.values();
        for (let i = 0; i < toDelete; i++) {
            processedMessages.delete(iterator.next().value);
        }
    }
}

// ═══════════════════════════════════════════════════════════
// 🔧 متغيرات التحكم
// ═══════════════════════════════════════════════════════════

let reconnectAttempts = 0;
const MAX_RECONNECT = 5;
let isConnecting = false;
let sock = null;

// ═══════════════════════════════════════════════════════════
// 🤖 دالة بدء البوت - النسخة المستقرة
// ═══════════════════════════════════════════════════════════

async function startBot() {
    // منع محاولات متعددة في نفس الوقت
    if (isConnecting) {
        console.log('⏳ محاولة اتصال جارية، انتظر...\n');
        return;
    }
    
    isConnecting = true;
    
    try {
        console.log('🚀 بدء البوت...\n');
        
        // جلب أحدث إصدار
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')} ${isLatest ? '✅' : '⚠️'}\n`);
        
        // تحميل الجلسة
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        // إنشاء الاتصال بإعدادات محسّنة
        sock = makeWASocket({
            version,
            logger: P({ level: 'silent' }),
            printQRInTerminal: false,
            
            // 🔧 الإعدادات المهمة لتجنب 515
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
            },
            
            // Browser ID - مهم جداً!
            browser: Browsers.ubuntu('Desktop'),
            
            // إعدادات الاتصال المحسّنة
            markOnlineOnConnect: false, // ⚠️ مهم: عدم الظهور أونلاين مباشرة
            syncFullHistory: false,
            
            // Retry settings
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000, // زيادة المهلة
            
            // منع تحميل الرسائل القديمة
            getMessage: async () => undefined,
            
            // إعدادات إضافية للاستقرار
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            
            // تعطيل بعض المميزات غير الضرورية
            emitOwnEvents: false,
            fireInitQueries: true,
            generateHighQualityLinkPreview: false,
            
            // Mobile API بدلاً من Web (أكثر استقراراً)
            mobile: false,
            
            // تخزين مؤقت للرسائل
            shouldIgnoreJid: jid => jid === 'status@broadcast'
        });

        // ═══════════════════════════════════════════════════════════
        // 📱 معالجة الاتصال
        // ═══════════════════════════════════════════════════════════
        
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // QR Code
            if (qr) {
                const links = generateQRLinks(qr);
                displayQRLinks(links);
            }
            
            // الاتصال مغلق
            if (connection === 'close') {
                isConnecting = false;
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                console.log(`\n❌ الاتصال مغلق - كود: ${statusCode}\n`);
                
                // معالجة الأخطاء المختلفة
                switch (statusCode) {
                    case DisconnectReason.badSession:
                        console.log('📱 جلسة سيئة - يُنصح بحذف auth_info\n');
                        await delay(3000);
                        reconnectSafely();
                        break;
                    
                    case DisconnectReason.connectionClosed:
                        console.log('🔌 الاتصال مغلق - إعادة المحاولة\n');
                        await delay(5000);
                        reconnectSafely();
                        break;
                    
                    case DisconnectReason.connectionLost:
                        console.log('📡 فقدان الاتصال - إعادة المحاولة\n');
                        await delay(5000);
                        reconnectSafely();
                        break;
                    
                    case DisconnectReason.connectionReplaced:
                        console.log('🔄 تم استبدال الاتصال\n');
                        console.log('⚠️ جلسة أخرى نشطة - توقف\n');
                        process.exit(1);
                        break;
                    
                    case DisconnectReason.timedOut:
                        console.log('⏱️ انتهت المهلة - إعادة المحاولة\n');
                        await delay(10000);
                        reconnectSafely();
                        break;
                    
                    case DisconnectReason.loggedOut:
                        console.log('🚪 تم تسجيل الخروج\n');
                        console.log('💡 احذف auth_info وأعد التشغيل\n');
                        process.exit(1);
                        break;
                    
                    case DisconnectReason.restartRequired:
                        console.log('🔄 إعادة التشغيل مطلوبة\n');
                        await delay(2000);
                        reconnectSafely();
                        break;
                    
                    case 401:
                    case 403:
                        console.log('🔑 خطأ مصادقة - الجلسة منتهية\n');
                        console.log('💡 احذف auth_info وأعد التشغيل\n');
                        process.exit(1);
                        break;
                    
                    case 408:
                        console.log('⏱️ Request Timeout - إعادة المحاولة\n');
                        await delay(10000);
                        reconnectSafely();
                        break;
                    
                    case 428:
                        console.log('🔄 اتصال قديم - إعادة المحاولة\n');
                        await delay(5000);
                        reconnectSafely();
                        break;
                    
                    case 440:
                        console.log('🚪 تم تسجيل الخروج من الجلسة\n');
                        console.log('💡 احذف auth_info وأعد التشغيل\n');
                        process.exit(1);
                        break;
                    
                    case 500:
                    case 503:
                        console.log('🔧 خطأ في الخادم - إعادة المحاولة\n');
                        await delay(15000);
                        reconnectSafely();
                        break;
                    
                    case 515:
                        console.log('🚫 خطأ 515 - Connection Refused\n');
                        console.log('⚠️ هذا الخطأ يحدث عادة بسبب:');
                        console.log('   1. جلسة نشطة أخرى');
                        console.log('   2. واتساب ويب مفتوح');
                        console.log('   3. محاولة اتصال سريعة جداً\n');
                        console.log('🔧 الحل:');
                        console.log('   1. أغلق جميع جلسات واتساب ويب');
                        console.log('   2. احذف الأجهزة المرتبطة من الهاتف');
                        console.log('   3. انتظر 10 دقائق ⏰');
                        console.log('   4. احذف مجلد auth_info');
                        console.log('   5. أعد تشغيل البوت\n');
                        
                        // محاولة واحدة بعد تأخير طويل
                        if (reconnectAttempts === 0) {
                            console.log('⏰ انتظار 60 ثانية ثم محاولة مرة واحدة...\n');
                            await delay(60000);
                            reconnectSafely();
                        } else {
                            console.log('❌ فشل الاتصال - توقف\n');
                            process.exit(1);
                        }
                        break;
                    
                    default:
                        if (shouldReconnect) {
                            console.log('❓ خطأ غير معروف - إعادة المحاولة\n');
                            await delay(5000);
                            reconnectSafely();
                        }
                }
            }
            
            // الاتصال ناجح
            else if (connection === 'open') {
                isConnecting = false;
                reconnectAttempts = 0;
                
                console.log('\n✅ ════════════════════════════════════');
                console.log('   🎉 متصل بواتساب بنجاح!');
                console.log(`   📱 الرقم: ${sock.user?.id?.split(':')[0] || '---'}`);
                console.log(`   👤 الاسم: ${sock.user?.name || '---'}`);
                console.log(`   🤖 البوت: ${CONFIG.botName}`);
                console.log('════════════════════════════════════\n');
                
                processedMessages.clear();
                
                // إشعار المالك (بعد تأخير)
                if (CONFIG.ownerNumber) {
                    setTimeout(async () => {
                        try {
                            await sock.sendMessage(CONFIG.ownerNumber, {
                                text: `✅ *${CONFIG.botName} متصل!*\n\n` +
                                      `📱 ${sock.user.id.split(':')[0]}\n` +
                                      `⏰ ${new Date().toLocaleString('ar-EG')}`
                            });
                        } catch (e) {
                            console.log('⚠️ لم يتم إرسال إشعار للمالك\n');
                        }
                    }, 5000);
                }
            }
            
            // جاري الاتصال
            else if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال بواتساب...');
            }
        });

        // حفظ بيانات الاعتماد
        sock.ev.on('creds.update', saveCreds);

        // ═══════════════════════════════════════════════════════════
        // 💬 معالجة الرسائل
        // ═══════════════════════════════════════════════════════════
        
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') return;
                
                const msg = messages[0];
                if (!msg?.message) return;
                if (msg.key.fromMe) return;
                
                const sender = msg.key.remoteJid;
                const messageId = msg.key.id;
                const isGroup = sender.endsWith('@g.us');
                
                if (isGroup && !CONFIG.replyInGroups) return;
                if (sender === 'status@broadcast') return;
                
                const timestamp = msg.messageTimestamp * 1000;
                if (Date.now() - timestamp > 60000) return;
                if (processedMessages.has(messageId)) return;
                
                const msgType = Object.keys(msg.message)[0];
                if (['protocolMessage', 'senderKeyDistributionMessage', 
                     'reactionMessage', 'messageContextInfo'].includes(msgType)) {
                    return;
                }
                
                const text = 
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption || '';

                if (!text.trim()) return;

                console.log('\n' + '─'.repeat(50));
                console.log(`📩 ${isGroup ? '👥' : '👤'} ${sender}`);
                console.log(`📝 ${text}`);
                console.log('─'.repeat(50));

                processedMessages.add(messageId);
                cleanCache();

                try {
                    await sock.sendMessage(sender, { 
                        text: `👋 مرحباً!\n\n` +
                              `🤖 أنا *${CONFIG.botName}*\n` +
                              `👨‍💻 من تصميم *${CONFIG.botOwner}*\n\n` +
                              `📩 "${text}"\n\n` +
                              `${isGroup ? '👥 مجموعة' : '👤 خاص'} • ✅`
                    }, { quoted: msg });
                    
                    console.log('✅ تم الرد\n');
                    
                } catch (err) {
                    console.error('❌ خطأ في الرد:', err.message);
                }
                
            } catch (error) {
                console.error('❌ خطأ:', error.message);
            }
        });

        console.log('✅ البوت جاهز! 🚀\n');
        
    } catch (error) {
        isConnecting = false;
        console.error('\n❌ خطأ في بدء البوت:', error.message, '\n');
        
        await delay(5000);
        reconnectSafely();
    }
}

// ═══════════════════════════════════════════════════════════
// 🔄 إعادة الاتصال الآمنة
// ═══════════════════════════════════════════════════════════

async function reconnectSafely() {
    if (reconnectAttempts >= MAX_RECONNECT) {
        console.log('❌ فشل الاتصال بعد عدة محاولات\n');
        console.log('💡 جرّب:');
        console.log('   1. حذف مجلد auth_info');
        console.log('   2. تحديث Baileys: npm update @whiskeysockets/baileys');
        console.log('   3. إعادة التشغيل\n');
        process.exit(1);
    }
    
    reconnectAttempts++;
    const delayTime = Math.min(reconnectAttempts * 5000, 30000); // حد أقصى 30 ثانية
    
    console.log(`🔄 إعادة المحاولة ${reconnectAttempts}/${MAX_RECONNECT} بعد ${delayTime/1000}ث...\n`);
    
    await delay(delayTime);
    await startBot();
}

// ═══════════════════════════════════════════════════════════
// 🛑 معالجة الإيقاف
// ═══════════════════════════════════════════════════════════

async function cleanup() {
    console.log('\n👋 إيقاف البوت...\n');
    
    if (sock) {
        try {
            await sock.logout();
        } catch (e) {}
    }
    
    server.close();
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

process.on('unhandledRejection', (err) => {
    console.error('❌ Rejection:', err);
});

process.on('uncaughtException', (err) => {
    console.error('❌ Exception:', err);
});

// ═══════════════════════════════════════════════════════════
// 🚀 بدء البوت
// ═══════════════════════════════════════════════════════════

console.log('╔════════════════════════════════════════════════╗');
console.log('║                                                ║');
console.log('║            🤖 WhatsApp Bot - Botly            ║');
console.log('║          النسخة المستقرة (Anti-515)           ║');
console.log('║                                                ║');
console.log('╚════════════════════════════════════════════════╝\n');

startBot();

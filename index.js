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
const qrcode = require('qrcode-terminal');

// ═══════════════════════════════════════════════════════════
// 🔧 الإعدادات البسيطة
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
console.log(`💾 الجلسة: محلية (auth_info/)`);
console.log('═══════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════
// 🌐 سيرفر HTTP بسيط
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
// 📊 متغيرات التتبع
// ═══════════════════════════════════════════════════════════

const processedMessages = new Set();
const MAX_CACHE = 500;
let reconnectAttempts = 0;
const MAX_RECONNECT = 10;

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
// 🤖 دالة بدء البوت
// ═══════════════════════════════════════════════════════════

async function startBot() {
    try {
        console.log('🚀 بدء البوت...\n');
        
        // جلب أحدث إصدار من Baileys
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')}\n`);
        
        // تحميل/إنشاء الجلسة من auth_info
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        // إنشاء الاتصال
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
            },
            printQRInTerminal: false, // نستخدم qrcode-terminal بدلاً منه
            logger: P({ level: 'silent' }),
            browser: ['Botly', 'Desktop', '1.0.0'],
            defaultQueryTimeoutMs: undefined,
            syncFullHistory: false,
            markOnlineOnConnect: true,
            getMessage: async () => ({ conversation: '' })
        });

        // ═══════════════════════════════════════════════════════════
        // 📱 عرض QR Code
        // ═══════════════════════════════════════════════════════════
        
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // عرض QR Code
            if (qr) {
                console.log('\n📱 ═══════════════════════════════════════');
                console.log('       امسح QR Code بواتساب الآن!');
                console.log('═══════════════════════════════════════\n');
                
                // عرض QR في الترمينال
                qrcode.generate(qr, { small: true });
                
                console.log('\n📋 الخطوات:');
                console.log('1. افتح واتساب على الهاتف');
                console.log('2. اذهب إلى: الإعدادات > الأجهزة المرتبطة');
                console.log('3. امسح الكود أعلاه ☝️');
                console.log('4. انتظر الاتصال...\n');
            }
            
            // الاتصال مغلق
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                console.log(`\n❌ الاتصال مغلق - كود: ${statusCode}\n`);
                
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('🚪 تم تسجيل الخروج');
                    console.log('💡 احذف مجلد auth_info وأعد التشغيل\n');
                    process.exit(1);
                    
                } else if (statusCode === 515) {
                    console.log('🚫 خطأ 515 - جلسة نشطة أخرى!');
                    console.log('\n📋 الحل:');
                    console.log('1. افتح واتساب > الإعدادات > الأجهزة المرتبطة');
                    console.log('2. احذف جميع الأجهزة');
                    console.log('3. أغلق واتساب ويب في كل مكان');
                    console.log('4. انتظر 5 دقائق ⏰');
                    console.log('5. احذف مجلد auth_info');
                    console.log('6. أعد تشغيل البوت\n');
                    process.exit(1);
                    
                } else if (statusCode === 401 || statusCode === 403) {
                    console.log('🔑 خطأ مصادقة - الجلسة منتهية');
                    console.log('💡 احذف مجلد auth_info وأعد التشغيل\n');
                    process.exit(1);
                    
                } else if (shouldReconnect) {
                    if (reconnectAttempts < MAX_RECONNECT) {
                        reconnectAttempts++;
                        const delay = 3000 * reconnectAttempts;
                        console.log(`🔄 إعادة الاتصال بعد ${delay/1000}ث (${reconnectAttempts}/${MAX_RECONNECT})\n`);
                        setTimeout(startBot, delay);
                    } else {
                        console.log('❌ فشل الاتصال بعد عدة محاولات\n');
                        process.exit(1);
                    }
                }
            }
            
            // الاتصال ناجح
            else if (connection === 'open') {
                console.log('\n✅ ════════════════════════════════════');
                console.log('   🎉 متصل بواتساب بنجاح!');
                console.log(`   📱 الرقم: ${sock.user?.id?.split(':')[0] || '---'}`);
                console.log(`   👤 الاسم: ${sock.user?.name || '---'}`);
                console.log(`   🤖 البوت: ${CONFIG.botName}`);
                console.log(`   👥 المجموعات: ${CONFIG.replyInGroups ? 'نعم ✅' : 'لا ❌'}`);
                console.log('════════════════════════════════════\n');
                
                reconnectAttempts = 0;
                processedMessages.clear();
                
                // إشعار المالك
                if (CONFIG.ownerNumber) {
                    setTimeout(async () => {
                        try {
                            await sock.sendMessage(CONFIG.ownerNumber, {
                                text: `✅ *${CONFIG.botName} متصل الآن!*\n\n` +
                                      `📱 الرقم: ${sock.user.id.split(':')[0]}\n` +
                                      `⏰ ${new Date().toLocaleString('ar-EG')}\n` +
                                      `👥 المجموعات: ${CONFIG.replyInGroups ? 'نعم' : 'لا'}`
                            });
                        } catch (e) {
                            console.log('⚠️ لم يتم إرسال إشعار للمالك');
                        }
                    }, 3000);
                }
            }
            
            // جاري الاتصال
            else if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال بواتساب...');
            }
        });

        // ═══════════════════════════════════════════════════════════
        // 💾 حفظ بيانات الاعتماد تلقائياً
        // ═══════════════════════════════════════════════════════════
        
        sock.ev.on('creds.update', saveCreds);

        // ═══════════════════════════════════════════════════════════
        // 💬 معالجة الرسائل
        // ═══════════════════════════════════════════════════════════
        
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') return;
                
                const msg = messages[0];
                if (!msg?.message) return;
                
                // تجاهل رسائل البوت
                if (msg.key.fromMe) return;
                
                const sender = msg.key.remoteJid;
                const messageId = msg.key.id;
                const isGroup = sender.endsWith('@g.us');
                
                // فحص المجموعات
                if (isGroup && !CONFIG.replyInGroups) return;
                
                // تجاهل الحالات
                if (sender === 'status@broadcast') return;
                
                // تجاهل الرسائل القديمة
                const timestamp = msg.messageTimestamp * 1000;
                if (Date.now() - timestamp > 60000) return;
                
                // تجاهل المكررة
                if (processedMessages.has(messageId)) return;
                
                // تجاهل البروتوكول
                const msgType = Object.keys(msg.message)[0];
                if (['protocolMessage', 'senderKeyDistributionMessage', 
                     'reactionMessage', 'messageContextInfo'].includes(msgType)) {
                    return;
                }
                
                // استخراج النص
                const text = 
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption || '';

                if (!text.trim()) return;

                // طباعة الرسالة
                console.log('\n' + '─'.repeat(50));
                console.log(`📩 ${isGroup ? '👥' : '👤'} ${sender}`);
                console.log(`📝 ${text}`);
                console.log('─'.repeat(50));

                // إضافة للذاكرة
                processedMessages.add(messageId);
                cleanCache();

                // الرد
                try {
                    await sock.sendMessage(sender, { 
                        text: `👋 مرحباً!\n\n` +
                              `🤖 أنا *${CONFIG.botName}*\n` +
                              `👨‍💻 من تصميم *${CONFIG.botOwner}*\n\n` +
                              `📩 رسالتك:\n_"${text}"_\n\n` +
                              `${isGroup ? '👥 مجموعة' : '👤 خاص'} • ✅ البوت يعمل`
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
        console.error('\n❌ خطأ في بدء البوت:', error.message, '\n');
        
        if (reconnectAttempts < MAX_RECONNECT) {
            reconnectAttempts++;
            console.log(`🔄 إعادة المحاولة ${reconnectAttempts}/${MAX_RECONNECT}...\n`);
            setTimeout(startBot, 5000);
        } else {
            console.log('❌ فشل البوت بعد عدة محاولات\n');
            process.exit(1);
        }
    }
}

// ═══════════════════════════════════════════════════════════
// 🛑 معالجة الإيقاف
// ═══════════════════════════════════════════════════════════

process.on('SIGINT', () => {
    console.log('\n👋 إيقاف البوت...\n');
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 إيقاف البوت (SIGTERM)...\n');
    server.close();
    process.exit(0);
});

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
console.log('║                                                ║');
console.log('╚════════════════════════════════════════════════╝\n');

startBot();

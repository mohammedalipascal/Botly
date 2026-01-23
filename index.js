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
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════
// 🔧 الإعدادات
// ═══════════════════════════════════════════════════════════

const CONFIG = {
    sessionData: process.env.SESSION_DATA || null,
    botName: process.env.BOT_NAME || 'Botly',
    botOwner: process.env.BOT_OWNER || 'مقداد',
    prefix: process.env.PREFIX || '!',
    port: process.env.PORT || 8080,
    replyInGroups: process.env.REPLY_IN_GROUPS === 'true',
    ownerNumber: process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER + '@s.whatsapp.net' : null,
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
    console.error('\n❌ خطأ فادح: SESSION_DATA غير موجود!\n');
    console.log('📋 الخطوات المطلوبة:');
    console.log('1. شغّل ملف generate-stable.js على Ubuntu/Linux');
    console.log('2. امسح QR Code أو استخدم Pairing Code');
    console.log('3. انسخ SESSION_DATA من اللوجات');
    console.log('4. في Clever Cloud:');
    console.log('   - اذهب إلى Environment Variables');
    console.log('   - أضف: SESSION_DATA = [النص الطويل]');
    console.log('   - Update changes');
    console.log('5. Restart البوت\n');
    console.log('⚠️ البوت سيتوقف الآن حتى تضيف SESSION_DATA\n');
    process.exit(1);
}

console.log('✅ SESSION_DATA موجود - جاري التحميل...\n');

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
    console.log(`🌐 HTTP Server: http://localhost:${CONFIG.port}\n`);
});

// ═══════════════════════════════════════════════════════════
// 💾 تحميل الجلسة من SESSION_DATA
// ═══════════════════════════════════════════════════════════

function loadSessionFromEnv() {
    try {
        console.log('🔐 تحميل الجلسة من ENV...');
        
        const sessionStr = CONFIG.sessionData.trim();
        
        // التحقق من صحة البيانات
        if (sessionStr.length < 100) {
            throw new Error('SESSION_DATA قصير جداً - يبدو غير صحيح');
        }
        
        // فك التشفير
        const decoded = Buffer.from(sessionStr, 'base64').toString('utf-8');
        const session = JSON.parse(decoded);
        
        // التحقق من البنية
        if (!session.creds || !session.creds.noiseKey) {
            throw new Error('SESSION_DATA لا يحتوي على بيانات صحيحة');
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
        console.log(`📁 تم إنشاء: ${authPath}/creds.json\n`);
        
        return true;
        
    } catch (error) {
        console.error('\n❌ فشل تحميل SESSION_DATA:', error.message);
        console.log('\n📋 الحل:');
        console.log('1. تأكد أن SESSION_DATA صحيح ومكتمل');
        console.log('2. شغّل generate-stable.js للحصول على SESSION_DATA جديد');
        console.log('3. انسخه بالكامل (لا تقطع منه شيء)');
        console.log('4. حدّث Environment Variable في Clever Cloud');
        console.log('5. Restart البوت\n');
        process.exit(1);
    }
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
// 🤖 دالة بدء البوت
// ═══════════════════════════════════════════════════════════

async function startBot() {
    if (isConnecting) {
        console.log('⏳ محاولة اتصال جارية...\n');
        return;
    }
    
    isConnecting = true;
    
    try {
        console.log('🚀 بدء البوت...\n');
        
        // ⭐ تحميل الجلسة من ENV أولاً
        loadSessionFromEnv();
        
        // جلب أحدث إصدار
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')} ${isLatest ? '✅' : '⚠️'}\n`);
        
        // تحميل حالة المصادقة
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        // التحقق من وجود الجلسة
        if (!state.creds.registered) {
            console.error('\n❌ الجلسة غير مسجلة!');
            console.log('💡 يبدو أن SESSION_DATA غير صحيح');
            console.log('📋 شغّل generate-stable.js للحصول على جلسة جديدة\n');
            process.exit(1);
        }
        
        console.log('✅ الجلسة صالحة - جاري الاتصال...\n');
        
        // إنشاء الاتصال
        sock = makeWASocket({
            version,
            logger: P({ level: CONFIG.logLevel }),
            printQRInTerminal: false, // ⚠️ ممنوع QR - نستخدم SESSION_DATA فقط
            
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
            },
            
            browser: Browsers.ubuntu('Desktop'),
            markOnlineOnConnect: false,
            syncFullHistory: false,
            
            msgRetryCounterCache,
            defaultQueryTimeoutMs: 60000,
            
            getMessage: async () => undefined,
            
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            
            emitOwnEvents: false,
            fireInitQueries: true,
            generateHighQualityLinkPreview: false,
            
            mobile: false,
            shouldIgnoreJid: jid => jid === 'status@broadcast'
        });

        // حفظ التحديثات
        sock.ev.on('creds.update', saveCreds);

        // ═══════════════════════════════════════════════════════════
        // 📱 معالجة الاتصال
        // ═══════════════════════════════════════════════════════════
        
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // ⚠️ إذا طُلب QR = SESSION_DATA غير صحيح
            if (qr) {
                console.error('\n❌ خطأ: تم طلب QR Code!');
                console.error('هذا يعني أن SESSION_DATA غير صالح أو منتهي\n');
                console.log('📋 الحل:');
                console.log('1. شغّل generate-stable.js');
                console.log('2. احصل على SESSION_DATA جديد');
                console.log('3. حدّثه في Clever Cloud Environment Variables');
                console.log('4. Restart البوت\n');
                process.exit(1);
            }
            
            // الاتصال مغلق
            if (connection === 'close') {
                isConnecting = false;
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                console.log(`\n❌ الاتصال مغلق - كود: ${statusCode}\n`);
                
                // معالجة الأخطاء
                switch (statusCode) {
                    case DisconnectReason.badSession:
                    case DisconnectReason.loggedOut:
                    case 401:
                    case 403:
                    case 440:
                        console.log('🔑 الجلسة منتهية أو غير صالحة\n');
                        console.log('📋 الحل:');
                        console.log('1. شغّل generate-stable.js');
                        console.log('2. احصل على SESSION_DATA جديد');
                        console.log('3. حدّثه في Clever Cloud\n');
                        process.exit(1);
                        break;
                    
                    case DisconnectReason.connectionReplaced:
                        console.log('🔄 جلسة أخرى نشطة - توقف\n');
                        process.exit(1);
                        break;
                    
                    case 515:
                        console.log('🚫 خطأ 515\n');
                        console.log('💡 الحل:');
                        console.log('1. أغلق جميع جلسات واتساب ويب');
                        console.log('2. احذف الأجهزة المرتبطة');
                        console.log('3. انتظر 5 دقائق');
                        console.log('4. احصل على SESSION_DATA جديد\n');
                        
                        if (reconnectAttempts === 0) {
                            console.log('⏰ انتظار دقيقة واحدة...\n');
                            await delay(60000);
                            reconnectSafely();
                        } else {
                            process.exit(1);
                        }
                        break;
                    
                    default:
                        if (shouldReconnect) {
                            console.log('🔄 إعادة الاتصال...\n');
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
                console.log(`   👨‍💻 المالك: ${CONFIG.botOwner}`);
                console.log(`   👥 المجموعات: ${CONFIG.replyInGroups ? 'نعم ✅' : 'لا ❌'}`);
                console.log('════════════════════════════════════\n');
                
                processedMessages.clear();
                
                // إشعار المالك
                if (CONFIG.ownerNumber) {
                    setTimeout(async () => {
                        try {
                            await sock.sendMessage(CONFIG.ownerNumber, {
                                text: `✅ *${CONFIG.botName} متصل الآن!*\n\n` +
                                      `📱 الرقم: ${sock.user.id.split(':')[0]}\n` +
                                      `👤 الاسم: ${sock.user.name || '---'}\n` +
                                      `⏰ ${new Date().toLocaleString('ar-EG')}\n` +
                                      `👥 المجموعات: ${CONFIG.replyInGroups ? 'نعم ✅' : 'لا ❌'}`
                            });
                            console.log('✅ تم إرسال إشعار للمالك\n');
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
                
                // فلترة
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

                // الرد
                try {
                    await sock.sendMessage(sender, { 
                        text: `👋 *مرحباً بك!*\n\n` +
                              `أنا *${CONFIG.botName}* 🤖\n` +
                              `من تصميم *${CONFIG.botOwner}* 👨‍💻\n\n` +
                              `شكراً لرسالتك:\n` +
                              `_"${text}"_\n\n` +
                              `${isGroup ? '👥 مجموعة' : '👤 خاص'}\n` +
                              `البوت يعمل بنجاح ✅`
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
// 🔄 إعادة الاتصال
// ═══════════════════════════════════════════════════════════

async function reconnectSafely() {
    if (reconnectAttempts >= MAX_RECONNECT) {
        console.log('\n❌ فشل الاتصال بعد عدة محاولات\n');
        console.log('💡 الحل:');
        console.log('1. شغّل generate-stable.js');
        console.log('2. احصل على SESSION_DATA جديد');
        console.log('3. حدّثه في Clever Cloud\n');
        process.exit(1);
    }
    
    reconnectAttempts++;
    const delayTime = Math.min(reconnectAttempts * 5000, 30000);
    
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
process.on('unhandledRejection', (err) => console.error('❌ Rejection:', err));
process.on('uncaughtException', (err) => console.error('❌ Exception:', err));

// ═══════════════════════════════════════════════════════════
// 🚀 بدء البوت
// ═══════════════════════════════════════════════════════════

console.log('╔════════════════════════════════════════════════╗');
console.log('║                                                ║');
console.log('║       🤖 WhatsApp Bot - SESSION_DATA Mode     ║');
console.log('║         يعمل فقط مع SESSION_DATA من ENV        ║');
console.log('║                                                ║');
console.log('╚════════════════════════════════════════════════╝\n');

startBot();

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
// 🌐 سيرفر HTTP مع عرض QR
// ═══════════════════════════════════════════════════════════

let currentQR = null;
let isConnected = false;
let botInfo = null;

const server = http.createServer((req, res) => {
    // صفحة QR Code
    if (req.url === '/qr' || req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        
        if (isConnected && botInfo) {
            // البوت متصل
            res.end(`
<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${CONFIG.botName} - متصل</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        .success-icon {
            font-size: 80px;
            margin-bottom: 20px;
        }
        h1 {
            color: #10b981;
            font-size: 32px;
            margin-bottom: 20px;
        }
        .info {
            background: #f0fdf4;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
            border-right: 4px solid #10b981;
        }
        .info-item {
            display: flex;
            justify-content: space-between;
            margin: 10px 0;
            font-size: 16px;
        }
        .label {
            color: #6b7280;
            font-weight: 500;
        }
        .value {
            color: #1f2937;
            font-weight: 600;
        }
        .note {
            color: #6b7280;
            font-size: 14px;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="success-icon">✅</div>
        <h1>البوت متصل بنجاح!</h1>
        
        <div class="info">
            <div class="info-item">
                <span class="label">🤖 اسم البوت:</span>
                <span class="value">${botInfo.name}</span>
            </div>
            <div class="info-item">
                <span class="label">📱 رقم الهاتف:</span>
                <span class="value">${botInfo.number}</span>
            </div>
            <div class="info-item">
                <span class="label">👤 اسم الحساب:</span>
                <span class="value">${botInfo.userName}</span>
            </div>
            <div class="info-item">
                <span class="label">👥 الرد في المجموعات:</span>
                <span class="value">${botInfo.groups ? 'نعم ✅' : 'لا ❌'}</span>
            </div>
            <div class="info-item">
                <span class="label">⏰ وقت الاتصال:</span>
                <span class="value">${botInfo.time}</span>
            </div>
        </div>
        
        <p class="note">البوت يعمل بشكل صحيح ويستقبل الرسائل 🎉</p>
    </div>
</body>
</html>
            `);
        } else if (currentQR) {
            // عرض QR Code
            res.end(`
<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${CONFIG.botName} - مسح QR Code</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
            max-width: 500px;
            width: 100%;
        }
        h1 {
            color: #667eea;
            font-size: 28px;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #6b7280;
            font-size: 16px;
            margin-bottom: 30px;
        }
        #qrcode {
            background: white;
            padding: 20px;
            border-radius: 15px;
            display: inline-block;
            margin: 20px 0;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
        }
        .steps {
            background: #f9fafb;
            padding: 20px;
            border-radius: 10px;
            margin-top: 20px;
            text-align: right;
        }
        .step {
            display: flex;
            align-items: center;
            margin: 15px 0;
            gap: 15px;
        }
        .step-number {
            background: #667eea;
            color: white;
            width: 30px;
            height: 30px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            flex-shrink: 0;
        }
        .step-text {
            color: #374151;
            text-align: right;
            flex: 1;
        }
        .timer {
            color: #ef4444;
            font-size: 18px;
            font-weight: bold;
            margin-top: 20px;
        }
        .warning {
            background: #fef2f2;
            color: #dc2626;
            padding: 15px;
            border-radius: 10px;
            margin-top: 20px;
            border-right: 4px solid #ef4444;
        }
        @keyframes pulse {
            0%, 100% { transform: scale(1); }
            50% { transform: scale(1.05); }
        }
        #qrcode img {
            animation: pulse 2s infinite;
        }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
</head>
<body>
    <div class="container">
        <h1>🤖 ${CONFIG.botName}</h1>
        <p class="subtitle">امسح الكود لربط البوت بواتساب</p>
        
        <div id="qrcode"></div>
        
        <div class="steps">
            <div class="step">
                <div class="step-number">1</div>
                <div class="step-text">افتح تطبيق واتساب على هاتفك</div>
            </div>
            <div class="step">
                <div class="step-number">2</div>
                <div class="step-text">اذهب إلى: الإعدادات ← الأجهزة المرتبطة</div>
            </div>
            <div class="step">
                <div class="step-number">3</div>
                <div class="step-text">اضغط على "ربط جهاز"</div>
            </div>
            <div class="step">
                <div class="step-number">4</div>
                <div class="step-text">امسح الكود أعلاه ☝️</div>
            </div>
        </div>
        
        <div class="warning">
            ⚠️ امسح الكود خلال 60 ثانية قبل انتهاء صلاحيته
        </div>
        
        <p class="timer" id="timer">⏰ جاري التحميل...</p>
    </div>
    
    <script>
        // عرض QR Code
        const qrData = ${JSON.stringify(currentQR)};
        new QRCode(document.getElementById("qrcode"), {
            text: qrData,
            width: 256,
            height: 256,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });
        
        // العد التنازلي
        let seconds = 60;
        const timerEl = document.getElementById('timer');
        
        const countdown = setInterval(() => {
            seconds--;
            timerEl.textContent = '⏰ متبقي: ' + seconds + ' ثانية';
            
            if (seconds <= 0) {
                clearInterval(countdown);
                timerEl.textContent = '❌ انتهت صلاحية الكود - حدّث الصفحة';
                timerEl.style.color = '#dc2626';
            } else if (seconds <= 10) {
                timerEl.style.color = '#dc2626';
            }
        }, 1000);
        
        // تحديث الصفحة كل 3 ثواني للتحقق من الاتصال
        setInterval(() => {
            fetch('/status')
                .then(r => r.json())
                .then(data => {
                    if (data.connected) {
                        window.location.reload();
                    }
                })
                .catch(() => {});
        }, 3000);
    </script>
</body>
</html>
            `);
        } else {
            // في انتظار QR Code
            res.end(`
<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${CONFIG.botName} - جاري التحميل</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .container {
            background: white;
            border-radius: 20px;
            padding: 60px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
        }
        .spinner {
            border: 5px solid #f3f3f3;
            border-top: 5px solid #667eea;
            border-radius: 50%;
            width: 60px;
            height: 60px;
            animation: spin 1s linear infinite;
            margin: 0 auto 30px;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        h2 {
            color: #374151;
            font-size: 24px;
        }
        p {
            color: #6b7280;
            margin-top: 15px;
        }
    </style>
    <meta http-equiv="refresh" content="2">
</head>
<body>
    <div class="container">
        <div class="spinner"></div>
        <h2>🔄 جاري تحضير QR Code...</h2>
        <p>انتظر قليلاً، سيظهر الكود تلقائياً</p>
    </div>
</body>
</html>
            `);
        }
    }
    
    // API للتحقق من الحالة
    else if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            connected: isConnected,
            hasQR: currentQR !== null,
            bot: CONFIG.botName,
            time: new Date().toISOString()
        }));
    }
    
    // الصفحة الافتراضية
    else {
        res.writeHead(302, { 'Location': '/qr' });
        res.end();
    }
});

server.listen(CONFIG.port, () => {
    console.log(`🌐 HTTP Server: http://localhost:${CONFIG.port}`);
    console.log(`📱 QR Code Page: http://localhost:${CONFIG.port}/qr\n`);
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
            
            // عرض QR Code في الويب
            if (qr) {
                currentQR = qr;
                console.log('\n📱 ═══════════════════════════════════════');
                console.log('       QR Code جاهز للمسح!');
                console.log('═══════════════════════════════════════\n');
                console.log('🔗 افتح هذا الرابط في المتصفح:\n');
                console.log(`   👉 http://localhost:${CONFIG.port}/qr`);
                console.log('\n   أو إذا كنت على شبكة محلية، استخدم IP الجهاز');
                console.log('═══════════════════════════════════════\n');
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
                currentQR = null;
                isConnected = true;
                botInfo = {
                    name: CONFIG.botName,
                    number: sock.user?.id?.split(':')[0] || '---',
                    userName: sock.user?.name || '---',
                    groups: CONFIG.replyInGroups,
                    time: new Date().toLocaleString('ar-EG')
                };
                
                console.log('\n✅ ════════════════════════════════════');
                console.log('   🎉 متصل بواتساب بنجاح!');
                console.log(`   📱 الرقم: ${botInfo.number}`);
                console.log(`   👤 الاسم: ${botInfo.userName}`);
                console.log(`   🤖 البوت: ${CONFIG.botName}`);
                console.log(`   👥 المجموعات: ${CONFIG.replyInGroups ? 'نعم ✅' : 'لا ❌'}`);
                console.log('════════════════════════════════════\n');
                console.log(`🌐 عرض التفاصيل: http://localhost:${CONFIG.port}/qr\n`);
                
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

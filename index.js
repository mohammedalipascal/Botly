const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const http = require('http');

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

// دالة بدء البوت
async function startBot() {
    try {
        console.log('🚀 Starting WhatsApp Bot...');
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: P({ level: 'silent' }),
            browser: ['WhatsApp Bot', 'Chrome', '1.0.0']
        });

        // حفظ بيانات المصادقة
        sock.ev.on('creds.update', saveCreds);

        // معالجة الاتصال
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.log('\n📱 ════════════════════════════════════');
                console.log('   QR CODE جاهز للمسح!');
                console.log('   افتح واتساب > الأجهزة المرتبطة');
                console.log('════════════════════════════════════\n');
            }
            
            if (connection === 'close') {
                const shouldReconnect = 
                    (lastDisconnect?.error instanceof Boom) &&
                    lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut;
                
                console.log('❌ الاتصال مغلق. السبب:', lastDisconnect?.error?.output?.statusCode);
                
                if (shouldReconnect) {
                    console.log('🔄 إعادة الاتصال بعد 3 ثواني...');
                    setTimeout(startBot, 3000);
                } else {
                    console.log('🚪 تم تسجيل الخروج. احذف مجلد auth_info وأعد التشغيل');
                }
            } else if (connection === 'open') {
                console.log('\n✅ ════════════════════════════════════');
                console.log('   متصل بواتساب بنجاح! 🎉');
                console.log('   البوت جاهز للعمل');
                console.log('════════════════════════════════════\n');
            } else if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال بواتساب...');
            }
        });

        // معالجة الرسائل - رد ترحيبي بسيط فقط
        sock.ev.on('messages.upsert', async ({ messages }) => {
            const msg = messages[0];
            
            // تجاهل الرسائل القديمة والرسائل من البوت نفسه
            if (!msg.message || msg.key.fromMe) return;
            
            const sender = msg.key.remoteJid;
            const messageText = 
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                '';

            console.log(`📩 رسالة جديدة من ${sender}`);
            console.log(`📝 النص: ${messageText}`);

            // الرد الترحيبي التلقائي
            try {
                await sock.sendMessage(sender, { 
                    text: `👋 *مرحباً بك!*

أنا بوت واتساب 🤖

شكراً لرسالتك:
"${messageText}"

البوت يعمل بنجاح! ✅` 
                });
                
                console.log('✅ تم الرد على الرسالة');
            } catch (error) {
                console.error('❌ خطأ في إرسال الرد:', error);
            }
        });

        console.log('✅ تم تهيئة البوت بنجاح');
        
    } catch (error) {
        console.error('❌ خطأ في بدء البوت:', error);
        console.log('🔄 إعادة المحاولة بعد 5 ثواني...');
        setTimeout(startBot, 5000);
    }
}

// بدء البوت
startBot();

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

// دالة بدء البوت
async function startBot() {
    try {
        console.log('🚀 Starting WhatsApp Bot...');
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false, // تم تعطيله
            logger: P({ level: 'silent' }),
            browser: ['WhatsApp Bot', 'Chrome', '1.0.0']
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
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            // تجاهل الرسائل من نوع "notify" فقط
            if (type !== 'notify') return;
            
            const msg = messages[0];
            if (!msg || !msg.message) return;
            
            // تجاهل الرسائل من البوت نفسه
            if (msg.key.fromMe) {
                console.log('⏭️ تجاهل رسالة من البوت نفسه');
                return;
            }
            
            // تجاهل رسائل البرودكاست والحالات
            const sender = msg.key.remoteJid;
            if (sender === 'status@broadcast') {
                console.log('⏭️ تجاهل رسالة حالة');
                return;
            }
            
            const messageText = 
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                '';

            console.log(`\n📩 رسالة جديدة من ${sender}`);
            console.log(`📝 النص: ${messageText}`);
            console.log(`🔍 fromMe: ${msg.key.fromMe}`);

            // الرد الترحيبي التلقائي مرة واحدة فقط
            try {
                await sock.sendMessage(sender, { 
                    text: `👋 *مرحباً بك!*

أنا Botly مساعدك الذكي 
من تصميم مقداد

شكراً لرسالتك:
"${messageText}"

البوت يعمل بنجاح! ✅` 
                });
                
                console.log('✅ تم الرد على الرسالة\n');
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

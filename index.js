require('dotenv').config();
const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const http = require('http');
const fs = require('fs');
const path = require('path');

// قراءة الإعدادات من ENV
const CONFIG = {
    phoneNumber: process.env.PHONE_NUMBER || '',
    botName: process.env.BOT_NAME || 'بوت واتساب',
    botOwner: process.env.BOT_OWNER || '',
    replyToGroups: process.env.REPLY_TO_GROUPS === 'true',
    welcomeMessage: process.env.WELCOME_MESSAGE || '👋 مرحباً! أنا بوت واتساب 🤖',
    useAI: process.env.USE_AI === 'true',
    logLevel: process.env.LOG_LEVEL || 'info'
};

console.log('⚙️ إعدادات البوت:');
console.log(`   📱 رقم الهاتف: ${CONFIG.phoneNumber || 'غير محدد'}`);
console.log(`   👥 الرد على المجموعات: ${CONFIG.replyToGroups ? 'نعم ✅' : 'لا ❌'}`);
console.log(`   🤖 استخدام AI: ${CONFIG.useAI ? 'نعم ✅' : 'لا ❌'}`);

// سيرفر HTTP للحفاظ على النشاط
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: CONFIG.botName,
        time: new Date().toISOString(),
        config: {
            replyToGroups: CONFIG.replyToGroups,
            useAI: CONFIG.useAI
        }
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
        
        // استخدام مجلد auth_info لحفظ الجلسة
        const authPath = path.join(__dirname, 'auth_info');
        
        // إنشاء المجلد إذا لم يكن موجود
        if (!fs.existsSync(authPath)) {
            fs.mkdirSync(authPath, { recursive: true });
            console.log('📁 تم إنشاء مجلد auth_info');
        }
        
        const { state, saveCreds } = await useMultiFileAuthState(authPath);
        
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: false,
            logger: P({ level: CONFIG.logLevel }),
            browser: [CONFIG.botName, 'Chrome', '1.0.0'],
            // إعدادات إضافية للحفاظ على الجلسة
            getMessage: async (key) => {
                return { conversation: '' };
            }
        });

        // ⭐ حفظ بيانات المصادقة تلقائياً
        sock.ev.on('creds.update', saveCreds);

        // طلب Pairing Code إذا لم يكن مسجل
        if (!state.creds.registered && CONFIG.phoneNumber) {
            console.log('\n🔑 ════════════════════════════════════');
            console.log('   جاري طلب Pairing Code...');
            console.log('════════════════════════════════════\n');
            
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(CONFIG.phoneNumber);
                    console.log('\n\n');
                    console.log('█████████████████████████████████████████████████████');
                    console.log('█                                                   █');
                    console.log('█              🔑 PAIRING CODE 🔑                   █');
                    console.log('█                                                   █');
                    console.log(`█                    ${code}                        █`);
                    console.log('█                                                   █');
                    console.log('█████████████████████████████████████████████████████');
                    console.log('\n📱 الخطوات:');
                    console.log('1. افتح واتساب');
                    console.log('2. الأجهزة المرتبطة > ربط جهاز');
                    console.log('3. ربط باستخدام رقم الهاتف');
                    console.log(`4. أدخل الكود: ${code}`);
                    console.log('\n⚠️ ملاحظة: بعد الربط الأول، لن تحتاج لإعادة الربط!');
                    console.log('   ستبقى الجلسة محفوظة في مجلد auth_info\n');
                    console.log('█████████████████████████████████████████████████████\n\n');
                } catch (error) {
                    console.error('❌ خطأ في طلب Pairing Code:', error.message);
                }
            }, 3000);
        } else if (state.creds.registered) {
            console.log('✅ الجلسة محفوظة! لا حاجة لإعادة الربط 🎉');
        }

        // معالجة الاتصال
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const shouldReconnect = 
                    (lastDisconnect?.error instanceof Boom) &&
                    lastDisconnect.error.output?.statusCode !== DisconnectReason.loggedOut;
                
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`❌ الاتصال مغلق. السبب: ${statusCode}`);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('🚪 تم تسجيل الخروج!');
                    console.log('⚠️ احذف مجلد auth_info وأعد التشغيل للربط من جديد');
                } else if (shouldReconnect) {
                    console.log('🔄 إعادة الاتصال بعد 3 ثواني...');
                    setTimeout(startBot, 3000);
                }
            } else if (connection === 'open') {
                console.log('\n✅ ════════════════════════════════════');
                console.log('   متصل بواتساب بنجاح! 🎉');
                console.log('   البوت جاهز للعمل');
                console.log('   الجلسة محفوظة في: auth_info/');
                console.log('════════════════════════════════════\n');
            } else if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال بواتساب...');
            }
        });

        // معالجة الرسائل
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;
            
            const msg = messages[0];
            if (!msg || !msg.message) return;
            
            // تجاهل رسائل البوت نفسه
            if (msg.key.fromMe) {
                console.log('⏭️ تجاهل رسالة من البوت نفسه');
                return;
            }
            
            const sender = msg.key.remoteJid;
            
            // تجاهل رسائل الحالة
            if (sender === 'status@broadcast') {
                console.log('⏭️ تجاهل رسالة حالة');
                return;
            }
            
            // التحقق من المجموعات
            const isGroup = sender.endsWith('@g.us');
            
            if (isGroup && !CONFIG.replyToGroups) {
                console.log(`⏭️ تجاهل رسالة من مجموعة: ${sender}`);
                console.log('   (الرد على المجموعات معطل في ENV)');
                return;
            }
            
            // استخراج النص
            const messageText = 
                msg.message.conversation ||
                msg.message.extendedTextMessage?.text ||
                msg.message.imageMessage?.caption ||
                '';

            console.log(`\n📩 رسالة ${isGroup ? 'من مجموعة' : 'خاصة'}: ${sender}`);
            console.log(`📝 النص: ${messageText}`);

            // الرد (سيتم تطويره لاحقاً مع AI)
            try {
                let replyText;
                
                if (CONFIG.useAI) {
                    // هنا سيتم إضافة AI لاحقاً
                    replyText = `🤖 ${CONFIG.welcomeMessage}\n\n(AI قيد التطوير...)`;
                } else {
                    // رد بسيط للآن
                    replyText = `${CONFIG.welcomeMessage}

شكراً لرسالتك:
"${messageText}"

${isGroup ? '👥 رسالة من مجموعة' : '💬 رسالة خاصة'}
البوت يعمل بنجاح! ✅`;
                }
                
                await sock.sendMessage(sender, { text: replyText });
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

// معالجة إيقاف البرنامج بشكل صحيح
process.on('SIGINT', () => {
    console.log('\n👋 إيقاف البوت...');
    console.log('✅ الجلسة محفوظة في auth_info/');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 إيقاف البوت من السيرفر...');
    console.log('✅ الجلسة محفوظة في auth_info/');
    process.exit(0);
});

// بدء البوت
startBot();

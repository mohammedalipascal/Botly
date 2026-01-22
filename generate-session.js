const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
    useMultiFileAuthState, 
    DisconnectReason,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

console.log('\n');
console.log('═'.repeat(60));
console.log('   🔐 مولد جلسة WhatsApp Bot - نسخة محسّنة');
console.log('═'.repeat(60));
console.log('\n');

let qrCount = 0;
const MAX_QR_ATTEMPTS = 3;
let connectionAttempts = 0;

// دالة الانتظار
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function generateSession() {
    try {
        connectionAttempts++;
        
        if (connectionAttempts > 1) {
            console.log(`🔄 محاولة ${connectionAttempts}...\n`);
        }

        // حذف مجلد auth_info القديم في أول محاولة
        const authPath = path.join(__dirname, 'auth_info');
        if (connectionAttempts === 1 && fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('🗑️  تم حذف الجلسة القديمة\n');
        }

        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        console.log('🚀 بدء الاتصال بـ WhatsApp...\n');
        
        // استخدام إعدادات بسيطة بدون fetchLatestBaileysVersion
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
            },
            printQRInTerminal: false,
            logger: P({ level: 'silent' }),
            browser: Browsers.ubuntu('Chrome'), // استخدام Browsers من Baileys مباشرة
            
            // إعدادات الاتصال المحسّنة
            connectTimeoutMs: 60_000,
            defaultQueryTimeoutMs: 60_000,
            keepAliveIntervalMs: 30_000,
            
            // إعدادات إضافية للاستقرار
            retryRequestDelayMs: 250,
            maxMsgRetryCount: 5,
            
            // تعطيل المزامنة الكاملة
            syncFullHistory: false,
            markOnlineOnConnect: false,
            
            // تحسين معالجة الرسائل
            shouldIgnoreJid: jid => false,
            shouldSyncHistoryMessage: () => false,
            
            getMessage: async () => undefined
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                qrCount++;
                
                if (qrCount > MAX_QR_ATTEMPTS) {
                    console.error('\n❌ تجاوزت الحد الأقصى من محاولات QR');
                    console.log('\n💡 الحلول المقترحة:');
                    console.log('   1. أعد تشغيل الراوتر وانتظر دقيقة');
                    console.log('   2. جرب استخدام VPN');
                    console.log('   3. جرب من شبكة إنترنت مختلفة');
                    console.log('   4. تأكد أن واتساب محدث لآخر إصدار\n');
                    process.exit(1);
                }
                
                console.clear(); // مسح الشاشة للوضوح
                console.log('\n' + '═'.repeat(60));
                console.log(`   📱 QR CODE #${qrCount} - امسحه الآن!`);
                console.log('═'.repeat(60) + '\n');
                
                // عرض QR في الترمينال
                console.log('📱 QR Code:\n');
                qrcode.generate(qr, { small: true });
                
                console.log('\n' + '─'.repeat(60));
                console.log('🔗 أو استخدم الرابط (افتحه في متصفح جديد):');
                console.log(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qr)}`);
                console.log('─'.repeat(60) + '\n');
                
                console.log('📋 الخطوات:');
                console.log('   1. افتح واتساب على هاتفك');
                console.log('   2. الإعدادات > الأجهزة المرتبطة');
                console.log('   3. "ربط جهاز"');
                console.log('   4. امسح الكود أعلاه\n');
                console.log(`⏰ لديك 60 ثانية... (محاولة ${qrCount}/${MAX_QR_ATTEMPTS})\n`);
            }
            
            if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال بـ WhatsApp...\n');
            }
            
            if (connection === 'open') {
                console.clear();
                console.log('\n' + '═'.repeat(60));
                console.log('   ✅ تم الاتصال بنجاح! 🎉');
                console.log('═'.repeat(60) + '\n');
                
                console.log('⏳ جاري حفظ بيانات الجلسة...\n');
                
                // انتظار أطول لضمان حفظ كل البيانات
                await sleep(8000);
                
                // قراءة البيانات
                const credsPath = path.join(__dirname, 'auth_info', 'creds.json');
                
                if (!fs.existsSync(credsPath)) {
                    console.error('❌ لم يتم حفظ بيانات الجلسة!');
                    console.log('🔄 جرب مرة أخرى...\n');
                    process.exit(1);
                }
                
                const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
                const sessionObj = { creds };
                const sessionString = Buffer.from(JSON.stringify(sessionObj)).toString('base64');
                
                console.log('✅ تم إنشاء SESSION_DATA بنجاح!\n');
                console.log('═'.repeat(70));
                console.log('   📋 SESSION_DATA - انسخ السطر التالي كاملاً');
                console.log('═'.repeat(70) + '\n');
                console.log(`SESSION_DATA=${sessionString}\n`);
                console.log('═'.repeat(70) + '\n');
                
                console.log('📝 الخطوات التالية:');
                console.log('   1. انسخ السطر أعلاه (SESSION_DATA=...)');
                console.log('   2. افتح ملف .env');
                console.log('   3. الصق السطر في الملف');
                console.log('   4. احفظ الملف');
                console.log('   5. شغّل البوت: npm start\n');
                
                console.log('⚠️  تحذير أمني:');
                console.log('   ❌ لا تشارك SESSION_DATA مع أي شخص');
                console.log('   ❌ لا تنشره على GitHub أو أي موقع');
                console.log('   ✅ احذف مجلد auth_info بعد النسخ\n');
                
                // حفظ في ملف
                try {
                    const sessionFile = path.join(__dirname, 'SESSION_DATA.txt');
                    fs.writeFileSync(sessionFile, `SESSION_DATA=${sessionString}`, 'utf-8');
                    console.log(`💾 تم الحفظ أيضاً في: SESSION_DATA.txt\n`);
                } catch (e) {
                    console.log('⚠️  لم يتم حفظ الملف\n');
                }
                
                console.log('═'.repeat(70) + '\n');
                console.log('👋 جاري الإغلاق...\n');
                
                // تسجيل الخروج النظيف
                try {
                    await sock.logout();
                    await sleep(2000);
                } catch (e) {
                    // تجاهل
                }
                
                console.log('✅ تم! يمكنك الآن تشغيل البوت.\n');
                process.exit(0);
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                console.log(`\n❌ الاتصال مغلق - كود: ${statusCode || 'Unknown'}\n`);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('✅ تم الخروج بنجاح\n');
                    process.exit(0);
                }
                
                // معالجة الأخطاء حسب النوع
                if (statusCode === 515) {
                    console.log('⚠️  خطأ 515 - رفض الاتصال من WhatsApp\n');
                    console.log('💡 الحلول:');
                    console.log('   1. انتظر 30-60 ثانية قبل المحاولة التالية');
                    console.log('   2. تأكد من استقرار الإنترنت');
                    console.log('   3. جرب استخدام بيانات الموبايل بدلاً من WiFi');
                    console.log('   4. أعد تشغيل الهاتف والكمبيوتر\n');
                    
                    if (connectionAttempts < 3) {
                        const waitTime = 30;
                        console.log(`🔄 إعادة المحاولة بعد ${waitTime} ثانية...\n`);
                        await sleep(waitTime * 1000);
                        return generateSession();
                    }
                }
                else if (statusCode === 401 || statusCode === 403) {
                    console.log('🔑 خطأ في المصادقة\n');
                    fs.rmSync(authPath, { recursive: true, force: true });
                    
                    if (connectionAttempts < 3) {
                        console.log('🔄 إعادة المحاولة...\n');
                        await sleep(5000);
                        return generateSession();
                    }
                }
                else if (statusCode === DisconnectReason.connectionClosed ||
                         statusCode === DisconnectReason.connectionLost ||
                         statusCode === DisconnectReason.timedOut) {
                    
                    console.log('⚠️  انقطع الاتصال\n');
                    
                    if (connectionAttempts < 3) {
                        console.log('🔄 إعادة المحاولة...\n');
                        await sleep(5000);
                        return generateSession();
                    }
                }
                
                // إذا وصلنا هنا = فشلت كل المحاولات
                console.log('❌ فشلت جميع المحاولات\n');
                console.log('💡 الحل النهائي:');
                console.log('   1. أعد تشغيل الراوتر وانتظر دقيقة');
                console.log('   2. جرب من شبكة مختلفة (موبايل data)');
                console.log('   3. تحديث Baileys: npm update @whiskeysockets/baileys');
                console.log('   4. جرب بعد 10 دقائق\n');
                
                process.exit(1);
            }
        });

    } catch (error) {
        console.error('\n❌ خطأ غير متوقع:', error.message);
        
        if (connectionAttempts < 3) {
            console.log('\n🔄 إعادة المحاولة...\n');
            await sleep(5000);
            return generateSession();
        }
        
        console.log('\n💡 جرب:');
        console.log('   1. تحقق من اتصال الإنترنت');
        console.log('   2. تحديث المكتبات: npm update');
        console.log('   3. حذف node_modules وإعادة التثبيت\n');
        
        process.exit(1);
    }
}

// معالجة الإنهاء
process.on('SIGINT', () => {
    console.log('\n\n👋 تم الإلغاء\n');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n👋 تم الإيقاف\n');
    process.exit(0);
});

// بدء التوليد
generateSession();

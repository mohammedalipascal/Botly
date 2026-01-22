const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');

console.log('\n');
console.log('═'.repeat(60));
console.log('   🔐 مولد جلسة WhatsApp Bot');
console.log('═'.repeat(60));
console.log('\n⚠️  هذا السكريبت لإنشاء SESSION_DATA فقط');
console.log('📱 سيتم عرض QR Code للمسح\n');

let qrCount = 0;
const MAX_QR_ATTEMPTS = 5;
let isConnecting = false;

async function generateSession() {
    try {
        // حذف مجلد auth_info القديم
        const authPath = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('🗑️  تم حذف الجلسة القديمة\n');
        }

        // تحميل أحدث إصدار (بدون await طويل)
        console.log('📦 تحميل Baileys...');
        const versionPromise = fetchLatestBaileysVersion().catch(() => ({
            version: [2, 3000, 0],
            isLatest: false
        }));

        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        // الانتظار السريع للإصدار
        const { version, isLatest } = await Promise.race([
            versionPromise,
            new Promise(resolve => setTimeout(() => resolve({ 
                version: [2, 3000, 0], 
                isLatest: false 
            }), 2000))
        ]);
        
        console.log(`📦 Baileys v${version.join('.')}`);
        console.log('✅ جاهز لتوليد QR Code...\n');
        
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
            },
            printQRInTerminal: false,
            logger: P({ level: 'silent' }),
            browser: ['WhatsApp Bot', 'Chrome', '1.0.0'],
            connectTimeoutMs: 60000, // دقيقة كاملة
            defaultQueryTimeoutMs: 60000,
            qrTimeout: 60000, // دقيقة لـ QR
            markOnlineOnConnect: false,
            syncFullHistory: false,
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                qrCount++;
                
                if (qrCount > MAX_QR_ATTEMPTS) {
                    console.error('\n❌ تجاوزت الحد الأقصى من محاولات QR');
                    console.log('💡 جرب:');
                    console.log('   1. تحقق من اتصال الإنترنت');
                    console.log('   2. أعد تشغيل الراوتر');
                    console.log('   3. جرب بعد 5 دقائق\n');
                    process.exit(1);
                }
                
                console.log('═'.repeat(60));
                console.log(`📱 QR Code #${qrCount} - امسحه فوراً! (صالح لـ 60 ثانية)`);
                console.log('═'.repeat(60));
                console.log('\n📋 خطوات سريعة:');
                console.log('   1. افتح واتساب > الإعدادات > الأجهزة المرتبطة');
                console.log('   2. ربط جهاز');
                console.log('   3. امسح الكود من الرابط أدناه أو الترمينال\n');
                
                // عرض QR في الترمينال مباشرة
                console.log('📱 QR Code في الترمينال:\n');
                qrcode.generate(qr, { small: true });
                
                console.log('\n🔗 أو استخدم هذا الرابط (انسخه والصقه في المتصفح):');
                console.log(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qr)}`);
                console.log('\n' + '═'.repeat(60));
                console.log(`⏳ امسح الآن! لديك 60 ثانية... (محاولة ${qrCount}/${MAX_QR_ATTEMPTS})\n`);
            }
            
            if (connection === 'connecting') {
                if (!isConnecting) {
                    isConnecting = true;
                    console.log('🔄 جاري الاتصال...');
                }
            }
            
            if (connection === 'open') {
                console.log('\n✅ ════════════════════════════════════');
                console.log('   تم الاتصال بنجاح! 🎉');
                console.log('════════════════════════════════════');
                console.log('\n⏳ جاري حفظ بيانات الجلسة...\n');
                
                // انتظار حفظ كامل البيانات
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // قراءة وإنشاء SESSION_DATA
                const credsPath = path.join(__dirname, 'auth_info', 'creds.json');
                
                if (fs.existsSync(credsPath)) {
                    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
                    const sessionObj = { creds };
                    const sessionString = Buffer.from(JSON.stringify(sessionObj)).toString('base64');
                    
                    console.log('\n' + '═'.repeat(70));
                    console.log('   🎉 تم إنشاء SESSION_DATA بنجاح!');
                    console.log('═'.repeat(70));
                    console.log('\n📋 الخطوة 1: انسخ السطر التالي كاملاً:\n');
                    console.log('─'.repeat(70));
                    console.log(`SESSION_DATA=${sessionString}`);
                    console.log('─'.repeat(70));
                    console.log('\n📋 الخطوة 2: افتح ملف .env والصق السطر أعلاه');
                    console.log('\n📋 الخطوة 3: شغّل البوت: npm start');
                    console.log('\n⚠️  تحذيرات مهمة:');
                    console.log('   ❌ لا تشارك SESSION_DATA مع أي شخص');
                    console.log('   ❌ لا تنشره على الإنترنت');
                    console.log('   ✅ احفظه في مكان آمن');
                    console.log('   ✅ يمكنك حذف مجلد auth_info الآن\n');
                    console.log('═'.repeat(70) + '\n');
                    
                    // محاولة حفظ في ملف
                    try {
                        const sessionFilePath = path.join(__dirname, 'SESSION_DATA.txt');
                        fs.writeFileSync(sessionFilePath, `SESSION_DATA=${sessionString}`, 'utf-8');
                        console.log(`💾 تم حفظ نسخة في: ${sessionFilePath}\n`);
                    } catch (e) {
                        console.log('⚠️  لم يتم حفظ الملف، انسخ من الأعلى\n');
                    }
                    
                    // تسجيل الخروج
                    console.log('👋 جاري تسجيل الخروج...\n');
                    try {
                        await sock.logout();
                    } catch (e) {
                        // تجاهل أخطاء تسجيل الخروج
                    }
                    
                    setTimeout(() => {
                        console.log('✅ تم بنجاح! يمكنك الآن تشغيل البوت.\n');
                        process.exit(0);
                    }, 2000);
                    
                } else {
                    console.error('❌ لم يتم العثور على ملف الاعتماد!');
                    console.log('💡 جرب تشغيل السكريبت مرة أخرى\n');
                    process.exit(1);
                }
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.output?.payload?.error || 'Unknown';
                
                console.log(`\n❌ الاتصال مغلق. كود: ${statusCode}`);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('✅ تم تسجيل الخروج بنجاح\n');
                    process.exit(0);
                } 
                else if (statusCode === 515) {
                    console.log('⚠️  خطأ 515: WhatsApp ألغى الاتصال');
                    console.log('💡 الأسباب المحتملة:');
                    console.log('   1. لم تمسح QR Code بسرعة كافية');
                    console.log('   2. مشكلة في اتصال الإنترنت');
                    console.log('   3. واتساب مشغول (جرب بعد دقيقة)');
                    
                    if (qrCount < MAX_QR_ATTEMPTS) {
                        console.log(`\n🔄 سيتم توليد QR Code جديد...`);
                        setTimeout(() => {
                            console.log(''); // سطر فارغ
                        }, 3000);
                    } else {
                        console.log('\n❌ تجاوزت الحد الأقصى من المحاولات\n');
                        process.exit(1);
                    }
                }
                else if (statusCode === DisconnectReason.badSession || 
                         statusCode === DisconnectReason.connectionClosed ||
                         statusCode === DisconnectReason.timedOut) {
                    
                    if (qrCount < MAX_QR_ATTEMPTS) {
                        console.log('🔄 إعادة المحاولة...\n');
                        setTimeout(() => {
                            console.log(''); // سطر فارغ
                        }, 3000);
                    } else {
                        console.log('\n❌ فشلت جميع المحاولات');
                        console.log('💡 جرب:');
                        console.log('   1. تحقق من اتصال الإنترنت');
                        console.log('   2. أعد تشغيل الراوتر');
                        console.log('   3. جرب بعد 5 دقائق\n');
                        process.exit(1);
                    }
                }
                else {
                    console.error(`❌ خطأ غير متوقع: ${reason}`);
                    console.log('💡 جرب تشغيل السكريبت مرة أخرى\n');
                    process.exit(1);
                }
            }
        });

        // معالجة الأخطاء غير المتوقعة
        sock.ev.on('CB:call', async (call) => {
            console.log('📞 تم استلام مكالمة:', call);
        });

    } catch (error) {
        console.error('\n❌ خطأ:', error.message);
        console.log('💡 جرب تشغيل السكريبت مرة أخرى\n');
        process.exit(1);
    }
}

// التعامل مع Ctrl+C
process.on('SIGINT', () => {
    console.log('\n\n👋 تم الإلغاء بواسطة المستخدم\n');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n👋 تم إيقاف السكريبت\n');
    process.exit(0);
});

// بدء التوليد
console.log('🚀 بدء توليد الجلسة...\n');
generateSession();

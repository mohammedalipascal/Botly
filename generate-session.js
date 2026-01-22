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
console.log('📱 سيتم عرض QR Code واحد فقط\n');

let qrShown = false;

async function generateSession() {
    try {
        // حذف مجلد auth_info القديم
        const authPath = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('🗑️  تم حذف الجلسة القديمة\n');
        }

        const { version } = await fetchLatestBaileysVersion();
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
            },
            printQRInTerminal: false,
            logger: P({ level: 'silent' }),
            browser: ['Session Generator', 'Chrome', '1.0.0'],
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr && !qrShown) {
                qrShown = true;
                
                console.log('\n' + '═'.repeat(60));
                console.log('   📱 امسح هذا الـ QR Code بواتساب');
                console.log('═'.repeat(60) + '\n');
                
                // عرض QR في الترمينال
                qrcode.generate(qr, { small: true });
                
                console.log('\n' + '─'.repeat(60));
                console.log('🔗 أو استخدم هذا الرابط:');
                console.log(`https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`);
                console.log('─'.repeat(60) + '\n');
                
                console.log('⏳ في انتظار المسح...\n');
            }
            
            if (connection === 'open') {
                console.log('\n✅ تم الاتصال بنجاح!\n');
                console.log('⏳ جاري إنشاء SESSION_DATA...\n');
                
                // انتظار حفظ البيانات
                await new Promise(resolve => setTimeout(resolve, 3000));
                
                // قراءة وإنشاء SESSION_DATA
                const credsPath = path.join(__dirname, 'auth_info', 'creds.json');
                
                if (fs.existsSync(credsPath)) {
                    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
                    const sessionObj = { creds };
                    const sessionString = Buffer.from(JSON.stringify(sessionObj)).toString('base64');
                    
                    console.log('\n' + '═'.repeat(60));
                    console.log('   🎉 تم إنشاء SESSION_DATA بنجاح!');
                    console.log('═'.repeat(60));
                    console.log('\n📋 انسخ السطر التالي وضعه في ملف .env:\n');
                    console.log('─'.repeat(60));
                    console.log(`SESSION_DATA=${sessionString}`);
                    console.log('─'.repeat(60));
                    console.log('\n⚠️  تحذيرات مهمة:');
                    console.log('   1. لا تشارك هذا الكود مع أي شخص');
                    console.log('   2. احفظه في مكان آمن');
                    console.log('   3. بعد إضافته للـ .env، شغّل البوت العادي');
                    console.log('   4. احذف مجلد auth_info بعد نسخ الكود\n');
                    console.log('═'.repeat(60) + '\n');
                    
                    // تسجيل الخروج وإنهاء
                    await sock.logout();
                    process.exit(0);
                } else {
                    console.error('❌ لم يتم العثور على ملف الاعتماد!');
                    process.exit(1);
                }
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('\n✅ تم تسجيل الخروج بنجاح');
                    process.exit(0);
                } else {
                    console.error('\n❌ فشل الاتصال:', lastDisconnect?.error);
                    process.exit(1);
                }
            }
        });

    } catch (error) {
        console.error('\n❌ خطأ:', error.message);
        process.exit(1);
    }
}

// التعامل مع Ctrl+C
process.on('SIGINT', () => {
    console.log('\n\n👋 تم الإلغاء\n');
    process.exit(0);
});

generateSession();

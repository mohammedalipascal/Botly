const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const path = require('path');

console.log('\n🔐 مولد الجلسة - النسخة المستقرة\n');

let connectionClosed = false;

async function createSession() {
    // حذف الجلسة القديمة
    const authPath = './auth_info';
    if (fs.existsSync(authPath)) {
        fs.rmSync(authPath, { recursive: true, force: true });
        console.log('🗑️  حذف الجلسة القديمة\n');
    }

    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    // إعدادات بسيطة جداً - بدون أي تعقيدات
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true, // عرض QR مباشرة
        logger: pino({ level: 'silent' }),
        browser: ['Chrome (Linux)', '', ''],
        
        // إعدادات بسيطة بدون fetchLatestBaileysVersion
        getMessage: async () => undefined
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\n📱 QR Code ظهر في الأعلى ↑');
            console.log('⏰ امسحه بسرعة من واتساب\n');
        }

        if (connection === 'open') {
            console.log('\n✅ متصل بنجاح!\n');
            console.log('⏳ جاري حفظ البيانات...\n');
            
            // انتظار 5 ثواني
            await new Promise(resolve => setTimeout(resolve, 5000));

            const credsPath = './auth_info/creds.json';
            
            if (fs.existsSync(credsPath)) {
                const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
                const session = { creds };
                const sessionString = Buffer.from(JSON.stringify(session)).toString('base64');

                console.log('═'.repeat(70));
                console.log('✅ SESSION_DATA:\n');
                console.log(`SESSION_DATA=${sessionString}\n`);
                console.log('═'.repeat(70));
                console.log('\n📋 انسخ السطر أعلاه وضعه في .env\n');

                // حفظ في ملف
                fs.writeFileSync('SESSION_DATA.txt', `SESSION_DATA=${sessionString}`);
                console.log('💾 تم الحفظ في SESSION_DATA.txt\n');

                connectionClosed = true;
                process.exit(0);
            }
        }

        if (connection === 'close') {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            console.log(`\n❌ الاتصال مغلق - كود: ${statusCode}\n`);

            if (statusCode === 515) {
                console.log('⚠️  خطأ 515 - جرب الحلول التالية:\n');
                console.log('1. غيّر شبكة الإنترنت (جرب موبايل data)');
                console.log('2. استخدم VPN');
                console.log('3. أعد تشغيل الراوتر وجرب بعد 5 دقائق');
                console.log('4. تأكد أن واتساب محدث لآخر إصدار\n');
            }

            if (!connectionClosed) {
                process.exit(1);
            }
        }
    });
}

createSession().catch(err => {
    console.error('❌ خطأ:', err);
    process.exit(1);
});

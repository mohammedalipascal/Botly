const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
    useMultiFileAuthState, 
    DisconnectReason,
    makeCacheableSignalKeyStore,
    Browsers,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

console.log('\n');
console.log('═'.repeat(60));
console.log('   🔐 مولد جلسة WhatsApp - طريقة الـ Pairing Code');
console.log('═'.repeat(60));
console.log('\n📱 هذه الطريقة تستخدم كود 8 أرقام بدلاً من QR\n');

async function generateSession() {
    try {
        // طلب رقم الهاتف
        console.log('📋 أدخل رقم واتساب (بدون + أو 00):');
        console.log('   مثال: 201234567890\n');
        
        let phoneNumber = await question('رقم الهاتف: ');
        phoneNumber = phoneNumber.trim().replace(/[^0-9]/g, '');
        
        if (!phoneNumber || phoneNumber.length < 10) {
            console.error('\n❌ رقم الهاتف غير صحيح!\n');
            rl.close();
            process.exit(1);
        }
        
        console.log(`\n✅ الرقم: ${phoneNumber}\n`);
        
        // حذف الجلسة القديمة
        const authPath = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('🗑️  تم حذف الجلسة القديمة\n');
        }

        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        console.log('🚀 بدء الاتصال...\n');
        
        const { version } = await fetchLatestBaileysVersion();
        
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
            },
            printQRInTerminal: false,
            logger: P({ level: 'silent' }),
            browser: Browsers.ubuntu('Chrome'),
            
            // إعدادات محسّنة
            connectTimeoutMs: 60_000,
            defaultQueryTimeoutMs: 60_000,
            keepAliveIntervalMs: 30_000,
            
            syncFullHistory: false,
            markOnlineOnConnect: false,
            
            getMessage: async () => undefined
        });

        // طلب كود الربط
        if (!sock.authState.creds.registered) {
            console.log('📱 جاري إنشاء كود الربط...\n');
            
            setTimeout(async () => {
                try {
                    const code = await sock.requestPairingCode(phoneNumber);
                    
                    console.clear();
                    console.log('\n' + '═'.repeat(60));
                    console.log('   🔢 كود الربط الخاص بك');
                    console.log('═'.repeat(60) + '\n');
                    console.log(`   ${code}\n`);
                    console.log('═'.repeat(60) + '\n');
                    console.log('📱 الخطوات:');
                    console.log('   1. افتح واتساب على هاتفك');
                    console.log('   2. الإعدادات > الأجهزة المرتبطة');
                    console.log('   3. "ربط جهاز"');
                    console.log('   4. "ربط باستخدام رقم الهاتف بدلاً من ذلك"');
                    console.log(`   5. أدخل الكود: ${code}\n`);
                    console.log('⏰ الكود صالح لمدة دقيقة واحدة\n');
                    
                } catch (error) {
                    console.error('❌ فشل إنشاء كود الربط:', error.message);
                    process.exit(1);
                }
            }, 3000);
        }

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال...\n');
            }
            
            if (connection === 'open') {
                console.clear();
                console.log('\n' + '═'.repeat(60));
                console.log('   ✅ تم الاتصال بنجاح! 🎉');
                console.log('═'.repeat(60) + '\n');
                
                console.log('⏳ جاري حفظ بيانات الجلسة...\n');
                await sleep(8000);
                
                const credsPath = path.join(__dirname, 'auth_info', 'creds.json');
                
                if (!fs.existsSync(credsPath)) {
                    console.error('❌ لم يتم حفظ البيانات!\n');
                    process.exit(1);
                }
                
                const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
                const sessionObj = { creds };
                const sessionString = Buffer.from(JSON.stringify(sessionObj)).toString('base64');
                
                console.log('✅ تم إنشاء SESSION_DATA بنجاح!\n');
                console.log('═'.repeat(70));
                console.log('   📋 SESSION_DATA');
                console.log('═'.repeat(70) + '\n');
                console.log(`SESSION_DATA=${sessionString}\n`);
                console.log('═'.repeat(70) + '\n');
                
                console.log('📝 الخطوات التالية:');
                console.log('   1. انسخ السطر أعلاه');
                console.log('   2. الصقه في ملف .env');
                console.log('   3. شغّل البوت: npm start\n');
                
                // حفظ في ملف
                try {
                    const sessionFile = path.join(__dirname, 'SESSION_DATA.txt');
                    fs.writeFileSync(sessionFile, `SESSION_DATA=${sessionString}`, 'utf-8');
                    console.log(`💾 تم الحفظ في: SESSION_DATA.txt\n`);
                } catch (e) {}
                
                console.log('═'.repeat(70) + '\n');
                
                try {
                    await sock.logout();
                    await sleep(2000);
                } catch (e) {}
                
                console.log('✅ تم بنجاح!\n');
                rl.close();
                process.exit(0);
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                console.log(`\n❌ الاتصال مغلق - كود: ${statusCode || 'Unknown'}\n`);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('✅ تم الخروج\n');
                    rl.close();
                    process.exit(0);
                } else {
                    console.log('💡 جرب مرة أخرى أو استخدم طريقة QR\n');
                    rl.close();
                    process.exit(1);
                }
            }
        });

    } catch (error) {
        console.error('\n❌ خطأ:', error.message);
        console.log('\n💡 جرب طريقة QR: npm run session\n');
        rl.close();
        process.exit(1);
    }
}

process.on('SIGINT', () => {
    console.log('\n\n👋 تم الإلغاء\n');
    rl.close();
    process.exit(0);
});

generateSession();

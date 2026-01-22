const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion 
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ═══════════════════════════════════════════════════════════
// 🌐 HTTP Server - ضروري لـ Render!
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    const url = req.url;
    
    if (url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="utf-8">
    <title>توليد جلسة واتساب</title>
    <style>
        body { font-family: Arial; text-align: center; padding: 50px; }
        .box { background: #f0f0f0; padding: 20px; border-radius: 10px; max-width: 600px; margin: 0 auto; }
        pre { background: #fff; padding: 15px; overflow-x: auto; text-align: left; }
        .session { word-break: break-all; }
    </style>
</head>
<body>
    <div class="box">
        <h1>🔐 توليد جلسة واتساب</h1>
        <p>⏳ جاري توليد QR Code...</p>
        <p>راجع اللوجات في Render Dashboard</p>
        <hr>
        <p>بعد مسح QR Code، ستظهر SESSION_DATA هنا تلقائياً</p>
        <p>⚠️ لا تغلق هذه الصفحة حتى تحصل على SESSION_DATA</p>
    </div>
</body>
</html>
        `);
    } else if (url === '/session') {
        if (globalSessionData) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: true,
                session: globalSessionData,
                message: 'انسخ SESSION_DATA أدناه'
            }));
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                message: 'الجلسة لم تُنشأ بعد. امسح QR Code أولاً'
            }));
        }
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`\n🌐 Server running on port ${PORT}`);
    console.log(`🔗 URL: https://your-app.onrender.com`);
    console.log('⚠️ هذا السيرفر ضروري لمنع Render من إيقاف التطبيق\n');
});

// ═══════════════════════════════════════════════════════════
// 📊 متغيرات عامة
// ═══════════════════════════════════════════════════════════

let globalSessionData = null;
let isConnected = false;
let qrAttempts = 0;
const MAX_QR_ATTEMPTS = 5;

// ═══════════════════════════════════════════════════════════
// 🔐 توليد الجلسة
// ═══════════════════════════════════════════════════════════

async function generateSession() {
    try {
        console.log('🚀 بدء توليد الجلسة...\n');
        
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')}, أحدث: ${isLatest ? '✅' : '⚠️'}\n`);
        
        // حذف الجلسة القديمة
        const authPath = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('🗑️ تم حذف الجلسة القديمة\n');
        }
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false, // نعرضه يدوياً
            logger: P({ level: 'silent' }),
            browser: ['Session Generator', 'Chrome', '1.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: false
        });

        // حفظ بيانات الاعتماد
        sock.ev.on('creds.update', saveCreds);

        // معالجة الاتصال
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // عرض QR Code
            if (qr) {
                qrAttempts++;
                
                if (qrAttempts > MAX_QR_ATTEMPTS) {
                    console.error('\n❌ تم تجاوز الحد الأقصى لمحاولات QR Code');
                    console.log('💡 أعد تشغيل السكريبت وحاول مرة أخرى\n');
                    process.exit(1);
                }
                
                console.log('\n────────────────────────────────────────────────────────────');
                console.log(`📱 QR Code #${qrAttempts} - امسحه بواتساب الآن!`);
                console.log('────────────────────────────────────────────────────────────');
                console.log('\n📋 خطوات المسح:');
                console.log('1. افتح واتساب على هاتفك');
                console.log('2. اذهب إلى: الإعدادات > الأجهزة المرتبطة');
                console.log('3. اضغط "ربط جهاز"');
                console.log('4. امسح الكود من الرابط أدناه\n');
                
                // توليد رابط QR Code
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
                console.log('🔗 أو استخدم هذا الرابط:');
                console.log(qrUrl);
                console.log('────────────────────────────────────────────────────────────');
                console.log('⏳ في انتظار المسح...\n');
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                console.log(`❌ الاتصال مغلق. كود: ${statusCode}`);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('🔄 إعادة المحاولة...\n');
                    setTimeout(generateSession, 3000);
                } else if (statusCode === 515) {
                    console.log('⚠️ خطأ 515 - سيتم إعادة المحاولة\n');
                    setTimeout(generateSession, 5000);
                } else {
                    console.log('🔄 إعادة المحاولة...\n');
                    setTimeout(generateSession, 3000);
                }
                
            } else if (connection === 'open') {
                isConnected = true;
                
                console.log('\n✅ ════════════════════════════════════');
                console.log('   تم الاتصال بنجاح! 🎉');
                console.log(`   الرقم: ${sock.user.id.split(':')[0]}`);
                console.log(`   الاسم: ${sock.user.name || 'غير محدد'}`);
                console.log('════════════════════════════════════\n');
                
                // الانتظار قليلاً لضمان حفظ البيانات
                console.log('⏳ جاري حفظ بيانات الجلسة...\n');
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // تصدير الجلسة
                try {
                    const credsPath = path.join(__dirname, 'auth_info', 'creds.json');
                    
                    if (!fs.existsSync(credsPath)) {
                        throw new Error('ملف creds.json غير موجود');
                    }
                    
                    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
                    
                    const sessionData = {
                        creds: creds
                    };
                    
                    const sessionStr = Buffer.from(JSON.stringify(sessionData)).toString('base64');
                    globalSessionData = sessionStr;
                    
                    console.log('\n╔════════════════════════════════════════════════════════════╗');
                    console.log('║                   ✅ نجح! SESSION_DATA                    ║');
                    console.log('╚════════════════════════════════════════════════════════════╝\n');
                    
                    console.log('📋 انسخ هذا النص وضعه في متغير SESSION_DATA:\n');
                    console.log('─'.repeat(60));
                    console.log(sessionStr);
                    console.log('─'.repeat(60));
                    
                    console.log('\n📝 الخطوات التالية:');
                    console.log('1. انسخ SESSION_DATA أعلاه');
                    console.log('2. في Clever Cloud > Environment Variables');
                    console.log('3. أضف: SESSION_DATA = [النص المنسوخ]');
                    console.log('4. Restart البوت');
                    console.log('5. البوت سيعمل بدون إعادة مسح QR Code! ✅\n');
                    
                    console.log('🔗 أو اذهب إلى:');
                    console.log(`https://your-app.onrender.com/session\n`);
                    
                    // حفظ في ملف محلي أيضاً
                    const sessionFile = path.join(__dirname, 'SESSION_DATA.txt');
                    fs.writeFileSync(sessionFile, sessionStr);
                    console.log(`💾 تم الحفظ أيضاً في: ${sessionFile}\n`);
                    
                    console.log('⚠️ ملاحظة: لا تشارك SESSION_DATA مع أحد!\n');
                    
                    // إبقاء السيرفر شغال
                    console.log('🌐 السيرفر سيبقى شغالاً...');
                    console.log('💡 يمكنك إيقافه الآن (Ctrl+C) بعد نسخ SESSION_DATA\n');
                    
                } catch (error) {
                    console.error('❌ فشل تصدير الجلسة:', error.message);
                    process.exit(1);
                }
            }
        });

        console.log('✅ جاهز لتوليد QR Code...\n');
        
    } catch (error) {
        console.error('❌ خطأ في توليد الجلسة:', error);
        console.log('🔄 إعادة المحاولة بعد 10 ثواني...\n');
        setTimeout(generateSession, 10000);
    }
}

// ═══════════════════════════════════════════════════════════
// 🛑 معالجة الإيقاف
// ═══════════════════════════════════════════════════════════

process.on('SIGINT', () => {
    console.log('\n\n👋 إيقاف السكريبت...');
    if (globalSessionData) {
        console.log('\n✅ SESSION_DATA موجود - يمكنك استخدامه');
    } else {
        console.log('\n⚠️ لم يتم توليد SESSION_DATA بعد');
    }
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n👋 إيقاف السكريبت (SIGTERM)...');
    server.close();
    process.exit(0);
});

// ═══════════════════════════════════════════════════════════
// 🚀 بدء التوليد
// ═══════════════════════════════════════════════════════════

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║         🔐 سكريبت توليد جلسة واتساب لـ Render           ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

generateSession();

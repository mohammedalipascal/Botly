require('dotenv').config();
const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ═══════════════════════════════════════════════════════════
// ⚙️ الإعدادات - ضع رقم هاتفك هنا!
// ═══════════════════════════════════════════════════════════

// ⭐ غيّر هذا الرقم لرقمك (بدون + أو 00)
const PHONE_NUMBER = process.env.PHONE_NUMBER || '201234567890';

console.log(`\n📱 رقم الهاتف المستخدم: ${PHONE_NUMBER}`);
console.log('⚠️ تأكد أن الرقم صحيح!\n');

// ═══════════════════════════════════════════════════════════
// 🔧 Helper
// ═══════════════════════════════════════════════════════════
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════
// 🌐 HTTP Server
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
let globalSessionData = null;
let pairingCode = null;
let connectionStatus = 'waiting';

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="5">
    <title>Pairing Code - توليد جلسة</title>
    <style>
        body { 
            font-family: Arial; 
            text-align: center; 
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
        }
        .box { 
            background: white; 
            color: #333;
            padding: 30px; 
            border-radius: 20px; 
            max-width: 600px;
            margin: 20px auto;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        }
        .code {
            font-size: 48px;
            font-weight: bold;
            letter-spacing: 10px;
            color: #667eea;
            background: #f0f0f0;
            padding: 20px;
            border-radius: 10px;
            margin: 20px 0;
        }
        .status {
            font-size: 24px;
            margin: 20px 0;
        }
        .success { color: #10b981; }
        .waiting { color: #f59e0b; }
    </style>
</head>
<body>
    <h1>🔑 Pairing Code</h1>
    <div class="box">
        <div class="status ${connectionStatus === 'connected' ? 'success' : 'waiting'}">
            ${connectionStatus === 'connected' ? '✅ متصل بنجاح!' : '⏳ في انتظار الإدخال...'}
        </div>
        
        ${pairingCode ? `
            <h2>أدخل هذا الكود في واتساب:</h2>
            <div class="code">${pairingCode}</div>
            <p>📱 الخطوات:</p>
            <ol style="text-align: right;">
                <li>افتح واتساب</li>
                <li>الإعدادات > الأجهزة المرتبطة</li>
                <li>ربط جهاز</li>
                <li>ربط باستخدام رقم الهاتف</li>
                <li>أدخل الكود: <strong>${pairingCode}</strong></li>
            </ol>
        ` : '<p>⏳ جاري توليد الكود...</p>'}
        
        ${globalSessionData ? `
            <div style="background: #10b981; color: white; padding: 15px; border-radius: 10px; margin: 20px 0;">
                <h2>✅ SESSION_DATA جاهز!</h2>
                <a href="/session" style="color: white; text-decoration: underline;">عرض SESSION_DATA</a>
            </div>
        ` : ''}
        
        <hr>
        <p>🔄 تحديث تلقائي كل 5 ثواني</p>
    </div>
</body>
</html>
        `);
    } else if (req.url === '/session') {
        if (globalSessionData) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="utf-8">
    <title>SESSION_DATA</title>
    <style>
        body { font-family: Arial; padding: 20px; background: #1e293b; color: white; }
        pre { 
            background: #0f172a; 
            padding: 20px; 
            border-radius: 10px; 
            overflow-x: auto;
            word-break: break-all;
            color: #10b981;
        }
        .btn {
            background: #10b981;
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            margin: 10px;
        }
    </style>
</head>
<body>
    <h1>✅ SESSION_DATA</h1>
    <button class="btn" onclick="navigator.clipboard.writeText(document.getElementById('s').textContent); alert('تم النسخ!')">📋 نسخ</button>
    <pre id="s">${globalSessionData}</pre>
</body>
</html>
            `);
        } else {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('الجلسة لم تُنشأ بعد');
        }
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`🌐 Server: http://localhost:${PORT}\n`);
});

// ═══════════════════════════════════════════════════════════
// 🔐 توليد الجلسة باستخدام Pairing Code
// ═══════════════════════════════════════════════════════════

async function generateSession() {
    try {
        console.log('🚀 بدء التوليد بـ Pairing Code...\n');
        
        const authPath = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('🗑️ حذف الجلسة القديمة\n');
        }
        
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')}\n`);
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
            },
            printQRInTerminal: false,
            logger: P({ level: 'silent' }),
            browser: Browsers.ubuntu('Chrome'),
            syncFullHistory: false,
            markOnlineOnConnect: false,
            getMessage: async () => ({ conversation: '' })
        });

        sock.ev.on('creds.update', saveCreds);

        // ⭐ طلب Pairing Code
        if (!state.creds.registered) {
            console.log('🔑 جاري طلب Pairing Code...\n');
            
            // انتظار قليل للاتصال
            await delay(3000);
            
            try {
                const code = await sock.requestPairingCode(PHONE_NUMBER);
                pairingCode = code;
                
                console.log('\n' + '═'.repeat(60));
                console.log('🔑 PAIRING CODE:');
                console.log('═'.repeat(60));
                console.log('\n        ' + code + '\n');
                console.log('═'.repeat(60));
                
                console.log('\n📱 الخطوات:');
                console.log('1. افتح واتساب');
                console.log('2. الإعدادات > الأجهزة المرتبطة');
                console.log('3. ربط جهاز');
                console.log('4. ربط باستخدام رقم الهاتف');
                console.log(`5. أدخل الكود: ${code}\n`);
                
                console.log(`🌐 أو افتح في المتصفح:\n   https://your-app.onrender.com\n`);
                
            } catch (error) {
                console.error('❌ فشل طلب Pairing Code:', error.message);
                return;
            }
        }

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`❌ مغلق. كود: ${statusCode}`);
                
                if (statusCode === DisconnectReason.loggedOut) {
                    console.log('🔄 إعادة المحاولة...\n');
                    await delay(3000);
                    return generateSession();
                }
                
            } else if (connection === 'open') {
                connectionStatus = 'connected';
                
                console.log('\n✅ ═══════════════════════════════════');
                console.log('   متصل بنجاح! 🎉');
                console.log(`   ${sock.user.id.split(':')[0]}`);
                console.log('═══════════════════════════════════\n');
                
                console.log('⏳ حفظ الجلسة (10 ثواني)...\n');
                await delay(10000);
                
                try {
                    const credsPath = path.join(__dirname, 'auth_info', 'creds.json');
                    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
                    
                    const sessionStr = Buffer.from(JSON.stringify({ creds })).toString('base64');
                    globalSessionData = sessionStr;
                    
                    console.log('═'.repeat(60));
                    console.log('✅ SESSION_DATA جاهز');
                    console.log('═'.repeat(60));
                    console.log(sessionStr);
                    console.log('═'.repeat(60));
                    
                    fs.writeFileSync('SESSION_DATA.txt', sessionStr);
                    console.log('\n💾 محفوظ في: SESSION_DATA.txt');
                    
                    console.log('\n📝 الخطوات التالية:');
                    console.log('1. انسخ SESSION_DATA');
                    console.log('2. Clever Cloud > Environment Variables');
                    console.log('3. SESSION_DATA = [النص]');
                    console.log('4. Restart\n');
                    
                } catch (error) {
                    console.error('❌ فشل التصدير:', error.message);
                }
            }
        });
        
    } catch (error) {
        console.error('❌ خطأ:', error);
        await delay(10000);
        return generateSession();
    }
}

// ═══════════════════════════════════════════════════════════
// 🚀 بدء
// ═══════════════════════════════════════════════════════════

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║          🔑 توليد جلسة باستخدام Pairing Code            ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

generateSession();

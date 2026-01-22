const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const fs = require('fs');
const path = require('path');
const http = require('http');

// ═══════════════════════════════════════════════════════════
// 🔧 Delay Helper
// ═══════════════════════════════════════════════════════════
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════
// 🌐 HTTP Server - ضروري لـ Render!
// ═══════════════════════════════════════════════════════════

const PORT = process.env.PORT || 3000;
let globalSessionData = null;
let connectionStatus = 'waiting';

const server = http.createServer((req, res) => {
    const url = req.url;
    
    if (url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
<!DOCTYPE html>
<html dir="rtl">
<head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="5">
    <title>توليد جلسة واتساب</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            text-align: center; 
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        .box { 
            background: rgba(255,255,255,0.95); 
            padding: 30px; 
            border-radius: 20px; 
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            color: #333;
            margin: 20px 0;
        }
        .status {
            font-size: 24px;
            font-weight: bold;
            margin: 20px 0;
        }
        .success { color: #10b981; }
        .waiting { color: #f59e0b; }
        .error { color: #ef4444; }
        pre { 
            background: #1e293b; 
            color: #10b981;
            padding: 20px; 
            overflow-x: auto; 
            text-align: left;
            border-radius: 10px;
            font-size: 12px;
            max-height: 400px;
            overflow-y: auto;
        }
        .btn {
            display: inline-block;
            padding: 15px 30px;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 10px;
            margin: 10px;
            font-weight: bold;
        }
        .qr-link {
            word-break: break-all;
            background: #fff;
            padding: 15px;
            border-radius: 10px;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🔐 توليد جلسة واتساب</h1>
        <div class="box">
            <div class="status ${connectionStatus === 'connected' ? 'success' : connectionStatus === 'error' ? 'error' : 'waiting'}">
                ${connectionStatus === 'connected' ? '✅ متصل بنجاح!' : 
                  connectionStatus === 'error' ? '❌ خطأ في الاتصال' :
                  '⏳ في انتظار المسح...'}
            </div>
            <p><strong>الحالة:</strong> ${connectionStatus}</p>
            ${globalSessionData ? `
                <div style="background: #10b981; color: white; padding: 15px; border-radius: 10px; margin: 20px 0;">
                    <h2>✅ نجح! SESSION_DATA جاهز</h2>
                    <p>انسخ البيانات من /session</p>
                </div>
            ` : ''}
            <hr>
            <p>📱 راجع اللوجات في Render Dashboard لمسح QR Code</p>
            <p>🔄 هذه الصفحة تتحدث كل 5 ثواني</p>
        </div>
        
        ${globalSessionData ? `
            <div class="box">
                <h2>🎉 SESSION_DATA</h2>
                <a href="/session" class="btn">عرض SESSION_DATA</a>
            </div>
        ` : ''}
    </div>
</body>
</html>
        `);
    } else if (url === '/session') {
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
        .container { max-width: 1000px; margin: 0 auto; }
        pre { 
            background: #0f172a; 
            padding: 20px; 
            border-radius: 10px; 
            overflow-x: auto;
            word-break: break-all;
            white-space: pre-wrap;
            color: #10b981;
        }
        .btn {
            background: #10b981;
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 10px;
            cursor: pointer;
            font-size: 16px;
            margin: 10px 5px;
        }
        .success { color: #10b981; }
    </style>
</head>
<body>
    <div class="container">
        <h1>✅ SESSION_DATA جاهز</h1>
        <p>انسخ هذا النص بالكامل وضعه في <code>SESSION_DATA</code> في Clever Cloud:</p>
        
        <button class="btn" onclick="copySession()">📋 نسخ SESSION_DATA</button>
        <button class="btn" onclick="downloadSession()">💾 تحميل كملف</button>
        
        <pre id="sessionData">${globalSessionData}</pre>
        
        <div id="copied" class="success" style="display:none; margin: 20px 0;">
            ✅ تم النسخ! الآن اذهب إلى Clever Cloud وأضفه في Environment Variables
        </div>
        
        <hr>
        <h3>📝 الخطوات التالية:</h3>
        <ol style="text-align: right;">
            <li>انسخ SESSION_DATA أعلاه (اضغط زر النسخ)</li>
            <li>اذهب إلى Clever Cloud Console</li>
            <li>اختر تطبيق البوت > Environment Variables</li>
            <li>أضف متغير جديد: <code>SESSION_DATA</code></li>
            <li>الصق القيمة المنسوخة</li>
            <li>Update changes</li>
            <li>Restart البوت</li>
            <li>✅ البوت سيعمل بدون إعادة مسح QR!</li>
        </ol>
    </div>
    
    <script>
        function copySession() {
            const text = document.getElementById('sessionData').textContent;
            navigator.clipboard.writeText(text).then(() => {
                document.getElementById('copied').style.display = 'block';
                setTimeout(() => {
                    document.getElementById('copied').style.display = 'none';
                }, 5000);
            });
        }
        
        function downloadSession() {
            const text = document.getElementById('sessionData').textContent;
            const blob = new Blob([text], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'SESSION_DATA.txt';
            a.click();
        }
    </script>
</body>
</html>
            `);
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                success: false,
                message: 'الجلسة لم تُنشأ بعد. امسح QR Code أولاً',
                status: connectionStatus
            }));
        }
    } else if (url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            connection: connectionStatus,
            hasSession: !!globalSessionData
        }));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

server.listen(PORT, () => {
    console.log(`\n🌐 Server running on port ${PORT}`);
    console.log(`🔗 افتح: https://your-app.onrender.com`);
    console.log('⚠️ هذا السيرفر ضروري لمنع Render من الإيقاف\n');
});

// ═══════════════════════════════════════════════════════════
// 🔐 توليد الجلسة
// ═══════════════════════════════════════════════════════════

let qrAttempts = 0;
const MAX_QR_ATTEMPTS = 5;
let sock = null;

async function generateSession() {
    try {
        console.log('🚀 بدء توليد الجلسة...\n');
        connectionStatus = 'connecting';
        
        // حذف الجلسة القديمة إذا موجودة
        const authPath = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('🗑️ تم حذف الجلسة القديمة\n');
        }
        
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')}\n`);
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        // ⭐ إعدادات محسّنة لتجنب خطأ 515
        sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
            },
            printQRInTerminal: false,
            logger: P({ level: 'silent' }),
            browser: Browsers.ubuntu('Chrome'), // ⭐ مهم جداً
            syncFullHistory: false,
            markOnlineOnConnect: false,
            defaultQueryTimeoutMs: 60000, // ⭐ زيادة timeout
            connectTimeoutMs: 60000,
            qrTimeout: 60000, // ⭐ QR timeout أطول
            retryRequestDelayMs: 2000,
            getMessage: async () => ({ conversation: '' })
        });

        // حفظ الاعتماد
        sock.ev.on('creds.update', saveCreds);

        // معالجة الاتصال
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            // عرض QR Code
            if (qr) {
                qrAttempts++;
                connectionStatus = 'waiting_qr';
                
                if (qrAttempts > MAX_QR_ATTEMPTS) {
                    console.error('\n❌ تجاوز الحد الأقصى لمحاولات QR');
                    console.log('💡 الحل: أعد تشغيل التطبيق في Render\n');
                    connectionStatus = 'error';
                    return;
                }
                
                console.log('\n' + '═'.repeat(60));
                console.log(`📱 QR Code #${qrAttempts} - امسحه فوراً! (صالح لـ 60 ثانية)`);
                console.log('═'.repeat(60));
                console.log('\n📋 خطوات سريعة:');
                console.log('1. افتح واتساب > الإعدادات > الأجهزة المرتبطة');
                console.log('2. ربط جهاز');
                console.log('3. امسح الكود من الرابط أدناه\n');
                
                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qr)}`;
                console.log('🔗 رابط QR Code:');
                console.log(qrUrl);
                console.log('\n' + '═'.repeat(60));
                console.log('⏳ امسح الآن! لديك 60 ثانية...\n');
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const error = lastDisconnect?.error;
                
                console.log(`\n❌ الاتصال مغلق. كود: ${statusCode}`);
                
                // ⭐ معالجة خاصة لخطأ 515
                if (statusCode === 515) {
                    console.log('⚠️ خطأ 515: WhatsApp ألغى الاتصال');
                    console.log('\n💡 الأسباب المحتملة:');
                    console.log('   1. لم تمسح QR Code بسرعة كافية');
                    console.log('   2. مشكلة في اتصال الإنترنت');
                    console.log('   3. واتساب مشغول (جرب بعد دقيقة)\n');
                    
                    // انتظار أطول قبل إعادة المحاولة
                    connectionStatus = 'retrying';
                    console.log('🔄 انتظار 10 ثواني قبل المحاولة التالية...\n');
                    await delay(10000);
                    
                    if (qrAttempts < MAX_QR_ATTEMPTS) {
                        return generateSession();
                    } else {
                        console.error('❌ فشل بعد عدة محاولات');
                        connectionStatus = 'error';
                        return;
                    }
                }
                
                // معالجة الأخطاء الأخرى
                if (statusCode === DisconnectReason.loggedOut ||
                    statusCode === DisconnectReason.badSession) {
                    console.log('🔄 إعادة المحاولة...\n');
                    await delay(3000);
                    return generateSession();
                }
                
                // خطأ غير متوقع
                console.log('⚠️ خطأ غير متوقع - إعادة المحاولة\n');
                connectionStatus = 'retrying';
                await delay(5000);
                return generateSession();
                
            } else if (connection === 'open') {
                connectionStatus = 'connected';
                qrAttempts = 0; // إعادة تعيين العداد
                
                console.log('\n' + '✅'.repeat(30));
                console.log('✅ متصل بواتساب بنجاح! 🎉');
                console.log(`📱 الرقم: ${sock.user.id.split(':')[0]}`);
                console.log(`👤 الاسم: ${sock.user.name || 'غير محدد'}`);
                console.log('✅'.repeat(30) + '\n');
                
                // ⭐ انتظار أطول لضمان حفظ كامل البيانات
                console.log('⏳ جاري حفظ بيانات الجلسة (10 ثواني)...\n');
                await delay(10000);
                
                // تصدير الجلسة
                try {
                    const credsPath = path.join(__dirname, 'auth_info', 'creds.json');
                    
                    if (!fs.existsSync(credsPath)) {
                        throw new Error('ملف creds.json غير موجود');
                    }
                    
                    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
                    
                    const sessionData = { creds };
                    const sessionStr = Buffer.from(JSON.stringify(sessionData)).toString('base64');
                    globalSessionData = sessionStr;
                    
                    console.log('\n' + '═'.repeat(60));
                    console.log('✅ نجح! SESSION_DATA جاهز للاستخدام');
                    console.log('═'.repeat(60));
                    
                    console.log('\n📋 انسخ SESSION_DATA من هنا:\n');
                    console.log('─'.repeat(60));
                    console.log(sessionStr);
                    console.log('─'.repeat(60));
                    
                    // حفظ في ملف
                    const sessionFile = path.join(__dirname, 'SESSION_DATA.txt');
                    fs.writeFileSync(sessionFile, sessionStr);
                    console.log(`\n💾 تم الحفظ في: ${sessionFile}`);
                    
                    console.log('\n📝 الخطوات التالية:');
                    console.log('1. انسخ SESSION_DATA أعلاه');
                    console.log('2. افتح: https://console.clever-cloud.com');
                    console.log('3. اختر تطبيق البوت > Environment Variables');
                    console.log('4. أضف: SESSION_DATA = [النص المنسوخ]');
                    console.log('5. Update changes + Restart');
                    console.log('6. ✅ البوت سيعمل بدون إعادة مسح!\n');
                    
                    console.log('🌐 أو افتح في المتصفح:');
                    console.log(`   https://your-app.onrender.com/session\n`);
                    
                    console.log('⚠️ لا تشارك SESSION_DATA مع أحد!\n');
                    
                    console.log('💡 يمكنك إيقاف التطبيق الآن أو تركه يعمل\n');
                    
                } catch (error) {
                    console.error('❌ فشل تصدير الجلسة:', error.message);
                    connectionStatus = 'error';
                }
            } else if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال...');
                connectionStatus = 'connecting';
            }
        });

        console.log('✅ جاهز لتوليد QR Code...\n');
        
    } catch (error) {
        console.error('❌ خطأ في التوليد:', error);
        connectionStatus = 'error';
        console.log('🔄 إعادة المحاولة بعد 10 ثواني...\n');
        await delay(10000);
        return generateSession();
    }
}

// ═══════════════════════════════════════════════════════════
// 🛑 معالجة الإيقاف
// ═══════════════════════════════════════════════════════════

process.on('SIGINT', async () => {
    console.log('\n\n👋 إيقاف...');
    if (sock) {
        try {
            await sock.logout();
        } catch (e) {}
    }
    server.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\n👋 إيقاف (SIGTERM)...');
    if (sock) {
        try {
            await sock.logout();
        } catch (e) {}
    }
    server.close();
    process.exit(0);
});

// ═══════════════════════════════════════════════════════════
// 🚀 بدء التوليد
// ═══════════════════════════════════════════════════════════

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║      🔐 سكريبت توليد جلسة واتساب - محسّن ضد 515         ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

generateSession();

require('dotenv').config();
const makeWASocket = require('@whiskeysockets/baileys').default;
const { 
    useMultiFileAuthState, 
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const P = require('pino');
const http = require('http');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');
const { getAIResponse } = require('./modules/ai/ai');
const { handleIslamicCommand, startIslamicSchedule, stopIslamicSchedule, isEnabled: islamicIsEnabled } = require('./modules/islamic/islamicModule');
const adminPanel = require('./modules/admin/adminPanel');

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const CONFIG = {
    botName: process.env.BOT_NAME || 'Botly',
    botOwner: process.env.BOT_OWNER || 'مقداد',
    prefix: process.env.PREFIX || '!',
    port: process.env.PORT || 8080,
    replyInGroups: false,
    ownerNumber: process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER + '@s.whatsapp.net' : null,
    showIgnoredMessages: process.env.SHOW_IGNORED_MESSAGES === 'true',
    logLevel: process.env.LOG_LEVEL || 'silent',
    adminNumber: '249962204268@s.whatsapp.net',
    allowedGroups: process.env.ALLOWED_GROUPS ? process.env.ALLOWED_GROUPS.split(',').map(g => g.trim()) : [],
    blockedContacts: process.env.BLOCKED_CONTACTS ? process.env.BLOCKED_CONTACTS.split(',').map(c => c.trim()) : []
};

const AI_STATE_FILE = path.join(__dirname, 'ai_state.json');
const BAN_LIST_FILE = path.join(__dirname, 'ban_list.json');
const ALLOWED_GROUPS_FILE = path.join(__dirname, 'allowed_groups.json');

function loadAIState() {
    try {
        if (fs.existsSync(AI_STATE_FILE)) {
            const data = fs.readFileSync(AI_STATE_FILE, 'utf-8');
            const state = JSON.parse(data);
            return state.enabled || false;
        }
    } catch (error) {
        console.log('⚠️ خطأ في قراءة حالة AI');
    }
    return false;
}

function saveAIState(enabled) {
    try {
        fs.writeFileSync(AI_STATE_FILE, JSON.stringify({ enabled }), 'utf-8');
    } catch (error) {
        console.error('❌ خطأ في حفظ حالة AI:', error.message);
    }
}

function loadBanList() {
    try {
        if (fs.existsSync(BAN_LIST_FILE)) {
            const data = fs.readFileSync(BAN_LIST_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.log('⚠️ خطأ في قراءة قائمة الحظر');
    }
    return [];
}

function saveBanList(list) {
    try {
        fs.writeFileSync(BAN_LIST_FILE, JSON.stringify(list), 'utf-8');
    } catch (error) {
        console.error('❌ خطأ في حفظ قائمة الحظر:', error.message);
    }
}

function loadAllowedGroupsList() {
    try {
        if (fs.existsSync(ALLOWED_GROUPS_FILE)) {
            const data = fs.readFileSync(ALLOWED_GROUPS_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.log('⚠️ خطأ في قراءة قائمة المجموعات المسموحة');
    }
    return [];
}

function saveAllowedGroupsList(list) {
    try {
        fs.writeFileSync(ALLOWED_GROUPS_FILE, JSON.stringify(list), 'utf-8');
    } catch (error) {
        console.error('❌ خطأ في حفظ قائمة المجموعات:', error.message);
    }
}

let AI_ENABLED = loadAIState();
let BANNED_USERS = loadBanList();
let ALLOWED_GROUPS_LIST = loadAllowedGroupsList();

const AI_CONFIG = {
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 500,
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7
};

const authPath = path.join(__dirname, 'auth_info');
const hasSession = fs.existsSync(authPath) && fs.existsSync(path.join(authPath, 'creds.json'));

console.log('\n⚙️ ═══════ إعدادات البوت ═══════');
console.log(`📱 اسم البوت: ${CONFIG.botName}`);
console.log(`👤 المالك: ${CONFIG.botOwner}`);
console.log(`👥 الرد في المجموعات: ${CONFIG.replyInGroups ? '✅' : '❌'}`);
console.log(`🤖 AI: ${AI_ENABLED ? '✅ مفعّل' : '❌ معطّل'}`);
console.log(`📿 القسم الإسلامي: ${islamicIsEnabled() ? '✅ مفعّل' : '❌ معطّل'}`);
console.log(`💾 الجلسة: ${hasSession ? 'موجودة في الـ repo ✅' : '⚠️ غير موجودة - سيتم إنشاء جلسة جديدة'}`);
console.log('═══════════════════════════════════\n');

let requestCount = 0;
let pairingCode = null;
let pairingStatus = 'waiting';
let pairingError = null;
let phoneNumber = null;

const server = http.createServer((req, res) => {
    requestCount++;
    
    if (req.url === '/' || req.url === '/index.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🤖 ربط البوت - ${CONFIG.botName}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        
        .container {
            background: white;
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            max-width: 500px;
            width: 100%;
            text-align: center;
        }
        
        .logo {
            font-size: 64px;
            margin-bottom: 20px;
        }
        
        h1 {
            color: #333;
            margin-bottom: 10px;
            font-size: 28px;
        }
        
        .subtitle {
            color: #666;
            margin-bottom: 30px;
            font-size: 16px;
        }
        
        .status {
            padding: 15px;
            border-radius: 10px;
            margin-bottom: 20px;
            font-weight: bold;
        }
        
        .status.waiting {
            background: #fff3cd;
            color: #856404;
        }
        
        .status.generating {
            background: #d1ecf1;
            color: #0c5460;
        }
        
        .status.ready {
            background: #d4edda;
            color: #155724;
        }
        
        .status.connected {
            background: #d4edda;
            color: #155724;
        }
        
        .status.error {
            background: #f8d7da;
            color: #721c24;
        }
        
        .input-group {
            margin-bottom: 20px;
        }
        
        input {
            width: 100%;
            padding: 15px;
            border: 2px solid #ddd;
            border-radius: 10px;
            font-size: 18px;
            text-align: center;
            direction: ltr;
        }
        
        input:focus {
            outline: none;
            border-color: #667eea;
        }
        
        button {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            padding: 15px 40px;
            border-radius: 10px;
            font-size: 18px;
            font-weight: bold;
            cursor: pointer;
            width: 100%;
            transition: transform 0.2s;
        }
        
        button:hover {
            transform: scale(1.05);
        }
        
        button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        
        .code-display {
            background: #f8f9fa;
            border: 3px dashed #667eea;
            border-radius: 15px;
            padding: 30px;
            margin: 20px 0;
        }
        
        .code {
            font-size: 48px;
            font-weight: bold;
            color: #667eea;
            letter-spacing: 8px;
            font-family: 'Courier New', monospace;
        }
        
        .instructions {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            margin-top: 20px;
            text-align: right;
        }
        
        .instructions ol {
            margin: 10px 0;
            padding-right: 20px;
        }
        
        .instructions li {
            margin: 10px 0;
            line-height: 1.6;
        }
        
        .footer {
            margin-top: 30px;
            color: #999;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🤖</div>
        <h1>${CONFIG.botName}</h1>
        <p class="subtitle">ربط WhatsApp Bot</p>
        
        <div id="statusBox" class="status waiting">
            ⏳ في انتظار رقم الهاتف
        </div>
        
        <div id="inputSection">
            <div class="input-group">
                <input 
                    type="tel" 
                    id="phoneInput" 
                    placeholder="249962204268"
                    maxlength="15"
                    autocomplete="off"
                >
                <small style="color: #666; display: block; margin-top: 5px;">
                    أدخل رقم الهاتف بدون + أو 00
                </small>
            </div>
            <button onclick="getPairingCode()" id="submitBtn">
                🔗 الحصول على كود الربط
            </button>
        </div>
        
        <div id="codeSection" style="display: none;">
            <div class="code-display">
                <div class="code" id="pairingCode">---</div>
            </div>
            
            <div class="instructions">
                <strong>📱 خطوات الربط:</strong>
                <ol>
                    <li>افتح WhatsApp على هاتفك</li>
                    <li>اذهب إلى الإعدادات > الأجهزة المرتبطة</li>
                    <li>اضغط "ربط جهاز"</li>
                    <li>اضغط "ربط برقم الهاتف بدلاً من ذلك"</li>
                    <li>أدخل الكود الظاهر أعلاه</li>
                </ol>
            </div>
            
            <button onclick="location.reload()" style="margin-top: 20px; background: #6c757d;">
                🔄 رقم آخر
            </button>
        </div>
        
        <div class="footer">
            Made with ❤️ by ${CONFIG.botOwner}
        </div>
    </div>
    
    <script>
        async function getPairingCode() {
            const phone = document.getElementById('phoneInput').value.trim();
            const submitBtn = document.getElementById('submitBtn');
            const statusBox = document.getElementById('statusBox');
            
            if (!phone) {
                alert('⚠️ الرجاء إدخال رقم الهاتف');
                return;
            }
            
            if (!/^[0-9]{10,15}$/.test(phone)) {
                alert('⚠️ رقم الهاتف غير صحيح\\nيجب أن يكون من 10-15 رقم بدون + أو مسافات');
                return;
            }
            
            submitBtn.disabled = true;
            submitBtn.innerHTML = '⏳ جاري التحميل...';
            statusBox.className = 'status generating';
            statusBox.innerHTML = '🔄 جاري توليد كود الربط...';
            
            try {
                const response = await fetch('/get-code?phone=' + phone);
                const data = await response.json();
                
                if (data.success) {
                    document.getElementById('inputSection').style.display = 'none';
                    document.getElementById('codeSection').style.display = 'block';
                    document.getElementById('pairingCode').textContent = data.code;
                    statusBox.className = 'status ready';
                    statusBox.innerHTML = '✅ كود الربط جاهز!';
                    
                    checkStatus();
                } else {
                    throw new Error(data.error || 'فشل الحصول على الكود');
                }
            } catch (error) {
                statusBox.className = 'status error';
                statusBox.innerHTML = '❌ ' + error.message;
                submitBtn.disabled = false;
                submitBtn.innerHTML = '🔗 الحصول على كود الربط';
            }
        }
        
        async function checkStatus() {
            const interval = setInterval(async () => {
                try {
                    const response = await fetch('/status');
                    const data = await response.json();
                    
                    if (data.status === 'connected') {
                        document.getElementById('statusBox').className = 'status connected';
                        document.getElementById('statusBox').innerHTML = '🎉 تم الربط بنجاح!';
                        clearInterval(interval);
                        
                        setTimeout(() => {
                            location.reload();
                        }, 3000);
                    }
                } catch (error) {
                    console.error('Error checking status:', error);
                }
            }, 2000);
        }
        
        document.getElementById('phoneInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                getPairingCode();
            }
        });
    </script>
</body>
</html>
        `);
        return;
    }
    
    if (req.url.startsWith('/get-code')) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const phone = url.searchParams.get('phone');
        
        if (!phone) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: false, error: 'رقم الهاتف مطلوب' }));
            return;
        }
        
        phoneNumber = phone;
        pairingStatus = 'generating';
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
            if (pairingCode && pairingStatus === 'ready') {
                clearInterval(checkInterval);
                res.end(JSON.stringify({ 
                    success: true, 
                    code: pairingCode,
                    phone: phoneNumber
                }));
            } else if (pairingStatus === 'error') {
                clearInterval(checkInterval);
                res.end(JSON.stringify({ 
                    success: false, 
                    error: pairingError || 'فشل توليد الكود'
                }));
            } else if (Date.now() - startTime > 30000) {
                clearInterval(checkInterval);
                res.end(JSON.stringify({ 
                    success: false, 
                    error: 'انتهى وقت الانتظار'
                }));
            }
        }, 500);
        
        return;
    }
    
    if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: pairingStatus,
            code: pairingCode,
            phone: phoneNumber,
            botName: CONFIG.botName,
            connected: globalSock && globalSock.user ? true : false
        }));
        return;
    }
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: CONFIG.botName,
        uptime: process.uptime(),
        requests: requestCount,
        time: new Date().toISOString(),
        connected: globalSock && globalSock.user ? true : false
    }));
});

server.listen(CONFIG.port, () => {
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log(`║  🌐 الواجهة متاحة على:                         ║`);
    console.log(`║  http://localhost:${CONFIG.port}                     ║`);
    console.log('╚════════════════════════════════════════════════╝\n');
});

setInterval(() => {
    const url = `http://localhost:${CONFIG.port}`;
    http.get(url, (res) => {
        console.log(`💓 Keep-alive: ${res.statusCode}`);
    }).on('error', () => {});
}, 5 * 60 * 1000);

async function generateNewSession(attemptNumber = 1) {
    const MAX_SESSION_ATTEMPTS = 3;
    
    if (attemptNumber > MAX_SESSION_ATTEMPTS) {
        console.error('\n❌ فشلت جميع المحاولات لإنشاء الجلسة\n');
        console.log('⏳ سيتم المحاولة مرة أخرى بعد 30 ثانية...\n');
        await delay(30000);
        return generateNewSession(1);
    }
    
    console.log('\n╔════════════════════════════════════════════════╗');
    console.log(`║    🔐 إنشاء جلسة جديدة - محاولة ${attemptNumber}/${MAX_SESSION_ATTEMPTS}     ║`);
    console.log('╚════════════════════════════════════════════════╝\n');
    
    pairingCode = null;
    pairingStatus = 'waiting';
    pairingError = null;
    
    let connectionResolved = false;
    
    try {
        const authPath = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
        }
        
        const { version } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')}\n`);
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        const msgRetryCounterCache = new NodeCache();
        
        const sock = makeWASocket({
            version,
            logger: P({ level: 'fatal' }),
            printQRInTerminal: false,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'fatal' }))
            },
            markOnlineOnConnect: true,
            syncFullHistory: false,
            msgRetryCounterCache,
            getMessage: async () => undefined
        });
        
        sock.ev.on('creds.update', saveCreds);
        
        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                if (!connectionResolved) {
                    console.log('\n⏰ انتهى وقت الانتظار - إعادة المحاولة...\n');
                    connectionResolved = true;
                    sock.end();
                    reject(new Error('timeout'));
                }
            }, 10 * 60 * 1000);
            
            console.log('📱 في انتظار رقم الهاتف من الواجهة...');
            console.log(`🌐 افتح: http://localhost:${CONFIG.port}\n`);
            
            const checkPhoneInterval = setInterval(async () => {
                if (phoneNumber && pairingStatus === 'generating') {
                    clearInterval(checkPhoneInterval);
                    
                    try {
                        console.log(`📞 رقم الهاتف المُدخل: ${phoneNumber}`);
                        console.log('🔄 جاري توليد كود الربط...\n');
                        
                        const code = await sock.requestPairingCode(phoneNumber);
                        pairingCode = code;
                        pairingStatus = 'ready';
                        
                        console.log('\n╔════════════════════════════════════════════════╗');
                        console.log(`║           🔑 كود الربط: ${code}            ║`);
                        console.log('╚════════════════════════════════════════════════╝\n');
                        
                        console.log('📱 أدخل هذا الكود في WhatsApp:\n');
                        console.log('   1️⃣ افتح WhatsApp');
                        console.log('   2️⃣ الإعدادات > الأجهزة المرتبطة');
                        console.log('   3️⃣ ربط جهاز');
                        console.log('   4️⃣ ربط برقم الهاتف بدلاً من ذلك');
                        console.log(`   5️⃣ أدخل الكود: ${code}\n`);
                        
                    } catch (error) {
                        console.error('❌ فشل توليد الكود:', error.message);
                        pairingStatus = 'error';
                        pairingError = error.message;
                    }
                }
            }, 1000);
            
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect } = update;
                
                if (connection === 'close') {
                    if (connectionResolved) return;
                    
                    clearInterval(checkPhoneInterval);
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log(`\n⚠️ الاتصال مغلق - كود: ${statusCode}`);
                    
                    if (statusCode === 515 || statusCode === 503 || statusCode === 408 || !statusCode) {
                        console.log('🔄 سيتم إعادة المحاولة...\n');
                        connectionResolved = true;
                        clearTimeout(timeoutId);
                        sock.end();
                        reject(new Error(`retry_${statusCode || 'unknown'}`));
                        return;
                    }
                    
                    console.log(`❌ خطأ غير قابل للإصلاح: ${statusCode}\n`);
                    connectionResolved = true;
                    clearTimeout(timeoutId);
                    sock.end();
                    reject(new Error(`fatal_${statusCode}`));
                }
                
                if (connection === 'open') {
                    connectionResolved = true;
                    clearTimeout(timeoutId);
                    clearInterval(checkPhoneInterval);
                    pairingStatus = 'connected';
                    
                    console.log('\n✅ ════════════════════════════════════');
                    console.log('   🎉 تم الاتصال بنجاح!');
                    console.log(`   📱 ${sock.user.id.split(':')[0]}`);
                    console.log('════════════════════════════════════\n');
                    
                    console.log('⏳ انتظار 45 ثانية للمزامنة الكاملة...');
                    console.log('💡 نصيحة: أرسل رسالة في أي مجموعة الآن!\n');
                    await delay(45000);
                    
                    console.log('✅ تم حفظ الجلسة محلياً في auth_info/');
                    console.log('💡 الجلسة ستبقى على السيرفر\n');
                    
                    sock.end();
                    resolve();
                }
            });
        });
        
    } catch (error) {
        console.error('❌ خطأ في إنشاء الجلسة:', error.message);
        
        if (error.message.startsWith('retry_') || 
            error.message === 'timeout') {
            console.log(`⏳ انتظار 10 ثواني قبل المحاولة التالية...\n`);
            await delay(10000);
            return generateNewSession(attemptNumber + 1);
        }
        
        throw error;
    }
}

const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;
let globalSock = null;
let botStartTime = Date.now();

let badMacErrorCount = 0;
const MAX_BAD_MAC_ERRORS = 10;
let lastBadMacReset = Date.now();

const userMemory = new Map();
const MAX_MEMORY_PER_USER = 5;

function addToUserMemory(userId, message) {
    if (!userMemory.has(userId)) {
        userMemory.set(userId, []);
    }
    
    const memory = userMemory.get(userId);
    memory.push(message);
    
    if (memory.length > MAX_MEMORY_PER_USER) {
        memory.shift();
    }
}

function getUserMemory(userId) {
    return userMemory.get(userId) || [];
}

function cleanProcessedMessages() {
    if (processedMessages.size > MAX_PROCESSED_CACHE) {
        const toDelete = processedMessages.size - MAX_PROCESSED_CACHE;
        const iterator = processedMessages.values();
        for (let i = 0; i < toDelete; i++) {
            processedMessages.delete(iterator.next().value);
        }
    }
}

async function startBot() {
    try {
        const authPath = path.join(__dirname, 'auth_info');
        const credsPath = path.join(authPath, 'creds.json');
        
        if (!fs.existsSync(authPath) || !fs.existsSync(credsPath)) {
            console.log('⚠️ لا توجد جلسة - سيتم إنشاء جلسة جديدة\n');
            
            try {
                await generateNewSession();
            } catch (error) {
                console.error('❌ فشل إنشاء الجلسة:', error.message);
                console.log('⏳ سيتم المحاولة مرة أخرى بعد 3 ثانية...\n');
                await delay(3000);
                return startBot();
            }
            
            console.log('🔄 إعادة التشغيل للاتصال بالجلسة الجديدة...\n');
            await delay(3000);
            process.exit(0);
        }
        
        try {
            const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
            if (!creds.noiseKey) {
                throw new Error('creds.json غير مكتمل');
            }
            console.log('✅ تم العثور على جلسة صالحة\n');
        } catch (e) {
            console.error('❌ الجلسة تالفة:', e.message);
            console.log('🗑️ حذف الجلسة التالفة وإنشاء جديدة...\n');
            fs.rmSync(authPath, { recursive: true, force: true });
            
            try {
                await generateNewSession();
            } catch (error) {
                console.error('❌ فشل إنشاء الجلسة:', error.message);
                console.log('⏳ سيتم المحاولة مرة أخرى بعد 3 ثواني...\n');
                await delay(3000);
                return startBot();
            }
            
            await delay(3000);
            process.exit(0);
        }
        
        console.log('🚀 بدء البوت...\n');
        
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')}, أحدث: ${isLatest ? '✅' : '⚠️'}\n`);
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        const msgRetryCounterCache = new NodeCache();
        
        const sock = makeWASocket({
            version,
            logger: P({ level: 'fatal' }),
            printQRInTerminal: false,
            browser: ["Ubuntu", "Chrome", "20.0.04"],
            
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'fatal' }))
            },
            
            markOnlineOnConnect: true,
            generateHighQualityLinkPreview: true,
            syncFullHistory: false,
            
            defaultQueryTimeoutMs: 60000,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            
            msgRetryCounterCache,
            
            getMessage: async (key) => undefined,
            
            shouldIgnoreJid: (jid) => jid.endsWith('@newsletter')
        });

        globalSock = sock;

        sock.ev.on('creds.update', saveCreds);
        
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (msgRetryCounterCache) {
                    try {
                        msgRetryCounterCache.flushAll();
                    } catch (e) {
                        // تجاهل
                    }
                }
                
                if (type !== 'notify') return;
                
                const msg = messages[0];
                if (!msg || !msg.message) return;
                
                const sender = msg.key.remoteJid;
                const messageId = msg.key.id;
                const isGroup = sender.endsWith('@g.us');
                
                const messageTime = msg.messageTimestamp * 1000;
                if (messageTime < botStartTime - 60000) {
                    return;
                }

                if (msg.message?.listResponseMessage || msg.message?.buttonsResponseMessage) {
                    const isHandled = await handleIslamicCommand(sock, msg, '', sender);
                    if (isHandled) {
                        console.log('✅ List/Button معالج بواسطة القسم الإسلامي');
                        return;
                    }
                }
                
                const messageText = 
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption || '';
                
                const adminCommands = ['/تشغيل', '/توقف', '/ban', '/unban', '/id'];
                if (msg.key.fromMe && adminCommands.includes(messageText.trim())) {
                    console.log('\n' + '='.repeat(50));
                    console.log(`📩 👤 أدمن: ${sender}`);
                    console.log(`📝 ${messageText}`);
                    console.log('='.repeat(50));
                    
                    if (messageText.trim() === '/id') {
                        await sock.sendMessage(sender, {
                            text: `📋 معلومات:\n\nChat ID:\n${sender}\n\n${isGroup ? '👥 هذه مجموعة' : '👤 هذه محادثة خاصة'}`
                        }, { quoted: msg });
                        console.log(`📋 تم إرسال ID: ${sender}\n`);
                        return;
                    }
                    
                    if (messageText.trim() === '/تشغيل') {
                        AI_ENABLED = true;
                        saveAIState(true);
                        await sock.sendMessage(sender, {
                            react: { text: '✅', key: msg.key }
                        });
                        console.log('✅ AI تم تشغيله بواسطة الأدمن\n');
                        return;
                    }
                    
                    if (messageText.trim() === '/توقف') {
                        AI_ENABLED = false;
                        saveAIState(false);
                        await sock.sendMessage(sender, {
                            react: { text: '🛑', key: msg.key }
                        });
                        console.log('⏸️ AI تم إيقافه بواسطة الأدمن\n');
                        return;
                    }
                    
                    if (messageText.trim() === '/ban') {
                        if (!BANNED_USERS.includes(sender)) {
                            BANNED_USERS.push(sender);
                            saveBanList(BANNED_USERS);
                        }
                        await sock.sendMessage(sender, {
                            react: { text: '✅', key: msg.key }
                        });
                        console.log(`🚫 تم حظر: ${sender}\n`);
                        return;
                    }
                    
                    if (messageText.trim() === '/unban') {
                        BANNED_USERS = BANNED_USERS.filter(u => u !== sender);
                        saveBanList(BANNED_USERS);
                        await sock.sendMessage(sender, {
                            react: { text: '✅', key: msg.key }
                        });
                        console.log(`✅ تم إلغاء الحظر: ${sender}\n`);
                        return;
                    }
                }
                
                const isAdminInGroup = isGroup && msg.key.participant && (
                    msg.key.participant.includes('249962204268') ||
                    msg.key.participant.includes('231211024814174')
                );
                const isAdminDirect = msg.key.fromMe;
                
                if (isAdminDirect && !isGroup && messageText.trim().startsWith('سماح ')) {
                    const groupId = messageText.trim().substring(5).trim();
                    if (groupId.endsWith('@g.us')) {
                        if (!ALLOWED_GROUPS_LIST.includes(groupId)) {
                            ALLOWED_GROUPS_LIST.push(groupId);
                            saveAllowedGroupsList(ALLOWED_GROUPS_LIST);
                        }
                        await sock.sendMessage(sender, {
                            text: `✅ تم السماح للمجموعة:\n${groupId}`
                        }, { quoted: msg });
                        console.log(`✅ تم السماح للمجموعة: ${groupId}\n`);
                        return;
                    }
                }
                
                if (isAdminDirect && !isGroup && messageText.trim().startsWith('منع ')) {
                    const groupId = messageText.trim().substring(4).trim();
                    if (groupId.endsWith('@g.us')) {
                        ALLOWED_GROUPS_LIST = ALLOWED_GROUPS_LIST.filter(g => g !== groupId);
                        saveAllowedGroupsList(ALLOWED_GROUPS_LIST);
                        await sock.sendMessage(sender, {
                            text: `🚫 تم منع المجموعة:\n${groupId}`
                        }, { quoted: msg });
                        console.log(`🚫 تم منع المجموعة: ${groupId}\n`);
                        return;
                    }
                }
                
                if ((isAdminInGroup || isAdminDirect) && (messageText.trim() === '/سماح' || messageText.trim() === '/منع')) {
                    if (!isGroup) {
                        console.log('⚠️ أمر /سماح أو /منع يجب أن يُرسل داخل المجموعة\n');
                        return;
                    }
                    
                    console.log('\n' + '='.repeat(50));
                    console.log(`📩 👥 أدمن في مجموعة: ${sender}`);
                    console.log(`📝 ${messageText}`);
                    console.log('='.repeat(50));
                    
                    if (messageText.trim() === '/سماح') {
                        if (!ALLOWED_GROUPS_LIST.includes(sender)) {
                            ALLOWED_GROUPS_LIST.push(sender);
                            saveAllowedGroupsList(ALLOWED_GROUPS_LIST);
                        }
                        await sock.sendMessage(sender, {
                            text: 'تم السماح للبوت بالتحدث داخل المجموعة'
                        }, { quoted: msg });
                        console.log(`✅ تم السماح للمجموعة: ${sender}\n`);
                        return;
                    }
                    
                    if (messageText.trim() === '/منع') {
                        ALLOWED_GROUPS_LIST = ALLOWED_GROUPS_LIST.filter(g => g !== sender);
                        saveAllowedGroupsList(ALLOWED_GROUPS_LIST);
                        await sock.sendMessage(sender, {
                            text: 'تم منع البوت من التحدث داخل المجموعة'
                        }, { quoted: msg });
                        console.log(`🚫 تم منع المجموعة: ${sender}\n`);
                        return;
                    }
                }
                
                const isIslamicCommand = await handleIslamicCommand(sock, msg, messageText, sender);
                if (isIslamicCommand) return;
                
                // لوحة الإدارة
                const isAdminCommand = await adminPanel.handleAdminCommand(sock, msg, messageText, sender);
                if (isAdminCommand) return;
                                
                if (msg.key.fromMe) return;
                
                if (sender.endsWith('@newsletter')) {
                    if (CONFIG.showIgnoredMessages) {
                        console.log('⏭️ رسالة من قناة - متجاهلة');
                    }
                    return;
                }
                
                if (BANNED_USERS.includes(sender)) {
                    if (CONFIG.showIgnoredMessages) {
                        console.log('⏭️ مستخدم محظور - متجاهل');
                    }
                    return;
                }
                
                if (CONFIG.blockedContacts.length > 0) {
                    const isBlocked = CONFIG.blockedContacts.some(blocked => sender.includes(blocked));
                    if (isBlocked) {
                        if (CONFIG.showIgnoredMessages) {
                            console.log('⏭️ رقم محظور من ENV - متجاهل');
                        }
                        return;
                    }
                }
                
                if (isGroup) {
                    const isAllowedByCommand = ALLOWED_GROUPS_LIST.includes(sender);
                    const isAllowedByEnv = CONFIG.allowedGroups.length > 0 && 
                                          CONFIG.allowedGroups.some(groupId => sender.includes(groupId));
                    
                    if (!isAllowedByCommand && !isAllowedByEnv) {
                        if (CONFIG.showIgnoredMessages) {
                            console.log('⏭️ مجموعة غير مسموحة - متجاهل');
                        }
                        return;
                    }
                }
                
                if (sender === 'status@broadcast') return;
                if (processedMessages.has(messageId)) return;
                if (Date.now() - messageTime > 60000) return;
                
                const messageType = Object.keys(msg.message)[0];
                if (['protocolMessage', 'senderKeyDistributionMessage', 'reactionMessage'].includes(messageType)) return;

                if (!messageText.trim()) return;

                console.log('\n' + '='.repeat(50));
                console.log(`📩 ${isGroup ? '👥' : '👤'}: ${sender}`);
                console.log(`📝 ${messageText}`);
                console.log('='.repeat(50));

                processedMessages.add(messageId);
                cleanProcessedMessages();

                addToUserMemory(sender, messageText);
                const recentMessages = getUserMemory(sender);

                try {
                    if (AI_ENABLED) {
                        const aiResponse = await getAIResponse(messageText, {...AI_CONFIG, enabled: true}, sender, recentMessages);
                        
                        if (aiResponse) {
                            await sock.sendMessage(sender, { text: aiResponse }, { quoted: msg });
                            console.log('✅ تم الرد\n');
                        }
                    }
                    
                } catch (error) {
                    console.error('❌ خطأ في الرد:', error.message);
                }
                
            } catch (error) {
                if (error.message && error.message.includes('Bad MAC')) {
                    badMacErrorCount++;
                    
                    if (Date.now() - lastBadMacReset > 5 * 60 * 1000) {
                        badMacErrorCount = 1;
                        lastBadMacReset = Date.now();
                    }
                    
                    console.log(`⚠️ Bad MAC Error (#${badMacErrorCount}/${MAX_BAD_MAC_ERRORS})`);
                    
                    if (badMacErrorCount >= MAX_BAD_MAC_ERRORS) {
                        console.log('\n🔄 تجاوز حد أخطاء Bad MAC - إعادة تشغيل...\n');
                        sock.end();
                        await delay(3000);
                        process.exit(0);
                    }
                } else if (error.message && !error.message.includes('Bad MAC')) {
                    console.error('❌ خطأ في معالجة الرسالة:', error.message);
                }
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.error('\n❌ خطأ: تم طلب QR بعد تحميل الجلسة!\n');
                console.error('⚠️ الجلسة تالفة - حذفها وإعادة المحاولة...\n');
                
                fs.rmSync(authPath, { recursive: true, force: true });
                
                console.log('⏳ إعادة المحاولة بعد 10 ثواني...\n');
                await delay(10000);
                
                sock.end();
                await startBot();
                return;
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                console.log(`\n⚠️ الاتصال مغلق - كود: ${statusCode}\n`);
                
                if (statusCode === DisconnectReason.loggedOut ||
                    statusCode === 401 || statusCode === 403) {
                    console.error('❌ الجلسة غير صالحة - حذفها...\n');
                    
                    fs.rmSync(authPath, { recursive: true, force: true });
                    
                    console.log('⏳ إعادة المحاولة بعد 10 ثواني...\n');
                    await delay(10000);
                    
                    sock.end();
                    await startBot();
                    return;
                }
                
                console.log(`🔄 إعادة الاتصال بعد 5 ثواني...\n`);
                await delay(5000);
                
                sock.end();
                await startBot();
                
            } else if (connection === 'open') {
                console.log('✅ ════════════════════════════════════');
                console.log(`   متصل بواتساب بنجاح! 🎉`);
                console.log(`   البوت: ${CONFIG.botName}`);
                console.log(`   الرقم: ${sock.user?.id?.split(':')[0] || '---'}`);
                console.log(`   AI: ${AI_ENABLED ? '✅' : '❌'}`);
                console.log(`   القسم الإسلامي: ${islamicIsEnabled() ? '✅' : '❌'}`);
                console.log('════════════════════════════════════\n');
                
                processedMessages.clear();
                botStartTime = Date.now();
                
                badMacErrorCount = 0;
                lastBadMacReset = Date.now();
                
                if (islamicIsEnabled()) {
                    startIslamicSchedule(sock);
                }
                
                // الرسالة التلقائية محذوفة حسب الطلب
                
            } else if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال...');
            }
        });

        console.log('✅ البوت جاهز ✨\n');
        
    } catch (error) {
        console.error('❌ خطأ في بدء البوت:', error);
        console.log('⏳ إعادة المحاولة بعد 30 ثانية...\n');
        await delay(30000);
        return startBot();
    }
}

process.on('SIGINT', () => {
    console.log('\n👋 إيقاف...\n');
    stopIslamicSchedule();
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 إيقاف...\n');
    stopIslamicSchedule();
    server.close();
    process.exit(0);
});

startBot();

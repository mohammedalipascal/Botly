// index.js (معدل) - الاحتفاظ بمسارات/إعدادات AI الأصلية
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

////////////////////////////////////////////////////////////////////////////////
// الإعدادات العامة (لم أتغير)
////////////////////////////////////////////////////////////////////////////////

const CONFIG = {
    botName: process.env.BOT_NAME || 'Botly',
    botOwner: process.env.BOT_OWNER || 'مقداد',
    prefix: process.env.PREFIX || '!',
    port: process.env.PORT || 8080,
    replyInGroups: process.env.REPLY_IN_GROUPS === 'true',
    ownerNumber: process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER + '@s.whatsapp.net' : null,
    sessionData: process.env.SESSION_DATA || null,
    showIgnoredMessages: process.env.SHOW_IGNORED_MESSAGES === 'true',
    logLevel: process.env.LOG_LEVEL || 'silent'
};

// ════════════════════════════════════════════════════════════════════════════
// 🤖 إعدادات الذكاء الاصطناعي — لم يتم تغيير هذه التفاصيل
// ════════════════════════════════════════════════════════════════════════════

const AI_CONFIG = {
    enabled: process.env.AI_ENABLED === 'true',
    provider: process.env.AI_PROVIDER || 'groq',
    apiKey: process.env.AI_API_KEY || '',
    // ... بقية إعدادات AI كما في ملفك الأصلي
};

// ════════════════════════════════════════════════════════════════════════════
// إعدادات S3 اختيارية لحفظ الجلسة بشكل دائم
// لتفعيل: عيّن المتغيرات البيئية S3_BUCKET و (AWS_REGION & AWS_ACCESS_KEY_ID & AWS_SECRET_ACCESS_KEY)
// إذا لم تكن موجودة، يبقى السلوك كما هو (حفظ محلي داخل مجلد auth_info).
// ════════════════════════════════════════════════════════════════════════════

const S3_ENABLED = !!process.env.S3_BUCKET;
const S3_BUCKET = process.env.S3_BUCKET || '';
const S3_PREFIX = process.env.S3_PREFIX || 'botly/auth_info/';

// lazy-require AWS SDK (في حال المستخدم لم يثبت الحزمة سيستمر التخزين المحلي)
let s3Client = null;
async function getS3Client() {
    if (!S3_ENABLED) return null;
    if (s3Client) return s3Client;
    try {
        const { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
        s3Client = { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, client: new S3Client({ region: process.env.AWS_REGION }) };
        return s3Client;
    } catch (e) {
        console.warn('لم أجد مكتبة AWS SDK (@aws-sdk/client-s3). سيتم استخدام التخزين المحلي بدلاً من S3.');
        return null;
    }
}

async function uploadAuthFileToS3(filename, contentBuffer) {
    const s3 = await getS3Client();
    if (!s3) return false;
    const key = path.posix.join(S3_PREFIX, filename);
    const params = {
        Bucket: S3_BUCKET,
        Key: key,
        Body: contentBuffer
    };
    try {
        await s3.client.send(new s3.PutObjectCommand(params));
        console.log(`✅ Uploaded ${filename} to s3://${S3_BUCKET}/${key}`);
        return true;
    } catch (err) {
        console.error('❌ فشل رفع الملف إلى S3:', err.message || err);
        return false;
    }
}

async function downloadAuthFromS3ToLocal(authDir) {
    const s3 = await getS3Client();
    if (!s3) return false;
    try {
        const listParams = { Bucket: S3_BUCKET, Prefix: S3_PREFIX };
        const listRes = await s3.client.send(new s3.ListObjectsV2Command(listParams));
        if (!listRes.Contents || listRes.Contents.length === 0) return false;
        // تأكد من وجود authDir
        fs.mkdirSync(authDir, { recursive: true });
        // لكل كائن في S3: احفظه محليًا
        for (const obj of listRes.Contents) {
            const key = obj.Key;
            const filename = key.replace(S3_PREFIX, '');
            if (!filename) continue;
            const getParams = { Bucket: S3_BUCKET, Key: key };
            const getRes = await s3.client.send(new s3.GetObjectCommand(getParams));
            // قراءة المحتوى من التيار
            const streamToBuffer = async (stream) => {
                return new Promise((resolve, reject) => {
                    const chunks = [];
                    stream.on('data', (chunk) => chunks.push(chunk));
                    stream.on('error', reject);
                    stream.on('end', () => resolve(Buffer.concat(chunks)));
                });
            };
            const bodyBuffer = await streamToBuffer(getRes.Body);
            fs.writeFileSync(path.join(authDir, filename), bodyBuffer);
            console.log(`✅ Downloaded ${filename} from S3 to ${authDir}`);
        }
        return true;
    } catch (err) {
        console.error('❌ خطأ أثناء تحميل الجلسة من S3:', err.message || err);
        return false;
    }
}

////////////////////////////////////////////////////////////////////////////////
// إدارة الجلسة من المتغير البيئي (موجودة في ملفك الأصلي) — لم أتغير في المنطق
////////////////////////////////////////////////////////////////////////////////

function loadSessionFromEnv() {
    try {
        console.log('🔐 تحميل الجلسة من SESSION_DATA...');
        
        if (!CONFIG.sessionData) {
            console.log('ℹ️ لا توجد SESSION_DATA مُحددّة عبر المتغيرات البيئية.');
            return false;
        }
        
        const sessionStr = CONFIG.sessionData.trim();
        
        if (sessionStr.length < 100) {
            throw new Error('SESSION_DATA قصير جداً');
        }
        
        const decoded = Buffer.from(sessionStr, 'base64').toString('utf-8');
        const sessionData = JSON.parse(decoded);
        
        const authPath = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
        }
        fs.mkdirSync(authPath, { recursive: true });
        
        // دعم كل من الجلسة المصغرة والكاملة
        if (sessionData.noiseKey) {
            // جلسة مصغرة (creds.json فقط)
            console.log('📦 جلسة مصغرة مكتشفة');
            fs.writeFileSync(
                path.join(authPath, 'creds.json'),
                JSON.stringify(sessionData, null, 2)
            );
        } else if (sessionData['creds.json']) {
            // جلسة كاملة
            console.log('📦 جلسة كاملة مكتشفة');
            for (const [filename, content] of Object.entries(sessionData)) {
                fs.writeFileSync(path.join(authPath, filename), content);
            }
        } else {
            throw new Error('تنسيق SESSION_DATA غير صالح');
        }
        
        const credsPath = path.join(authPath, 'creds.json');
        if (!fs.existsSync(credsPath)) {
            throw new Error('creds.json غير موجود بعد فك التشفير');
        }
        
        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
        if (!creds.noiseKey || !creds.signedIdentityKey) {
            throw new Error('creds.json غير مكتمل');
        }
        
        console.log('✅ تم تحميل الجلسة بنجاح\n');
        return true;
        
    } catch (error) {
        console.error(`❌ فشل تحميل الجلسة: ${error.message}`);
        process.exit(1);
    }
}

////////////////////////////////////////////////////////////////////////////////
// متغيرات ربط/مراقبة الاتصال و منطق إعادة الاتصال المحسّن
////////////////////////////////////////////////////////////////////////////////

const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 12; // يمكنك تعديلها
let globalSock = null;
let connectionCheckInterval = null;

function cleanProcessedMessages() {
    if (processedMessages.size > MAX_PROCESSED_CACHE) {
        const toDelete = processedMessages.size - MAX_PROCESSED_CACHE;
        const iterator = processedMessages.values();
        for (let i = 0; i < toDelete; i++) {
            processedMessages.delete(iterator.next().value);
        }
    }
}

function startConnectionMonitor(sock) {
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
    }
    
    connectionCheckInterval = setInterval(() => {
        if (sock && sock.ws && sock.ws.readyState === 1) {
            console.log('✅ الاتصال نشط');
        } else {
            console.log('⚠️ الاتصال غير نشط - محاولة إعادة الاتصال...');
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectWithDelay(false, 5000);
            } else {
                console.error('❌ تجاوزت الحد الأقصى لمحاولات إعادة الاتصال من المراقبة.');
            }
        }
    }, 30_000);
}

// دالة إعادة الاتصال مع exponential backoff قابلة لإعادة الاستخدام
async function reconnectWithDelay(isFatal = false, initialDelay = 2000) {
    reconnectAttempts++;
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
        console.error('❌ تجاوز الحد الأقصى لمحاولات إعادة الاتصال. لن أحاول أكثر.');
        return;
    }
    // اضرب التأخير أسيًا حتى حد أقصى
    const delay = Math.min(120_000, initialDelay * Math.pow(2, reconnectAttempts - 1));
    console.log(`🔁 إعادة محاولة الاتصال بعد ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
    await new Promise(r => setTimeout(r, delay));
    try {
        await startBot(); // اعادة تهيئة البوت
    } catch (err) {
        console.error('❌ فشل إعادة بدء البوت:', err?.message || err);
    }
}

////////////////////////////////////////////////////////////////////////////////
// الدالة الرئيسية لبدء البوت (معدل) — يحافظ على سلوكك السابق مع تحسينات
////////////////////////////////////////////////////////////////////////////////

async function startBot() {
    try {
        console.log('🚀 بدء البوت...
');
        
        loadSessionFromEnv(); // إذا كانت SESSION_DATA موجودة سيتم كتابتها محليًا
        
        // إذا فعّلنا S3: حاول تنزيل auth_info من S3 قبل البدء (حتى لو كانت SESSION_DATA موجودة)
        const authDir = path.join(__dirname, 'auth_info');
        if (S3_ENABLED) {
            console.log('ℹ️ S3 مفعّل — محاولة استعادة الجلسة من S3 إن وُجدت...');
            await downloadAuthFromS3ToLocal(authDir).catch(()=>{});
        }

        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')}، أحدث: ${isLatest ? '✅' : '⚠️'}
`);
        
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');
        
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, P({ level: 'silent' }))
            },
            printQRInTerminal: false,
            logger: P({ level: CONFIG.logLevel }),
            browser: ['Ubuntu', 'Chrome', '20.0.04'],
            
            shouldSyncHistoryMessage: () => false,
            syncFullHistory: false,
            fireInitQueries: false,
            
            defaultQueryTimeoutMs: undefined,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 250,
            markOnlineOnConnect: true,
            getMessage: async (key) => ({ conversation: '' })
        });

        globalSock = sock;
        startConnectionMonitor(sock);

        // عند تحديث الاعتمادات: حفظ محليًا ثم (اختياريًا) رفعها إلى S3
        sock.ev.on('creds.update', async () => {
            try {
                await saveCreds();
                console.log('💾 تم تحديث credentials (محلياً).');
                // إذا كان S3 مفعلاً: ارفع كل ملفات auth_info
                if (S3_ENABLED) {
                    try {
                        const files = fs.readdirSync(path.join(__dirname, 'auth_info'));
                        for (const filename of files) {
                            const buf = fs.readFileSync(path.join(__dirname, 'auth_info', filename));
                            await uploadAuthFileToS3(filename, buf);
                        }
                    } catch (err) {
                        console.error('⚠️ فشل رفع ملفات الجلسة إلى S3:', err?.message || err);
                    }
                }
            } catch (err) {
                console.error('❌ خطأ أثناء saveCreds:', err?.message || err);
            }
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            if (qr) {
                console.error('\n❌ خطأ: تم طلب QR Code!');
                process.exit(1);
            }

            if (connection === 'close') {
                // اطبع كامل الكائن للمساعدة في التشخيص
                console.log('--- lastDisconnect (full object) ---');
                console.log(JSON.stringify(lastDisconnect, null, 2));
                console.log('------------------------------------');

                // حاول الحصول على status code بعدد من المسارات؛ Baileys قد يضعه في أماكن مختلفة
                const statusCode = lastDisconnect?.error?.output?.statusCode
                    || lastDisconnect?.statusCode
                    || lastDisconnect?.error?.status
                    || null;
                console.log(`❌ الاتصال مغلق. كود: ${statusCode}`);

                // تعامل خاص مع بعض الأكواد الحرجة
                if (
                    statusCode === DisconnectReason.badSession ||
                    statusCode === DisconnectReason.loggedOut ||
                    statusCode === 401 || statusCode === 403
                ) {
                    console.error('\n❌ الجلسة غير صالحة أو تم تسجيل الخروج. احذف مجلد auth_info وأعد المسح/التسجيل.\n');
                    process.exit(1);
                } else if (statusCode === DisconnectReason.connectionReplaced) {
                    console.log('🔄 تم استبدال الاتصال\n');
                    process.exit(1);
                } else if (statusCode === 515) {
                    console.log('⚠️ خطأ 515 - قد يكون IP محظور من WhatsApp. انتظر أو غيّر المنطقة/الـ IP.');
                    reconnectWithDelay(false, 10000);
                } else if (statusCode && statusCode >= 400 && statusCode < 500) {
                    // كود 4xx (بما فيها 440): زيادة التأخير بشدة لتجنّب حظر إضافي
                    console.warn('⚠️ تلقّيت كود 4xx — سننتظر أطول قبل إعادة المحاولة لتجنّب الحظر.');
                    reconnectWithDelay(false, 30_000); // بداية أطول
                } else {
                    // حالات عامة: إعادة محاولة مع backoff تدريجي
                    reconnectWithDelay();
                }
                
            } else if (connection === 'open') {
                reconnectAttempts = 0;
                console.log('✅ ════════════════════════════════════');
                console.log(`   متصل بواتساب بنجاح! 🎉`);
                // ... بقية طباعة معلومات المستخدم كما في ملفك الأصلي
            }
        });

        // هنا تضع معالجات الرسائل وباقي منطق البوت كما كان في ملفك الأصلي
        // sock.ev.on('messages.upsert', ...);

        console.log('==> البوت بدأ بنجاح (startBot انتهى بدون أخطاء فورية)');
    } catch (error) {
        console.error('❌ خطأ داخل startBot():', error?.message || error);
        // إذا فشل التهيئة قد نرغب بإعادة محاولة وفق backoff
        reconnectWithDelay(true, 2000);
    }
}

// إذا كنت تريد تشغيل البوت مباشرة عند بدء العملية
if (require.main === module) {
    startBot();
}

// تصدير الدالة لاختبار أو استخدام خارجي
module.exports = { startBot };
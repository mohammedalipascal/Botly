const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const { SocksProxyAgent } = require('socks-proxy-agent');

console.log('\n🔐 مولد جلسة واتساب - مع Proxy\n');

let connectionClosed = false;
const MAX_RETRIES = 3;
let retryCount = 0;

// ✅ إعدادات Proxy (اختياري)
const PROXY_CONFIG = {
    enabled: process.env.USE_PROXY === 'true',
    url: process.env.PROXY_URL || 'socks5://127.0.0.1:1080'
};

async function createSession() {
    try {
        const authPath = './auth_info';
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
            console.log('🗑️  حذف الجلسة القديمة\n');
        }

        console.log('📦 جاري التحقق من أحدث إصدار Baileys...');
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`✅ إصدار Baileys: ${version.join('.')}`);
        console.log(`${isLatest ? '✅ أحدث إصدار' : '⚠️ يوجد تحديث'}\n`);

        const { state, saveCreds } = await useMultiFileAuthState('auth_info');

        // إعداد Socket
        const socketConfig = {
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
            },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: ['WhatsApp Bot', 'Chrome', '4.0.0'],
            defaultQueryTimeoutMs: 60000, // زيادة المهلة
            syncFullHistory: false,
            markOnlineOnConnect: false,
            getMessage: async (key) => {
                return { conversation: '' };
            }
        };

        // ✅ إضافة Proxy إذا كان مفعّل
        if (PROXY_CONFIG.enabled) {
            console.log(`🔐 استخدام Proxy: ${PROXY_CONFIG.url}\n`);
            socketConfig.agent = new SocksProxyAgent(PROXY_CONFIG.url);
        }

        const sock = makeWASocket(socketConfig);

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('\n📱 ═══════════════════════════════════');
                console.log('   امسح QR Code من الأسفل 👇');
                console.log('   واتساب → إعدادات → الأجهزة المرتبطة');
                console.log('═══════════════════════════════════\n');
                
                qrcode.generate(qr, { small: true });
                
                console.log('\n⏰ عندك 60 ثانية لمسح الكود!\n');
            }

            if (connection === 'open') {
                console.log('\n✅ ═══════════════════════════════════');
                console.log('   اتصال ناجح! 🎉');
                console.log('   الرقم:', sock.user?.id?.split(':')[0] || 'غير معروف');
                console.log('   الاسم:', sock.user?.name || 'غير معروف');
                console.log('═══════════════════════════════════\n');

                console.log('⏳ جاري حفظ بيانات الجلسة...\n');
                await new Promise(resolve => setTimeout(resolve, 5000));

                const credsPath = './auth_info/creds.json';

                if (fs.existsSync(credsPath)) {
                    try {
                        const creds = JSON.parse(fs.readFileSync(credsPath, 'utf-8'));
                        
                        if (!creds.noiseKey || !creds.signedIdentityKey) {
                            throw new Error('بيانات الجلسة غير كاملة');
                        }

                        const session = { creds };
                        const sessionString = Buffer.from(JSON.stringify(session)).toString('base64');

                        console.log('═'.repeat(70));
                        console.log('✅ SESSION_DATA جاهز!\n');
                        console.log(`SESSION_DATA=${sessionString}\n`);
                        console.log('═'.repeat(70));
                        console.log('\n📋 انسخ السطر أعلاه وضعه في .env\n');

                        fs.writeFileSync('SESSION_DATA.txt', `SESSION_DATA=${sessionString}`);
                        console.log('💾 تم الحفظ في: SESSION_DATA.txt\n');

                        connectionClosed = true;
                        
                        setTimeout(async () => {
                            try {
                                await sock.logout();
                            } catch (e) {}
                            process.exit(0);
                        }, 2000);

                    } catch (error) {
                        console.error('❌ خطأ في معالجة الجلسة:', error.message);
                        process.exit(1);
                    }
                }
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const reason = lastDisconnect?.error?.output?.payload?.error || 'Unknown';

                console.log(`\n❌ الاتصال مغلق - كود: ${statusCode}, السبب: ${reason}\n`);

                if (statusCode === 515) {
                    console.log('⚠️  خطأ 515 - IP محظور من WhatsApp!\n');
                    console.log('🔧 الحلول:');
                    console.log('1. شغّل محلياً على جهازك (الحل الأفضل)');
                    console.log('2. استخدم Termux على موبايل أندرويد');
                    console.log('3. فعّل VPN/Proxy:');
                    console.log('   USE_PROXY=true');
                    console.log('   PROXY_URL=socks5://your-proxy:1080\n');
                    console.log('4. جرب شبكة إنترنت مختلفة تماماً\n');

                } else if (statusCode === 401 || statusCode === 403) {
                    console.log('⚠️  QR منتهي - جرب مرة أخرى بسرعة\n');

                } else if (statusCode === DisconnectReason.timedOut) {
                    if (retryCount < MAX_RETRIES) {
                        retryCount++;
                        console.log(`🔄 إعادة المحاولة (${retryCount}/${MAX_RETRIES})...\n`);
                        setTimeout(() => createSession(), 5000);
                        return;
                    }
                }

                if (!connectionClosed) {
                    process.exit(1);
                }
            }

            if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال بواتساب...');
            }
        });

    } catch (error) {
        console.error('❌ خطأ عام:', error.message);
        console.log('\n📋 الحلول:');
        console.log('1. شغّل محلياً: node generate-stable.js');
        console.log('2. استخدم Termux على الموبايل');
        console.log('3. جرب VPN/Proxy مختلف\n');
        process.exit(1);
    }
}

process.on('SIGINT', () => {
    console.log('\n\n👋 إيقاف المولد...\n');
    process.exit(0);
});

console.log('🚀 بدء عملية إنشاء الجلسة...\n');
createSession().catch(err => {
    console.error('❌ خطأ فادح:', err);
    process.exit(1);
});

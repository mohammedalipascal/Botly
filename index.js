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

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════
// 🤖 إعدادات الذكاء الاصطناعي
// ═══════════════════════════════════════════════════════════

const AI_CONFIG = {
    enabled: process.env.AI_ENABLED === 'true',
    provider: process.env.AI_PROVIDER || 'groq',
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 500,
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7
};

const CONFIG = {
    botName: process.env.BOT_NAME || 'Botly',
    botOwner: process.env.BOT_OWNER || 'مقداد',
    prefix: process.env.PREFIX || '!',
    port: process.env.PORT || 8080,
    replyInGroups: process.env.REPLY_IN_GROUPS === 'true',
    ownerNumber: process.env.OWNER_NUMBER ? process.env.OWNER_NUMBER + '@s.whatsapp.net' : null,
    showIgnoredMessages: process.env.SHOW_IGNORED_MESSAGES === 'true',
    logLevel: process.env.LOG_LEVEL || 'silent',
    sessionFile: process.env.SESSION_FILE || 'session.json'
};

console.log('\n⚙️ ═══════ إعدادات البوت ═══════');
console.log(`📱 اسم البوت: ${CONFIG.botName}`);
console.log(`👤 المالك: ${CONFIG.botOwner}`);
console.log(`👥 الرد في المجموعات: ${CONFIG.replyInGroups ? '✅' : '❌'}`);
console.log(`🤖 AI: ${AI_CONFIG.enabled ? '✅ مفعّل' : '❌ معطّل'}`);
console.log(`📁 ملف الجلسة: ${CONFIG.sessionFile}`);
console.log('═══════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════
// 🧠 قاعدة المعرفة
// ═══════════════════════════════════════════════════════════

const KNOWLEDGE_BASE = {
    personal: {
        name: "مقداد",
        age: "22 سنة",
        location: "السودان",
        occupation: "مهندس برمجيات ونظم",
        education: "طالب طب في السودان",
        languages: ["العربية", "الإنجليزية"]
    },
    skills: {
        operating_systems: ["Windows", "Linux", "macOS"],
        software: ["تطوير البرمجيات", "حل مشاكل السوفت وير"],
        programming: ["JavaScript", "Node.js", "Python", "PHP"],
        design: ["تصميم واجهات", "تصميم أنظمة"],
        hardware: ["خبرة في جميع أنواع الأجهزة"],
        security: ["اختبار بيئات الاختراق", "اختبار الأمان"]
    },
    projects: {
        types: ["مشاريع إدارية", "مشاريع تجارية", "تسهيل المهام", "ابتكارات تقنية", "منصات تعليمية"],
        description: "عدة مشاريع في مجالات مختلفة"
    },
    style: {
        tone: "محترف، متواضع، ودود، حازم",
        emoji_usage: "قليل جداً",
        response_length: "مختصر وبارد",
        greetings: ["أهلين", "مرحبا", "أهلا وسهلا"]
    }
};

function buildPersonalityPrompt() {
    return `أنت مقداد، ${KNOWLEDGE_BASE.personal.occupation} و${KNOWLEDGE_BASE.personal.education}.

# شخصيتك:
- ${KNOWLEDGE_BASE.personal.age}
- ${KNOWLEDGE_BASE.style.tone}
- مختصر وبارد

# مهاراتك:
- أنظمة التشغيل: ${KNOWLEDGE_BASE.skills.operating_systems.join(', ')}
- البرمجة: ${KNOWLEDGE_BASE.skills.programming.join(', ')}
- التصميم: ${KNOWLEDGE_BASE.skills.design.join(', ')}
- الأمان: ${KNOWLEDGE_BASE.skills.security.join(', ')}

# أسلوب الرد:
- مختصر وبارد جداً
- لا تبالغ في الترحيب
- رد فقط على ما يُسأل
- لا تعرض المساعدة إلا إذا طُلبت
- عند الترحيب: ${KNOWLEDGE_BASE.style.greetings.join(' أو ')} فقط
- استخدام الإيموجي: قليل جداً

# تعليمات:
1. أجب كأنك مقداد
2. كن مختصراً وبارداً
3. لا تذكر أنك AI
4. لا تكشف موقعك إلا إذا سُئلت
5. رد بالعربية دائماً`;
}

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: CONFIG.botName,
        time: new Date().toISOString()
    }));
});

server.listen(CONFIG.port, () => {
    console.log(`🌐 HTTP Server: http://localhost:${CONFIG.port}`);
});

// ═══════════════════════════════════════════════════════════
// 💾 تحميل الجلسة
// ═══════════════════════════════════════════════════════════

function loadSessionFromFile() {
    try {
        console.log(`🔐 تحميل الجلسة من: ${CONFIG.sessionFile}...`);
        
        const sessionPath = path.join(__dirname, CONFIG.sessionFile);
        
        if (!fs.existsSync(sessionPath)) {
            throw new Error(`ملف الجلسة غير موجود: ${CONFIG.sessionFile}`);
        }
        
        const fileContent = fs.readFileSync(sessionPath, 'utf-8').trim();
        const sessionData = JSON.parse(fileContent);
        
        const authPath = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
        }
        fs.mkdirSync(authPath, { recursive: true });
        
        for (const [filename, content] of Object.entries(sessionData)) {
            fs.writeFileSync(path.join(authPath, filename), content);
        }
        
        const creds = JSON.parse(fs.readFileSync(path.join(authPath, 'creds.json'), 'utf-8'));
        if (!creds.noiseKey) {
            throw new Error('creds.json غير مكتمل');
        }
        
        console.log('✅ تم تحميل الجلسة بنجاح\n');
        return true;
        
    } catch (error) {
        console.error(`❌ فشل تحميل الجلسة: ${error.message}\n`);
        process.exit(1);
    }
}

// ═══════════════════════════════════════════════════════════
// 🤖 دالة AI
// ═══════════════════════════════════════════════════════════

async function getAIResponse(userMessage) {
    if (!AI_CONFIG.enabled || !AI_CONFIG.apiKey) return null;

    try {
        console.log(`🤖 طلب AI: ${userMessage.substring(0, 30)}...`);
        
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: AI_CONFIG.model,
                messages: [
                    { role: 'system', content: buildPersonalityPrompt() },
                    { role: 'user', content: userMessage }
                ],
                max_tokens: AI_CONFIG.maxTokens,
                temperature: AI_CONFIG.temperature
            })
        });

        if (!response.ok) return null;

        const data = await response.json();
        const reply = data.choices[0].message.content.trim();
        
        console.log(`✅ رد AI: ${reply.substring(0, 30)}...`);
        return reply;

    } catch (error) {
        console.error('❌ خطأ AI:', error.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════
// 📊 متغيرات
// ═══════════════════════════════════════════════════════════

const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let globalSock = null;
let isReconnecting = false; // ⭐ منع إعادة اتصال متعددة

function cleanProcessedMessages() {
    if (processedMessages.size > MAX_PROCESSED_CACHE) {
        const toDelete = processedMessages.size - MAX_PROCESSED_CACHE;
        const iterator = processedMessages.values();
        for (let i = 0; i < toDelete; i++) {
            processedMessages.delete(iterator.next().value);
        }
    }
}

// ═══════════════════════════════════════════════════════════
// 🤖 بدء البوت
// ═══════════════════════════════════════════════════════════

async function startBot() {
    try {
        console.log('🚀 بدء البوت...\n');
        
        loadSessionFromFile();
        
        const { version, isLatest } = await fetchLatestBaileysVersion();
        console.log(`📦 Baileys v${version.join('.')}, أحدث: ${isLatest ? '✅' : '⚠️'}\n`);
        
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
            
            // ⭐ إعدادات مهمة
            syncFullHistory: false,
            markOnlineOnConnect: true,
            emitOwnEvents: false,
            
            // ⭐ keepAlive داخلي من Baileys
            defaultQueryTimeoutMs: undefined,
            getMessage: async () => ({ conversation: '' })
        });

        globalSock = sock;

        // ⭐ حفظ credentials
        sock.ev.on('creds.update', saveCreds);

        // ⭐ معالجة الاتصال
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.error('\n❌ خطأ: تم طلب QR!\n');
                process.exit(1);
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                
                console.log(`\n❌ الاتصال مغلق - كود: ${statusCode}\n`);
                
                // ⭐ منع إعادة اتصال متعددة
                if (isReconnecting) {
                    console.log('⏭️ إعادة اتصال جارية بالفعل...\n');
                    return;
                }
                
                // جلسة فاسدة
                if (statusCode === DisconnectReason.badSession || 
                    statusCode === DisconnectReason.loggedOut ||
                    statusCode === 401 || statusCode === 403) {
                    console.error('❌ الجلسة غير صالحة!\n');
                    process.exit(1);
                }
                
                // 440 - جلسة مستبدلة
                if (statusCode === 440 || statusCode === DisconnectReason.connectionReplaced) {
                    console.log('⚠️ خطأ 440 - تم استبدال الاتصال');
                    console.log('💡 هذا قد يكون بسبب restart سريع\n');
                    
                    // انتظار أطول
                    isReconnecting = true;
                    await delay(15000);
                    isReconnecting = false;
                    
                    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                        reconnectWithDelay(15000);
                    } else {
                        console.error('❌ فشل بعد 5 محاولات\n');
                        process.exit(1);
                    }
                    return;
                }
                
                // 515
                if (statusCode === 515) {
                    console.log('⚠️ خطأ 515\n');
                    isReconnecting = true;
                    await delay(5000);
                    isReconnecting = false;
                    reconnectWithDelay(5000);
                    return;
                }
                
                // أخطاء أخرى
                reconnectWithDelay();
                
            } else if (connection === 'open') {
                console.log('✅ ════════════════════════════════════');
                console.log(`   متصل بواتساب بنجاح! 🎉`);
                console.log(`   البوت: ${CONFIG.botName}`);
                console.log(`   الرقم: ${sock.user?.id?.split(':')[0] || '---'}`);
                console.log(`   AI: ${AI_CONFIG.enabled ? '✅' : '❌'}`);
                console.log('════════════════════════════════════\n');
                
                reconnectAttempts = 0;
                isReconnecting = false;
                processedMessages.clear();
                
                // إشعار المالك
                if (CONFIG.ownerNumber) {
                    try {
                        await delay(3000);
                        await sock.sendMessage(CONFIG.ownerNumber, {
                            text: `✅ *${CONFIG.botName} متصل*\n\n📱 ${sock.user.id.split(':')[0]}\n⏰ ${new Date().toLocaleString('ar-EG')}`
                        });
                    } catch (e) {
                        console.log('⚠️ لم يتم إرسال إشعار\n');
                    }
                }
                
            } else if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال...');
            }
        });

        // ⭐ معالجة الرسائل
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') return;
                
                const msg = messages[0];
                if (!msg || !msg.message || msg.key.fromMe) return;
                
                const sender = msg.key.remoteJid;
                const messageId = msg.key.id;
                const isGroup = sender.endsWith('@g.us');
                
                if (isGroup && !CONFIG.replyInGroups) return;
                if (sender === 'status@broadcast') return;
                if (processedMessages.has(messageId)) return;
                
                const messageTime = msg.messageTimestamp * 1000;
                if (Date.now() - messageTime > 60000) return;
                
                const messageType = Object.keys(msg.message)[0];
                if (['protocolMessage', 'senderKeyDistributionMessage', 'reactionMessage'].includes(messageType)) return;
                
                const messageText = 
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption || '';

                if (!messageText.trim()) return;

                console.log('\n' + '='.repeat(50));
                console.log(`📩 ${isGroup ? '👥' : '👤'}: ${sender}`);
                console.log(`📝 ${messageText}`);
                console.log('='.repeat(50));

                processedMessages.add(messageId);
                cleanProcessedMessages();

                // الرد
                try {
                    let replyText;
                    
                    if (AI_CONFIG.enabled) {
                        const aiResponse = await getAIResponse(messageText);
                        replyText = aiResponse || `أهلين`;
                    } else {
                        replyText = `أهلين`;
                    }

                    await sock.sendMessage(sender, { text: replyText }, { quoted: msg });
                    console.log('✅ تم الرد\n');
                    
                } catch (error) {
                    console.error('❌ خطأ في الرد:', error.message);
                }
                
            } catch (error) {
                console.error('❌ خطأ في معالجة الرسالة:', error);
            }
        });

        console.log('✅ البوت جاهز ✨\n');
        
    } catch (error) {
        console.error('❌ خطأ في بدء البوت:', error);
        await delay(10000);
        reconnectWithDelay(10000);
    }
}

// ⭐ إعادة الاتصال
function reconnectWithDelay(customDelay = null) {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('❌ فشل بعد عدة محاولات\n');
        process.exit(1);
    }
    
    reconnectAttempts++;
    const delayTime = customDelay || (5000 * reconnectAttempts);
    
    console.log(`🔄 إعادة المحاولة بعد ${delayTime/1000}ث (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})\n`);
    setTimeout(startBot, delayTime);
}

// ⭐ معالجة الإيقاف
process.on('SIGINT', () => {
    console.log('\n👋 إيقاف...\n');
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 إيقاف...\n');
    server.close();
    process.exit(0);
});

startBot();

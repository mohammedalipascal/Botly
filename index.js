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

// ═══════════════════════════════════════════════════════════
// 🤖 إعدادات الذكاء الاصطناعي
// ═══════════════════════════════════════════════════════════

const AI_CONFIG = {
    enabled: process.env.AI_ENABLED === 'true',
    provider: process.env.AI_PROVIDER || 'groq', // groq أو huggingface
    apiKey: process.env.AI_API_KEY || '',
    model: process.env.AI_MODEL || 'llama-3.3-70b-versatile',
    personality: process.env.AI_PERSONALITY || 'شخصية مقداد الافتراضية',
    maxTokens: parseInt(process.env.AI_MAX_TOKENS) || 500,
    temperature: parseFloat(process.env.AI_TEMPERATURE) || 0.7
};

// ═══════════════════════════════════════════════════════════
// 🔧 دالة Delay
// ═══════════════════════════════════════════════════════════
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ═══════════════════════════════════════════════════════════
// 🔧 الإعدادات
// ═══════════════════════════════════════════════════════════

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

console.log('\n⚙️ ═══════ إعدادات البوت ═══════');
console.log(`📱 اسم البوت: ${CONFIG.botName}`);
console.log(`👤 المالك: ${CONFIG.botOwner}`);
console.log(`🔰 البادئة: ${CONFIG.prefix}`);
console.log(`👥 الرد في المجموعات: ${CONFIG.replyInGroups ? '✅ نعم' : '❌ لا'}`);
console.log(`🤖 AI: ${AI_CONFIG.enabled ? '✅ مفعّل' : '❌ معطّل'}`);
if (AI_CONFIG.enabled) {
    console.log(`🧠 المزود: ${AI_CONFIG.provider}`);
    console.log(`📊 النموذج: ${AI_CONFIG.model}`);
}
console.log('═══════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════
// ⚠️ فحص SESSION_DATA
// ═══════════════════════════════════════════════════════════

if (!CONFIG.sessionData || CONFIG.sessionData.trim() === '') {
    console.error('\n❌ خطأ: SESSION_DATA غير موجود!\n');
    process.exit(1);
}

// ═══════════════════════════════════════════════════════════
// 🧠 قاعدة المعرفة (Knowledge Base)
// ═══════════════════════════════════════════════════════════

const KNOWLEDGE_BASE = {
    // معلومات شخصية
    personal: {
        name: "مقداد",
        age: "25 سنة",
        location: "السودان",
        occupation: "مطور برمجيات",
        hobbies: ["البرمجة", "القراءة", "التقنية"],
        languages: ["العربية", "الإنجليزية"]
    },
    
    // مهارات تقنية
    skills: {
        programming: ["JavaScript", "Node.js", "Python", "PHP"],
        frameworks: ["React", "Express", "Laravel"],
        databases: ["MySQL", "MongoDB"],
        tools: ["Git", "Docker", "VS Code"]
    },
    
    // مشاريع
    projects: {
        current: "بوت واتساب ذكي مع AI",
        completed: ["موقع تجارة إلكترونية", "نظام إدارة محتوى", "تطبيق موبايل"],
        planning: ["منصة تعليمية", "أداة أتمتة"]
    },
    
    // أسلوب الكتابة
    style: {
        tone: "ودود ومحترف",
        emoji_usage: "معتدل",
        response_length: "مختصر ومفيد",
        greetings: ["مرحباً", "أهلاً", "السلام عليكم"]
    },
    
    // آراء واهتمامات
    opinions: {
        tech_preferences: "أفضل التقنيات المفتوحة المصدر والبسيطة",
        work_philosophy: "الكود النظيف أهم من السرعة",
        learning: "التعلم المستمر أساس النجاح"
    },
    
    // معلومات إضافية (أضف هنا ما تريد)
    custom: {
        favorite_food: "الكشري",
        favorite_color: "الأزرق",
        morning_person: false,
        work_hours: "مساءً وليلاً"
    }
};

// ═══════════════════════════════════════════════════════════
// 🎭 بناء الشخصية (Personality Prompt)
// ═══════════════════════════════════════════════════════════

function buildPersonalityPrompt() {
    return `أنت مقداد، ${KNOWLEDGE_BASE.personal.occupation} من ${KNOWLEDGE_BASE.personal.location}.

# شخصيتك:
- ${KNOWLEDGE_BASE.personal.age}
- تتحدث ${KNOWLEDGE_BASE.personal.languages.join(' و')}
- أسلوبك: ${KNOWLEDGE_BASE.style.tone}
- تستخدم الإيموجي بشكل ${KNOWLEDGE_BASE.style.emoji_usage}

# مهاراتك:
- لغات البرمجة: ${KNOWLEDGE_BASE.skills.programming.join(', ')}
- أطر العمل: ${KNOWLEDGE_BASE.skills.frameworks.join(', ')}
- قواعد البيانات: ${KNOWLEDGE_BASE.skills.databases.join(', ')}

# مشاريعك:
- المشروع الحالي: ${KNOWLEDGE_BASE.projects.current}
- مشاريع مكتملة: ${KNOWLEDGE_BASE.projects.completed.join(', ')}

# فلسفتك في العمل:
${KNOWLEDGE_BASE.opinions.work_philosophy}

# أسلوب الرد:
- ${KNOWLEDGE_BASE.style.response_length}
- ابدأ بـ: ${KNOWLEDGE_BASE.style.greetings.join(' أو ')}
- كن ${KNOWLEDGE_BASE.style.tone}

# معلومات شخصية:
- طعامك المفضل: ${KNOWLEDGE_BASE.custom.favorite_food}
- لونك المفضل: ${KNOWLEDGE_BASE.custom.favorite_color}
- تفضل العمل: ${KNOWLEDGE_BASE.custom.work_hours}

# تعليمات مهمة:
1. أجب كأنك مقداد نفسه
2. استخدم معرفتك أعلاه في الردود
3. لا تذكر أنك AI أو chatbot
4. كن طبيعياً وودوداً
5. إذا لم تعرف شيء، قل "لست متأكد" بأسلوب مقداد
6. رد باللغة العربية دائماً
7. احتفظ بشخصية مقداد في كل شيء`;
}

// ═══════════════════════════════════════════════════════════
// 🌐 سيرفر HTTP
// ═══════════════════════════════════════════════════════════

const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
        status: 'online',
        bot: CONFIG.botName,
        owner: CONFIG.botOwner,
        ai_enabled: AI_CONFIG.enabled,
        ai_provider: AI_CONFIG.provider,
        time: new Date().toISOString()
    }));
});

server.listen(CONFIG.port, () => {
    console.log(`🌐 HTTP Server: http://localhost:${CONFIG.port}`);
});

// ═══════════════════════════════════════════════════════════
// 💾 تحميل الجلسة
// ═══════════════════════════════════════════════════════════

function loadSessionFromEnv() {
    try {
        console.log('🔐 تحميل الجلسة من SESSION_DATA...');
        
        const sessionStr = CONFIG.sessionData.trim();
        
        if (sessionStr.length < 100) {
            throw new Error('SESSION_DATA قصير جداً');
        }
        
        const decoded = Buffer.from(sessionStr, 'base64').toString('utf-8');
        const authData = JSON.parse(decoded);
        
        if (!authData['creds.json']) {
            throw new Error('creds.json غير موجود');
        }
        
        const credsData = JSON.parse(authData['creds.json']);
        
        if (!credsData.noiseKey || !credsData.signedIdentityKey) {
            throw new Error('creds.json غير مكتمل');
        }
        
        const authPath = path.join(__dirname, 'auth_info');
        if (fs.existsSync(authPath)) {
            fs.rmSync(authPath, { recursive: true, force: true });
        }
        fs.mkdirSync(authPath, { recursive: true });
        
        for (const [filename, content] of Object.entries(authData)) {
            fs.writeFileSync(path.join(authPath, filename), content);
        }
        
        console.log('✅ تم تحميل الجلسة بنجاح\n');
        return true;
        
    } catch (error) {
        console.error(`❌ فشل تحميل الجلسة: ${error.message}`);
        process.exit(1);
    }
}

// ═══════════════════════════════════════════════════════════
// 🤖 دالة AI - Groq (مجاني وسريع جداً!)
// ═══════════════════════════════════════════════════════════

async function getAIResponse_Groq(userMessage) {
    try {
        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: AI_CONFIG.model,
                messages: [
                    {
                        role: 'system',
                        content: buildPersonalityPrompt()
                    },
                    {
                        role: 'user',
                        content: userMessage
                    }
                ],
                max_tokens: AI_CONFIG.maxTokens,
                temperature: AI_CONFIG.temperature
            })
        });

        if (!response.ok) {
            throw new Error(`Groq API error: ${response.status}`);
        }

        const data = await response.json();
        return data.choices[0].message.content.trim();

    } catch (error) {
        console.error('❌ خطأ Groq:', error.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════
// 🤖 دالة AI - Hugging Face (بديل مجاني)
// ═══════════════════════════════════════════════════════════

async function getAIResponse_HuggingFace(userMessage) {
    try {
        const fullPrompt = `${buildPersonalityPrompt()}\n\nالمستخدم: ${userMessage}\nمقداد:`;
        
        const response = await fetch(
            `https://api-inference.huggingface.co/models/${AI_CONFIG.model}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AI_CONFIG.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: fullPrompt,
                    parameters: {
                        max_new_tokens: AI_CONFIG.maxTokens,
                        temperature: AI_CONFIG.temperature,
                        return_full_text: false
                    }
                })
            }
        );

        if (!response.ok) {
            throw new Error(`HuggingFace API error: ${response.status}`);
        }

        const data = await response.json();
        return data[0]?.generated_text?.trim() || null;

    } catch (error) {
        console.error('❌ خطأ HuggingFace:', error.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════
// 🧠 الدالة الرئيسية للذكاء الاصطناعي
// ═══════════════════════════════════════════════════════════

async function getAIResponse(userMessage) {
    if (!AI_CONFIG.enabled) {
        return null;
    }

    if (!AI_CONFIG.apiKey) {
        console.error('⚠️ AI_API_KEY غير موجود');
        return null;
    }

    console.log(`🤖 طلب AI [${AI_CONFIG.provider}]: ${userMessage.substring(0, 50)}...`);

    let response;
    
    if (AI_CONFIG.provider === 'groq') {
        response = await getAIResponse_Groq(userMessage);
    } else if (AI_CONFIG.provider === 'huggingface') {
        response = await getAIResponse_HuggingFace(userMessage);
    } else {
        console.error('⚠️ مزود AI غير مدعوم');
        return null;
    }

    if (response) {
        console.log(`✅ رد AI: ${response.substring(0, 50)}...`);
    }

    return response;
}

// ═══════════════════════════════════════════════════════════
// 📊 متغيرات التتبع
// ═══════════════════════════════════════════════════════════

const processedMessages = new Set();
const MAX_PROCESSED_CACHE = 1000;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let globalSock = null;
let connectionCheckInterval = null;
let error440Count = 0; // ⭐ عدد أخطاء 440 المتتالية
const MAX_440_ERRORS = 3; // ⭐ الحد الأقصى قبل حذف الجلسة

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
// 🔄 مراقبة الاتصال
// ═══════════════════════════════════════════════════════════

function startConnectionMonitor(sock) {
    // إيقاف المراقبة القديمة
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
    }
    
    // مراقبة كل 30 ثانية
    connectionCheckInterval = setInterval(() => {
        if (sock && sock.ws && sock.ws.readyState === 1) {
            console.log('✅ الاتصال نشط');
        } else {
            console.log('⚠️ الاتصال غير نشط - محاولة إعادة الاتصال...');
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
                reconnectWithDelay(false, 5000);
            }
        }
    }, 30000);
}

// ═══════════════════════════════════════════════════════════
// 🤖 بدء البوت
// ═══════════════════════════════════════════════════════════

async function startBot() {
    try {
        console.log('🚀 بدء البوت...\n');
        
        loadSessionFromEnv();
        
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
            
            // ⭐ إعدادات مهمة جداً لمنع prekey bundle conflicts
            shouldSyncHistoryMessage: () => false, // لا تزامن السجل
            syncFullHistory: false,
            fireInitQueries: false, // لا استعلامات تلقائية
            
            // ⭐ إعدادات الاتصال
            defaultQueryTimeoutMs: undefined,
            connectTimeoutMs: 60000,
            keepAliveIntervalMs: 30000,
            retryRequestDelayMs: 250,
            
            markOnlineOnConnect: true,
            
            getMessage: async (key) => {
                return { conversation: '' };
            }
        });

        globalSock = sock;

        // ⭐ حفظ التحديثات (مهم جداً!)
        sock.ev.on('creds.update', async () => {
            await saveCreds();
            console.log('💾 تم تحديث credentials');
        });

        // معالجة الاتصال
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                console.error('\n❌ خطأ: تم طلب QR Code!');
                process.exit(1);
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`❌ الاتصال مغلق. كود: ${statusCode}`);
                
                if (statusCode === DisconnectReason.badSession || 
                    statusCode === DisconnectReason.loggedOut ||
                    statusCode === 401 || statusCode === 403) {
                    console.error('\n❌ الجلسة غير صالحة!\n');
                    process.exit(1);
                } else if (statusCode === DisconnectReason.connectionReplaced) {
                    console.log('🔄 تم استبدال الاتصال\n');
                    process.exit(1);
                } else if (statusCode === 515) {
                    console.log('⚠️ خطأ 515 - إعادة المحاولة...\n');
                    reconnectWithDelay(false, 5000);
                } else {
                    reconnectWithDelay();
                }
                
            } else if (connection === 'open') {
                console.log('✅ ════════════════════════════════════');
                console.log(`   متصل بواتساب بنجاح! 🎉`);
                console.log(`   البوت: ${CONFIG.botName}`);
                console.log(`   الرقم: ${sock.user?.id?.split(':')[0] || '---'}`);
                console.log(`   الاسم: ${sock.user?.name || '---'}`);
                console.log(`   المالك: ${CONFIG.botOwner}`);
                console.log(`   المجموعات: ${CONFIG.replyInGroups ? 'نعم ✅' : 'لا ❌'}`);
                console.log(`   AI: ${AI_CONFIG.enabled ? '✅ مفعّل' : '❌ معطّل'}`);
                console.log('════════════════════════════════════\n');
                
                reconnectAttempts = 0;
                error440Count = 0; // ⭐ إعادة تعيين عداد 440
                processedMessages.clear();
                
                // ⭐ بدء مراقبة الاتصال
                startConnectionMonitor(sock);
                
                if (CONFIG.ownerNumber) {
                    try {
                        await delay(2000);
                        await sock.sendMessage(CONFIG.ownerNumber, {
                            text: `✅ *${CONFIG.botName} متصل الآن!*\n\n` +
                                  `📱 الرقم: ${sock.user.id.split(':')[0]}\n` +
                                  `🤖 AI: ${AI_CONFIG.enabled ? 'مفعّل ✅' : 'معطّل ❌'}\n` +
                                  `⏰ ${new Date().toLocaleString('ar-EG')}`
                        });
                    } catch (err) {
                        console.log('⚠️ لم يتم إرسال إشعار للمالك');
                    }
                }
                
            } else if (connection === 'connecting') {
                console.log('🔄 جاري الاتصال...');
            }
        });

        // ═══════════════════════════════════════════════════════════
        // 💬 معالجة الرسائل مع AI
        // ═══════════════════════════════════════════════════════════
        
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            try {
                if (type !== 'notify') return;
                
                const msg = messages[0];
                if (!msg || !msg.message) return;
                
                if (msg.key.fromMe) {
                    if (CONFIG.showIgnoredMessages) console.log('⏭️ رسالة من البوت');
                    return;
                }
                
                const sender = msg.key.remoteJid;
                const messageId = msg.key.id;
                const timestamp = msg.messageTimestamp;
                const isGroup = sender.endsWith('@g.us');
                
                if (isGroup && !CONFIG.replyInGroups) {
                    if (CONFIG.showIgnoredMessages) console.log(`⏭️ مجموعة (الرد معطل)`);
                    return;
                }
                
                if (sender === 'status@broadcast') {
                    if (CONFIG.showIgnoredMessages) console.log('⏭️ حالة');
                    return;
                }
                
                const messageTime = timestamp * 1000;
                const timeDiff = Date.now() - messageTime;
                
                if (timeDiff > 60000) {
                    if (CONFIG.showIgnoredMessages) {
                        console.log(`⏭️ رسالة قديمة (${Math.floor(timeDiff / 1000)}ث)`);
                    }
                    return;
                }
                
                if (processedMessages.has(messageId)) {
                    if (CONFIG.showIgnoredMessages) console.log('⏭️ مكررة');
                    return;
                }
                
                const messageType = Object.keys(msg.message)[0];
                const ignoredTypes = [
                    'protocolMessage',
                    'senderKeyDistributionMessage',
                    'reactionMessage',
                    'messageContextInfo'
                ];
                
                if (ignoredTypes.includes(messageType)) return;
                
                const messageText = 
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    msg.message.imageMessage?.caption ||
                    msg.message.videoMessage?.caption ||
                    '';

                if (!messageText.trim()) {
                    if (CONFIG.showIgnoredMessages) console.log('⏭️ فارغة');
                    return;
                }

                console.log('\n' + '='.repeat(50));
                console.log(`📩 ${isGroup ? '👥 مجموعة' : '👤 خاص'}: ${sender}`);
                console.log(`📝 ${messageText}`);
                console.log(`⏰ ${new Date(messageTime).toLocaleString('ar-EG')}`);
                console.log('='.repeat(50));

                processedMessages.add(messageId);
                cleanProcessedMessages();

                // ═══════════════════════════════════════════════════
                // 🧠 الرد الذكي بالـ AI
                // ═══════════════════════════════════════════════════
                
                try {
                    let replyText;
                    
                    // محاولة الحصول على رد AI
                    if (AI_CONFIG.enabled) {
                        const aiResponse = await getAIResponse(messageText);
                        
                        if (aiResponse) {
                            replyText = aiResponse;
                        } else {
                            // فشل AI - رد احتياطي
                            replyText = `👋 مرحباً!\n\nأنا ${CONFIG.botOwner}، شكراً لرسالتك 🙏\n\n_"${messageText}"_\n\nالبوت يعمل ✅`;
                        }
                    } else {
                        // AI معطّل - رد عادي
                        replyText = `👋 مرحباً!\n\nأنا *${CONFIG.botName}* 🤖\nمن تصميم *${CONFIG.botOwner}*\n\nشكراً لرسالتك:\n_"${messageText}"_\n\nالبوت يعمل ✅`;
                    }

                    // إرسال الرد
                    await sock.sendMessage(sender, { 
                        text: replyText
                    }, {
                        quoted: msg
                    });
                    
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
        console.log('🔄 إعادة المحاولة بعد 10 ثواني...\n');
        setTimeout(startBot, 10000);
    }
}

// ═══════════════════════════════════════════════════════════
// 🔄 إعادة الاتصال
// ═══════════════════════════════════════════════════════════

function reconnectWithDelay(longDelay = false, customDelay = null) {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error('❌ فشل الاتصال بعد عدة محاولات');
        process.exit(1);
    }
    
    reconnectAttempts++;
    const delayTime = customDelay || (longDelay ? 15000 : (5000 * reconnectAttempts));
    
    console.log(`🔄 إعادة المحاولة بعد ${delayTime / 1000}ث (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})\n`);
    setTimeout(startBot, delayTime);
}

// ═══════════════════════════════════════════════════════════
// 🛑 معالجة الإيقاف
// ═══════════════════════════════════════════════════════════

process.on('SIGINT', async () => {
    console.log('\n\n👋 إيقاف البوت...\n');
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
    }
    if (globalSock) {
        try {
            await globalSock.logout();
        } catch (e) {}
    }
    server.close();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\n👋 إيقاف البوت (SIGTERM)...\n');
    if (connectionCheckInterval) {
        clearInterval(connectionCheckInterval);
    }
    if (globalSock) {
        try {
            await globalSock.logout();
        } catch (e) {}
    }
    server.close();
    process.exit(0);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
});

// ═══════════════════════════════════════════════════════════
// 🚀 بدء البوت
// ═══════════════════════════════════════════════════════════

startBot();

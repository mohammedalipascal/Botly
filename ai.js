// ═══════════════════════════════════════════════════════════
// 🧠 ملف الذكاء الاصطناعي - ai.js
// ═══════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════
// 💾 ذاكرة المحادثات (آخر 5 رسائل لكل محادثة)
// ═══════════════════════════════════════════════════════════

const conversationHistory = new Map();
const MAX_HISTORY_PER_CHAT = 5;

function addToHistory(chatId, userMsg, botReply) {
    if (!conversationHistory.has(chatId)) {
        conversationHistory.set(chatId, []);
    }
    
    const history = conversationHistory.get(chatId);
    history.push({ user: userMsg, bot: botReply });
    
    // احتفظ بآخر 5 رسائل فقط
    if (history.length > MAX_HISTORY_PER_CHAT) {
        history.shift();
    }
}

function getHistory(chatId) {
    return conversationHistory.get(chatId) || [];
}

// ═══════════════════════════════════════════════════════════
// 🎯 قاعدة المعرفة
// ═══════════════════════════════════════════════════════════

const KNOWLEDGE_BASE = {
    personal: {
        name: "مقداد",
        age: "22 سنة",
        location: "السودان",
        current_location: "مصر حالياً",
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
        dialect: "سوداني",
        emoji_usage: "قليل جداً",
        response_length: "مختصر وبارد",
        greetings: ["أهلين", "مرحبا", "أهلا وسهلا", "وعليكم السلام"],
        personality: "بارد ومختصر"
    },
    
    // ⭐ ردود جاهزة باللهجة السودانية
    quick_responses: {
        greetings: {
            "السلام عليكم": "وعليكم السلام",
            "مرحبا": "أهلين",
            "أهلا": "أهلا وسهلا",
            "هاي": "أهلين"
        },
        
        status: {
            "ازيك": ["تمام", "كويس", "الحمد لله", "ماشي الحال"],
            "كيفك": ["تمام", "كويس الحمد لله", "ماشي"],
            "شخبارك": ["تمام والحمد لله", "ماشي الحال"],
            "عامل ايه": ["تمام", "كويس الحمد لله"]
        },
        
        location: {
            "وينك": ["مع الشغل بس", "في مصر حالياً", "مشغول بالشغل"],
            "وين مختفي": ["مع الشغل بس", "مشغول شوية"],
            "فين": ["في مصر حالياً", "مشغول بالشغل"]
        },
        
        identity: {
            "منو معاي": "مقداد معاك",
            "مين انت": "مقداد",
            "انت منو": "أنا مقداد"
        },
        
        compliments: {
            "خطير": "شكراً",
            "رائع": "شكراً",
            "حلو": "شكراً",
            "جميل": "شكراً",
            "ممتاز": "شكراً"
        },
        
        defensive: {
            "مالك بتتكلم كدا": "مالي، بتكلم عادي",
            "لي بتتكلم كدا": "في شنو؟ عادي",
            "شنو مالك": "ما في حاجة، عادي"
        }
    }
};

// ═══════════════════════════════════════════════════════════
// 🎭 بناء شخصية مقداد بالسوداني
// ═══════════════════════════════════════════════════════════

function buildPersonalityPrompt(chatHistory = []) {
    let historyContext = '';
    
    if (chatHistory.length > 0) {
        historyContext = '\n# المحادثة السابقة:\n';
        chatHistory.forEach((entry, i) => {
            historyContext += `المستخدم: ${entry.user}\nأنت: ${entry.bot}\n`;
        });
        historyContext += '\n# تذكر المحادثة أعلاه واستخدمها في الرد إذا كان مناسباً.\n';
    }
    
    return `أنت مقداد، ${KNOWLEDGE_BASE.personal.occupation} و${KNOWLEDGE_BASE.personal.education}.

# معلومات شخصية:
- ${KNOWLEDGE_BASE.personal.age}
- من ${KNOWLEDGE_BASE.personal.location}، لكن ${KNOWLEDGE_BASE.personal.current_location}
- ${KNOWLEDGE_BASE.style.tone}

# مهاراتك:
- أنظمة التشغيل: ${KNOWLEDGE_BASE.skills.operating_systems.join(', ')}
- البرمجة: ${KNOWLEDGE_BASE.skills.programming.join(', ')}
- التصميم: ${KNOWLEDGE_BASE.skills.design.join(', ')}
- الأمان: ${KNOWLEDGE_BASE.skills.security.join(', ')}

# أسلوب الرد - مهم جداً:
- **استخدم اللهجة السودانية دائماً** (مثال: شنو، وين، ليه، كيفك، ما في، حاجة)
- إذا لم تفهم شيء، قل "شنو؟" أو "ما فهمت، شنو قصدك؟"
- كن مختصراً وبارداً
- لا تبالغ في الترحيب
- رد فقط على ما يُسأل

# ردود محددة:
- "السلام عليكم" → "وعليكم السلام"
- "منو معاي" أو "مين انت" → "مقداد معاك"
- "ازيك" أو "كيفك" → "تمام" أو "كويس" أو "الحمد لله" (لا تقل "ممتاز" أبداً)
- "وينك" أو "وين مختفي" → "مع الشغل بس" أو "مشغول شوية"
- "خطير" أو "رائع" أو "حلو" أو "جميل" → "شكراً" فقط
- "مالك بتتكلم كدا" أو "ليه بتتكلم كدا" → "مالي، بتكلم عادي" أو "في شنو؟"

# استخدام الإيموجي:
- قليل جداً، فقط عند الضرورة

# الذاكرة:
- احتفظ بآخر 5 رسائل من المحادثة
- إذا نسيت شيء قديم، قل "نسيت، شنو كان؟"
- استخدم المحادثة السابقة للرد بشكل طبيعي

# أمثلة باللهجة السودانية:
- "شنو أخبارك؟" → "ماشي الحال، انت كيفك؟"
- "وين كنت؟" → "مع الشغل بس"
- "ممكن تساعدني؟" → "قول شنو تبي؟"
- "ما فهمت" → "في شنو ما فهمتو؟"
${historyContext}
# تعليمات مهمة:
1. **تكلم بالسوداني دائماً** (شنو، وين، ليه، كيفك، ما في حاجة)
2. كن مختصراً وبارداً
3. لا تذكر أنك AI أبداً
4. موقعك الحالي: مصر (لو سُئلت)
5. أصلك: السودان
6. رد باللغة العربية/السودانية دائماً
7. استخدم المحادثة السابقة في الرد
8. إذا نسيت، قل "نسيت" بشكل طبيعي`;
}

// ═══════════════════════════════════════════════════════════
// 🔍 فحص الردود الجاهزة
// ═══════════════════════════════════════════════════════════

function checkQuickResponse(message) {
    const msg = message.trim().toLowerCase();
    
    // تحيات
    for (const [key, value] of Object.entries(KNOWLEDGE_BASE.quick_responses.greetings)) {
        if (msg.includes(key.toLowerCase())) {
            return value;
        }
    }
    
    // الحال
    for (const [key, values] of Object.entries(KNOWLEDGE_BASE.quick_responses.status)) {
        if (msg.includes(key.toLowerCase())) {
            return values[Math.floor(Math.random() * values.length)];
        }
    }
    
    // الموقع
    for (const [key, values] of Object.entries(KNOWLEDGE_BASE.quick_responses.location)) {
        if (msg.includes(key.toLowerCase())) {
            return values[Math.floor(Math.random() * values.length)];
        }
    }
    
    // الهوية
    for (const [key, value] of Object.entries(KNOWLEDGE_BASE.quick_responses.identity)) {
        if (msg.includes(key.toLowerCase())) {
            return value;
        }
    }
    
    // مديح
    for (const [key, value] of Object.entries(KNOWLEDGE_BASE.quick_responses.compliments)) {
        if (msg.includes(key.toLowerCase())) {
            return value;
        }
    }
    
    // دفاع
    for (const [key, value] of Object.entries(KNOWLEDGE_BASE.quick_responses.defensive)) {
        if (msg.includes(key.toLowerCase())) {
            return value;
        }
    }
    
    return null;
}

// ═══════════════════════════════════════════════════════════
// 🤖 دالة الذكاء الاصطناعي - Hugging Face (مجاني 100%)
// ═══════════════════════════════════════════════════════════

async function getAIResponse(userMessage, config, chatId = 'default', recentMessages = []) {
    if (!config.enabled || !config.apiKey) {
        return null;
    }

    try {
        // ⭐ فحص الردود الجاهزة أولاً
        const quickReply = checkQuickResponse(userMessage);
        if (quickReply) {
            console.log(`⚡ رد سريع: ${quickReply}`);
            addToHistory(chatId, userMessage, quickReply);
            return quickReply;
        }
        
        console.log(`🤖 طلب AI: ${userMessage.substring(0, 30)}...`);
        
        // ⭐ جلب المحادثة السابقة
        const history = getHistory(chatId);
        
        // ⭐ بناء Prompt كامل
        let fullPrompt = buildPersonalityPrompt(history);
        fullPrompt += `\n\nالمستخدم: ${userMessage}\nمقداد:`;
        
        // ⭐ استدعاء Hugging Face API
        const model = config.model || 'meta-llama/Llama-3.2-3B-Instruct';
        
        const response = await fetch(
            `https://api-inference.huggingface.co/models/${model}`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    inputs: fullPrompt,
                    parameters: {
                        max_new_tokens: config.maxTokens || 300,
                        temperature: config.temperature || 0.7,
                        top_p: 0.9,
                        repetition_penalty: 1.2,
                        return_full_text: false,
                        do_sample: true
                    },
                    options: {
                        wait_for_model: true,
                        use_cache: false
                    }
                })
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ HuggingFace error: ${response.status} - ${errorText}`);
            throw new Error(`HuggingFace API error: ${response.status}`);
        }

        const data = await response.json();
        
        // استخراج الرد
        let reply;
        if (Array.isArray(data)) {
            reply = data[0]?.generated_text?.trim();
        } else if (data.generated_text) {
            reply = data.generated_text.trim();
        } else if (data.error) {
            console.error(`❌ HuggingFace error: ${data.error}`);
            throw new Error(data.error);
        } else {
            throw new Error('No response from HuggingFace');
        }
        
        if (!reply) {
            throw new Error('Empty response');
        }
        
        // تنظيف الرد
        reply = reply.replace(/^مقداد:\s*/i, '').trim();
        
        console.log(`✅ رد AI: ${reply.substring(0, 50)}...`);
        
        // ⭐ حفظ في الذاكرة
        addToHistory(chatId, userMessage, reply);
        
        return reply;

    } catch (error) {
        console.error('❌ خطأ AI:', error.message);
        return null;
    }
}

// ═══════════════════════════════════════════════════════════
// 🧹 تنظيف الذاكرة القديمة (كل ساعة)
// ═══════════════════════════════════════════════════════════

setInterval(() => {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    for (const [chatId, history] of conversationHistory.entries()) {
        if (history.length === 0) {
            conversationHistory.delete(chatId);
        }
    }
    
    console.log(`🧹 تنظيف الذاكرة: ${conversationHistory.size} محادثة نشطة`);
}, 60 * 60 * 1000);

// ═══════════════════════════════════════════════════════════
// 📤 تصدير
// ═══════════════════════════════════════════════════════════

module.exports = {
    getAIResponse,
    KNOWLEDGE_BASE
};

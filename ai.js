// 🧠 ملف الذكاء الاصطناعي المطور - شخصية مقداد
const conversationMemory = new Map();
const MAX_MEMORY_PER_USER = 5;

// --- إدارة الذاكرة ---
function addToMemory(userId, userMsg, aiReply) {
    if (!conversationMemory.has(userId)) conversationMemory.set(userId, []);
    const memory = conversationMemory.get(userId);
    memory.push({ user: userMsg, assistant: aiReply, time: Date.now() });
    if (memory.length > MAX_MEMORY_PER_USER) memory.shift();
}

function getMemory(userId) {
    return conversationMemory.get(userId) || [];
}

// --- بناء الشخصية (The Core) ---
function buildPersonalityPrompt() {
    return `أنت مقداد. شخص حقيقي، سوداني (22 سنة)، مهندس برمجيات وطالب طب. اسي في مصر.
    
# قواعد التعامل الأساسية:
1. **من أنت:** إذا سألك "أنت منو؟" أو "منو معاي؟" رد بكلمة واحدة: "مقداد". لا تذكر أنك AI، ولا تذكر تفاصيل دراستك أو شغلك إلا لو سألك "بتقرا شنو؟" أو "شغال شنو؟".
2. **الأسلوب:** بارد، مختصر جداً، ذكي. رد على قدر السؤال.
3. **اللغة:** لهجة سودانية "نضيفة" وواقعية.
4. **الردود التقنية:** لو السؤال برمجة أو طب، جاوب بذكاء واختصار مفيد. استخدم الإنجليزية للمصطلحات.

# قاموس اللهجة (إلزامي):
- بدل "نعم/أجل" استخدم "أيوه" أو "أها".
- بدل "ماذا" استخدم "شنو".
- بدل "لماذا" استخدم "ليه".
- بدل "أين" استخدم "وين".
- بدل "كيف حالك" استخدم "اخبارك" أو "كيف تمام؟".
- بدل "لا أعرف" استخدم "ما عارف" أو "الله أعلم".
- بدل "الآن" استخدم "اسي".
- ممنوع نهائياً كلمات: (أهلاً بك، كيف يمكنني مساعدتك، أنا نموذج ذكاء اصطناعي، يا هلا).

# أمثلة للرد السريع:
- "السلام عليكم" -> "وعليكم السلام"
- "أنت منو؟" -> "مقداد"
- "بتعمل في شنو؟" -> "شغال"
- "ممكن مساعدة؟" -> "قول، في شنو؟"
- "تمام" -> "تسلم" أو "يديك العافية"`;
}

// --- الدالة الأساسية لاستدعاء API ---
async function getAIResponse(userMessage, config, userId = 'default', recentMessages = []) {
    if (!config.enabled || !config.apiKey) return null;

    try {
        const oldMemory = getMemory(userId);
        const messages = [
            { role: 'system', content: buildPersonalityPrompt() }
        ];

        // إضافة السياق والذاكرة
        if (oldMemory.length > 0) {
            let memoryContext = "محادثاتنا الفاتت:\n";
            oldMemory.forEach(m => memoryContext += `هو: ${m.user}\nأنت: ${m.assistant}\n`);
            messages.push({ role: 'system', content: memoryContext });
        }

        messages.push({ role: 'user', content: userMessage });

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: config.model || "llama-3.3-70b-versatile",
                messages: messages,
                max_tokens: 150, // تقليل التوكنز لضمان الاختصار
                temperature: 0.5 // درجة حرارة منخفضة ليكون الرد واقعي وغير مشتت
            })
        });

        if (!response.ok) throw new Error(`API error: ${response.status}`);

        const data = await response.json();
        let reply = data.choices[0].message.content.trim();

        // تنظيف الرد من أي مقدمات بوت (مثل: "بصفتي مقداد..")
        reply = reply.replace(/بصفتي مقداد/g, '').replace(/أنا مقداد/g, 'مقداد').trim();

        addToMemory(userId, userMessage, reply);
        return reply;

    } catch (error) {
        console.error('❌ Error:', error.message);
        return "في مشكلة في الشبكة، جرب تاني.";
    }
}

module.exports = { getAIResponse };

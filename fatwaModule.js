const https = require('https');
const http = require('http');

/**
 * جلب فتوى عشوائية من موقع الشيخ ابن باز
 * @returns {Promise<Object>} كائن يحتوي على معلومات الفتوى
 */
async function fetchRandomFatwa() {
    return new Promise((resolve, reject) => {
        const maxAttempts = 20;
        let attempts = 0;
        
        const tryFetch = () => {
            if (attempts >= maxAttempts) {
                reject(new Error('فشل جلب الفتوى بعد عدة محاولات'));
                return;
            }
            
            attempts++;
            
            // اختيار رقم فتوى عشوائي (نطاق أصغر من الأرقام الموجودة فعلاً)
            const fatwaId = Math.floor(Math.random() * 10000) + 1;
            const url = `https://binbaz.org.sa/fatwas/${fatwaId}`;
            
            console.log(`🔍 محاولة ${attempts}: جلب فتوى #${fatwaId}...`);
            
            // ⭐ معالجة redirects يدوياً
            const fetchWithRedirect = (url, maxRedirects = 5) => {
                if (maxRedirects === 0) {
                    console.log(`⚠️ تجاوز الحد الأقصى للـ redirects`);
                    tryFetch();
                    return;
                }
                
                https.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'ar,en;q=0.9'
                    },
                    timeout: 15000
                }, (res) => {
                    // معالجة Redirect
                    if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
                        const location = res.headers.location;
                        if (location) {
                            console.log(`  ↪️ إعادة توجيه إلى: ${location.substring(0, 50)}...`);
                            // تابع الـ redirect
                            const newUrl = location.startsWith('http') ? location : `https://binbaz.org.sa${location}`;
                            return fetchWithRedirect(newUrl, maxRedirects - 1);
                        }
                    }
                    
                    // صفحة غير موجودة
                    if (res.statusCode === 404) {
                        console.log(`⚠️ الفتوى #${fatwaId} غير موجودة، محاولة أخرى...`);
                        tryFetch();
                        return;
                    }
                    
                    // أخطاء أخرى
                    if (res.statusCode !== 200) {
                        console.log(`⚠️ خطأ ${res.statusCode}، محاولة أخرى...`);
                        tryFetch();
                        return;
                    }
                    
                    let data = '';
                    
                    res.on('data', (chunk) => {
                        data += chunk;
                    });
                    
                    res.on('end', () => {
                        try {
                            const result = parseHtmlContent(data, fatwaId, url);
                            
                            if (!result) {
                                console.log(`⚠️ الفتوى #${fatwaId} لا تحتوي على محتوى كافٍ، محاولة أخرى...`);
                                tryFetch();
                                return;
                            }
                            
                            console.log(`✅ تم جلب الفتوى #${fatwaId} بنجاح`);
                            resolve(result);
                            
                        } catch (error) {
                            console.log(`⚠️ خطأ في معالجة الفتوى #${fatwaId}: ${error.message}`);
                            tryFetch();
                        }
                    });
                    
                }).on('error', (error) => {
                    console.log(`⚠️ خطأ في الاتصال: ${error.message}`);
                    tryFetch();
                }).on('timeout', () => {
                    console.log(`⚠️ انتهى وقت الانتظار، محاولة أخرى...`);
                    tryFetch();
                });
            };
            
            fetchWithRedirect(url);
        };
        
        tryFetch();
    });
}

/**
 * تحليل محتوى HTML واستخراج الفتوى
 * @param {string} html - محتوى HTML
 * @param {number} fatwaId - رقم الفتوى
 * @param {string} url - رابط الفتوى
 * @returns {Object|null} كائن الفتوى أو null
 */
function parseHtmlContent(html, fatwaId, url) {
    // استخراج العنوان
    let title = 'فتوى';
    
    // محاولة 1: من <h1>
    let titleMatch = html.match(/<h1[^>]*>\s*(.*?)\s*<\/h1>/is);
    if (titleMatch) {
        title = cleanHtmlText(titleMatch[1]);
    } else {
        // محاولة 2: من <title>
        titleMatch = html.match(/<title>\s*(.*?)\s*<\/title>/is);
        if (titleMatch) {
            title = cleanHtmlText(titleMatch[1])
                .replace(/\s*-\s*موقع.*$/i, '')
                .replace(/\s*\|\s*موقع.*$/i, '')
                .replace(/\s*-\s*binbaz.*$/i, '');
        }
    }
    
    // استخراج المحتوى الرئيسي
    let mainContent = '';
    
    // البحث عن div الرئيسي للمحتوى
    const contentPatterns = [
        /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*fatwa-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<main[^>]*>([\s\S]*?)<\/main>/i
    ];
    
    for (const pattern of contentPatterns) {
        const match = html.match(pattern);
        if (match && match[1].length > 300) {
            mainContent = match[1];
            break;
        }
    }
    
    // إذا لم نجد، استخدم body
    if (!mainContent) {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
            mainContent = bodyMatch[1];
        }
    }
    
    if (!mainContent) {
        return null;
    }
    
    // تنظيف المحتوى
    mainContent = mainContent
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
        .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')
        .replace(/<form[^>]*>[\s\S]*?<\/form>/gi, '');
    
    // استخراج النص النظيف
    const cleanText = cleanHtmlText(mainContent);
    
    // ⭐ استخراج جميع الأسئلة والأجوبة (بما فيها الإضافية)
    let fullContent = cleanText;
    
    // البحث عن السؤال الرئيسي والجواب
    const mainAnswerKeywords = [
        /الجواب\s*:/i,
        /الإجابة\s*:/i,
        /ج\s*:/,
        /الحمد لله/i
    ];
    
    let mainQuestion = null;
    let mainAnswer = '';
    let remainingText = cleanText;
    
    // محاولة فصل السؤال الرئيسي
    for (const keyword of mainAnswerKeywords) {
        const parts = cleanText.split(keyword);
        if (parts.length > 1 && parts[0].length < 800 && parts[1].length > 100) {
            mainQuestion = parts[0]
                .replace(/السؤال|س:|نص السؤال/gi, '')
                .replace(/^\s*:\s*/g, '')
                .trim();
            remainingText = parts[1].trim();
            break;
        }
    }
    
    // إذا لم نجد فصل واضح، نستخدم كل النص
    if (!remainingText) {
        remainingText = cleanText;
    }
    
    // ⭐ البحث عن أسئلة إضافية داخل النص
    // مثل: "السؤال:" أو "السائل:" داخل الجواب
    const additionalQuestionsPattern = /(السؤال\s*:|السائل\s*:|س\s*:)\s*([^؟\?]+[؟\?])/gi;
    let match;
    const additionalQuestions = [];
    
    while ((match = additionalQuestionsPattern.exec(remainingText)) !== null) {
        const question = match[2].trim();
        if (question.length > 10 && question.length < 500) {
            additionalQuestions.push(question);
        }
    }
    
    // إزالة الأسئلة الإضافية من النص لعدم تكرارها
    let cleanedAnswer = remainingText;
    additionalQuestions.forEach(q => {
        cleanedAnswer = cleanedAnswer.replace(q, '');
    });
    cleanedAnswer = cleanedAnswer
        .replace(/(السؤال\s*:|السائل\s*:|س\s*:)/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    
    mainAnswer = cleanedAnswer;
    
    // التحقق من صحة البيانات
    if (!mainAnswer || mainAnswer.length < 100) {
        return null;
    }
    
    // اقتطاع النصوص الطويلة جداً
    if (mainQuestion && mainQuestion.length > 700) {
        mainQuestion = mainQuestion.substring(0, 700).trim() + '...';
    }
    
    if (mainAnswer.length > 2000) {
        mainAnswer = mainAnswer.substring(0, 2000).trim() + '...';
    }
    
    // تنظيف نهائي
    title = title.trim();
    if (mainQuestion) mainQuestion = mainQuestion.trim();
    mainAnswer = mainAnswer.trim();
    
    return {
        id: fatwaId,
        title: title || 'فتوى',
        question: mainQuestion,
        answer: mainAnswer,
        additionalQuestions: additionalQuestions, // الأسئلة الإضافية
        url: url
    };
}

/**
 * تنظيف النص من HTML tags والمسافات الزائدة
 * @param {string} text - النص المراد تنظيفه
 * @returns {string} النص النظيف
 */
function cleanHtmlText(text) {
    if (!text) return '';
    
    return text
        .replace(/<br\s*\/?>/gi, '\n')        // تحويل <br> إلى سطر جديد
        .replace(/<\/p>/gi, '\n\n')           // فقرات
        .replace(/<[^>]+>/g, ' ')             // إزالة HTML tags
        
        // تنظيف HTML entities
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&rsquo;/gi, "'")
        .replace(/&lsquo;/gi, "'")
        .replace(/&rdquo;/gi, '"')
        .replace(/&ldquo;/gi, '"')
        .replace(/&hellip;/gi, '...')
        .replace(/&mdash;/gi, '—')
        .replace(/&ndash;/gi, '–')
        
        // إزالة رموز غريبة شائعة
        .replace(/[^\u0000-\u007F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s\d\.\,\!\?\:\;\(\)\[\]\{\}\"\'\/\-\—\–]/g, '')
        
        // تنظيف عبارات غير مرغوبة
        .replace(/play\s+max\s+volume/gi, '')
        .replace(/تحميل\s+المادة/g, '')
        .replace(/استمع\s+للمادة/g, '')
        .replace(/المصدر\s*:/g, '')
        
        // تنظيف المسافات
        .replace(/\s+/g, ' ')                 // تقليص المسافات
        .replace(/\n\s*\n\s*\n/g, '\n\n')     // تقليص الأسطر الفارغة
        .replace(/\s+\./g, '.')               // مسافة قبل النقطة
        .replace(/\s+،/g, '،')                // مسافة قبل الفاصلة العربية
        .replace(/\s+؟/g, '؟')                // مسافة قبل علامة الاستفهام
        .trim();
}

/**
 * تنسيق الفتوى كرسالة WhatsApp
 * @param {Object} fatwa - كائن الفتوى
 * @returns {string} الرسالة المُنسقة
 */
function formatFatwaMessage(fatwa) {
    let message = `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

📿 *فتوى من موقع الشيخ ابن باز*
رحمه الله تعالى

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

*${fatwa.title}*`;

    // عرض السؤال الرئيسي إن وُجد
    if (fatwa.question) {
        message += `

*السؤال:*
${fatwa.question}`;
    }

    // عرض الجواب
    message += `

*الجواب:*
${fatwa.answer}`;

    // ⭐ عرض الأسئلة الإضافية إن وُجدت (max 2)
    if (fatwa.additionalQuestions && fatwa.additionalQuestions.length > 0) {
        const questionsToShow = fatwa.additionalQuestions.slice(0, 2); // أول سؤالين فقط
        
        questionsToShow.forEach((q, index) => {
            message += `

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

*سؤال آخر:*
${q}`;
        });
        
        // إذا كان هناك أسئلة أكثر
        if (fatwa.additionalQuestions.length > 2) {
            message += `

_(وأسئلة إضافية أخرى...)_`;
        }
    }

    message += `

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`;

    return message;
}

module.exports = {
    fetchRandomFatwa,
    formatFatwaMessage
};


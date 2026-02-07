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
    
    // محاولة فصل السؤال والجواب
    let question = null;
    let answer = cleanText;
    
    // البحث عن كلمات دالة على بداية الجواب
    const answerKeywords = [
        /الجواب\s*:/i,
        /الإجابة\s*:/i,
        /ج\s*:/,
        /الحمد لله/i,
        /نعم/i
    ];
    
    for (const keyword of answerKeywords) {
        const parts = cleanText.split(keyword);
        if (parts.length > 1 && parts[0].length < 600 && parts[1].length > 100) {
            question = parts[0].replace(/السؤال|س:|نص السؤال/gi, '').trim();
            answer = parts[1].trim();
            break;
        }
    }
    
    // التحقق من صحة البيانات
    if (!answer || answer.length < 100) {
        return null;
    }
    
    // اقتطاع النصوص الطويلة
    if (question && question.length > 600) {
        question = question.substring(0, 600).trim() + '...';
    }
    
    if (answer.length > 1500) {
        answer = answer.substring(0, 1500).trim() + '...';
    }
    
    // تنظيف نهائي
    title = title.trim();
    if (question) question = question.trim();
    answer = answer.trim();
    
    return {
        id: fatwaId,
        title: title || 'فتوى',
        question: question,
        answer: answer,
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
        .replace(/&nbsp;/g, ' ')              // إزالة &nbsp;
        .replace(/&amp;/g, '&')               // تحويل &amp;
        .replace(/&lt;/g, '<')                // تحويل &lt;
        .replace(/&gt;/g, '>')                // تحويل &gt;
        .replace(/&quot;/g, '"')              // تحويل &quot;
        .replace(/&#39;/g, "'")               // تحويل &#39;
        .replace(/&#x27;/g, "'")              // تحويل &#x27;
        .replace(/&rsquo;/g, "'")             // تحويل &rsquo;
        .replace(/&lsquo;/g, "'")             // تحويل &lsquo;
        .replace(/&rdquo;/g, '"')             // تحويل &rdquo;
        .replace(/&ldquo;/g, '"')             // تحويل &ldquo;
        .replace(/\s+/g, ' ')                 // تقليص المسافات
        .replace(/\n\s*\n\s*\n/g, '\n\n')     // تقليص الأسطر الفارغة
        .trim();
}

/**
 * تنسيق الفتوى كرسالة WhatsApp
 * @param {Object} fatwa - كائن الفتوى
 * @returns {string} الرسالة المُنسقة
 */
function formatFatwaMessage(fatwa) {
    let message = `📚 *فتوى من موقع الشيخ ابن باز*
رحمه الله تعالى

━━━━━━━━━━━━━━━━━━━━━━

📖 *${fatwa.title}*

━━━━━━━━━━━━━━━━━━━━━━`;

    if (fatwa.question) {
        message += `

❓ *السؤال:*
${fatwa.question}

━━━━━━━━━━━━━━━━━━━━━━`;
    }

    message += `

💡 *الجواب:*
${fatwa.answer}

━━━━━━━━━━━━━━━━━━━━━━

🔗 *للمزيد:*
${fatwa.url}`;

    return message;
}

module.exports = {
    fetchRandomFatwa,
    formatFatwaMessage
};

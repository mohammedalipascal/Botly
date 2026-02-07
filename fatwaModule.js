const https = require('https');
const http = require('http');

/**
 * جلب فتوى عشوائية من موقع الشيخ ابن باز
 * @returns {Promise<Object>} كائن يحتوي على معلومات الفتوى
 */
async function fetchRandomFatwa() {
    return new Promise((resolve, reject) => {
        const maxAttempts = 15;
        let attempts = 0;
        
        const tryFetch = () => {
            if (attempts >= maxAttempts) {
                reject(new Error('فشل جلب الفتوى بعد عدة محاولات'));
                return;
            }
            
            attempts++;
            
            // اختيار رقم فتوى عشوائي (من 1 إلى 30000)
            const fatwaId = Math.floor(Math.random() * 30000) + 1;
            const url = `https://binbaz.org.sa/fatwas/${fatwaId}`;
            
            console.log(`🔍 محاولة ${attempts}: جلب فتوى #${fatwaId}...`);
            
            // استخدام https بدلاً من http لتجنب مشكلة 301
            const request = https.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            }, (res) => {
                // معالجة Redirect
                if (res.statusCode === 301 || res.statusCode === 302) {
                    console.log(`⚠️ تم إعادة التوجيه، محاولة أخرى...`);
                    tryFetch();
                    return;
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
                
            });
            
            request.on('error', (error) => {
                console.log(`⚠️ خطأ في الاتصال: ${error.message}`);
                tryFetch();
            });
            
            request.on('timeout', () => {
                console.log(`⚠️ انتهى وقت الانتظار، محاولة أخرى...`);
                request.destroy();
                tryFetch();
            });
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
    let titleMatch = html.match(/<h1[^>]*>\s*(.*?)\s*<\/h1>/i);
    if (titleMatch) {
        title = cleanHtmlText(titleMatch[1]);
    } else {
        // محاولة 2: من <title>
        titleMatch = html.match(/<title>\s*(.*?)\s*<\/title>/i);
        if (titleMatch) {
            title = cleanHtmlText(titleMatch[1])
                .replace(/\s*-\s*موقع.*$/i, '')
                .replace(/\s*\|\s*موقع.*$/i, '');
        }
    }
    
    // استخراج السؤال والجواب
    let question = '';
    let answer = '';
    
    // البحث عن div class="fatwa-content" أو محتوى مشابه
    const contentPatterns = [
        /<div[^>]*class="[^"]*fatwa-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<main[^>]*>([\s\S]*?)<\/main>/i
    ];
    
    let contentHtml = '';
    for (const pattern of contentPatterns) {
        const match = html.match(pattern);
        if (match && match[1].length > 200) {
            contentHtml = match[1];
            break;
        }
    }
    
    // إذا لم نجد محتوى محدد، استخدم body
    if (!contentHtml) {
        const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
        if (bodyMatch) {
            contentHtml = bodyMatch[1];
        }
    }
    
    // تنظيف المحتوى
    if (contentHtml) {
        // إزالة السكريبتات والستايلات
        contentHtml = contentHtml
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
            .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
            .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
            .replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
        
        // استخراج النص النظيف
        const cleanText = cleanHtmlText(contentHtml);
        
        // محاولة فصل السؤال عن الجواب
        const parts = cleanText.split(/الجواب|الإجابة|ج:/i);
        if (parts.length > 1) {
            question = parts[0].replace(/السؤال|س:|نص السؤال/gi, '').trim();
            answer = parts[1].trim();
        } else {
            // إذا لم نجد فصل، استخدم كل النص كجواب
            answer = cleanText;
        }
    }
    
    // التحقق من صحة البيانات
    if (!answer || answer.length < 50) {
        return null;
    }
    
    // اقتطاع النصوص الطويلة
    if (question.length > 500) {
        question = question.substring(0, 500).trim() + '...';
    }
    
    if (answer.length > 1200) {
        answer = answer.substring(0, 1200).trim() + '...';
    }
    
    // تنظيف نهائي
    title = title.trim();
    question = question.trim();
    answer = answer.trim();
    
    return {
        id: fatwaId,
        title: title || 'فتوى',
        question: question || null,
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
    return text
        .replace(/<[^>]+>/g, ' ')           // إزالة HTML tags
        .replace(/&nbsp;/g, ' ')            // إزالة &nbsp;
        .replace(/&amp;/g, '&')             // تحويل &amp; إلى &
        .replace(/&lt;/g, '<')              // تحويل &lt;
        .replace(/&gt;/g, '>')              // تحويل &gt;
        .replace(/&quot;/g, '"')            // تحويل &quot;
        .replace(/&#39;/g, "'")             // تحويل &#39;
        .replace(/\s+/g, ' ')               // تقليص المسافات المتعددة
        .replace(/\n\s*\n/g, '\n')          // تقليص الأسطر الفارغة
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

*${fatwa.title}*

━━━━━━━━━━━━━━━━━━━━━━`;

    if (fatwa.question) {
        message += `

*السؤال:*
${fatwa.question}

━━━━━━━━━━━━━━━━━━━━━━`;
    }

    message += `

*الجواب:*
${fatwa.answer}

━━━━━━━━━━━━━━━━━━━━━━

🔗 الرابط الكامل:
${fatwa.url}`;

    return message;
}

module.exports = {
    fetchRandomFatwa,
    formatFatwaMessage
};

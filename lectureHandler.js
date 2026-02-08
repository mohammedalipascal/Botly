const https = require('https');

/**
 * جلب محتوى محاضرة من موقع ابن باز
 * @param {string} url - رابط المحاضرة
 * @returns {Promise<Object>} - المحتوى المستخرج
 */
async function fetchLectureContent(url) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('انتهى وقت الانتظار'));
        }, 15000);
        
        https.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }, (res) => {
            // معالجة redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                const newUrl = res.headers.location;
                if (newUrl) {
                    clearTimeout(timeout);
                    return fetchLectureContent(newUrl.startsWith('http') ? newUrl : `https://binbaz.org.sa${newUrl}`)
                        .then(resolve)
                        .catch(reject);
                }
            }
            
            if (res.statusCode !== 200) {
                clearTimeout(timeout);
                reject(new Error(`خطأ ${res.statusCode}`));
                return;
            }
            
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                clearTimeout(timeout);
                
                try {
                    const content = parseContent(data);
                    resolve(content);
                } catch (error) {
                    reject(error);
                }
            });
            
        }).on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });
    });
}

/**
 * تحليل HTML واستخراج المحتوى
 */
function parseContent(html) {
    // استخراج العنوان
    let title = '';
    const titleMatch = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
    if (titleMatch) {
        title = cleanText(titleMatch[1]);
    }
    
    // استخراج المحتوى الرئيسي
    let content = '';
    
    const contentPatterns = [
        /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<div[^>]*class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /<article[^>]*>([\s\S]*?)<\/article>/i,
        /<main[^>]*>([\s\S]*?)<\/main>/i
    ];
    
    for (const pattern of contentPatterns) {
        const match = html.match(pattern);
        if (match && match[1].length > 200) {
            content = match[1];
            break;
        }
    }
    
    if (!content) {
        throw new Error('لم يتم العثور على محتوى');
    }
    
    // تنظيف المحتوى
    content = content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
        .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
    
    const cleanContent = cleanText(content);
    
    // اقتطاع إذا كان طويل جداً
    const maxLength = 3000;
    let finalContent = cleanContent;
    if (cleanContent.length > maxLength) {
        finalContent = cleanContent.substring(0, maxLength) + '...\n\n_(تم الاقتطاع للاختصار)_';
    }
    
    return {
        title: title || 'محاضرة',
        content: finalContent
    };
}

/**
 * تنظيف النص من HTML
 */
function cleanText(text) {
    if (!text) return '';
    
    return text
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<[^>]+>/g, ' ')
        
        // HTML entities
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&hellip;/gi, '...')
        
        // إزالة رموز غريبة
        .replace(/[^\u0000-\u007F\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\s\d\.\,\!\?\:\;\(\)\[\]\{\}\"\'\/\-\—\–]/g, '')
        
        // عبارات غير مرغوبة
        .replace(/play\s+max\s+volume/gi, '')
        .replace(/تحميل\s+المادة/g, '')
        .replace(/استمع\s+للمادة/g, '')
        
        // تنظيف المسافات
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n\s*\n/g, '\n\n')
        .trim();
}

/**
 * تنسيق محاضرة للإرسال في WhatsApp
 */
function formatLecture(lecture, audioUrl) {
    let message = `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

🕋 *${lecture.title}*

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

${lecture.content}

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`;

    return message;
}

/**
 * تحميل ملف صوتي
 */
async function downloadAudio(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`فشل التحميل: ${res.statusCode}`));
                return;
            }
            
            const chunks = [];
            
            res.on('data', (chunk) => {
                chunks.push(chunk);
            });
            
            res.on('end', () => {
                resolve(Buffer.concat(chunks));
            });
            
        }).on('error', reject);
    });
}

module.exports = {
    fetchLectureContent,
    formatLecture,
    downloadAudio
};

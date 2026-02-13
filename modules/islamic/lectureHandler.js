const axios = require('axios');
const cheerio = require('cheerio');

// جلب محتوى المحاضرة
async function fetchLectureContent(url) {
    try {
        console.log(`📥 جلب المحاضرة من: ${url}`);
        
        const response = await axios.get(url, {
            timeout: 15000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        
        // جلب العنوان
        let title = $('h1').first().text().trim();
        if (!title) {
            title = $('title').text().trim();
        }
        if (!title) {
            title = 'محاضرة من موقع ابن باز';
        }

        // جلب رابط الصوت
        let audioUrl = '';
        
        // البحث عن رابط MP3
        $('a[href*=".mp3"]').each((i, elem) => {
            const href = $(elem).attr('href');
            if (href && href.includes('.mp3')) {
                audioUrl = href.startsWith('http') ? href : `https://binbaz.org.sa${href}`;
                return false; // break
            }
        });

        // البحث في source tags
        if (!audioUrl) {
            $('source[src*=".mp3"]').each((i, elem) => {
                const src = $(elem).attr('src');
                if (src && src.includes('.mp3')) {
                    audioUrl = src.startsWith('http') ? src : `https://binbaz.org.sa${src}`;
                    return false;
                }
            });
        }

        // جلب المحتوى النصي
        let content = '';
        $('.content p, article p, .lecture-content p').each((i, elem) => {
            const text = $(elem).text().trim();
            if (text && text.length > 10) {
                content += text + '\n\n';
            }
        });

        if (!content) {
            content = $('.content, article, .lecture-content').first().text().trim();
        }

        console.log(`✅ تم جلب: ${title}`);
        console.log(`🎵 الصوت: ${audioUrl || 'غير متوفر'}`);

        return {
            title: title,
            content: content.substring(0, 1500),
            audioUrl: audioUrl,
            pageUrl: url
        };

    } catch (error) {
        console.error('❌ فشل جلب المحاضرة:', error.message);
        throw error;
    }
}

// تنسيق رسالة المحاضرة
function formatLecture(lecture) {
    let message = `📚 *${lecture.title}*\n\n`;
    
    if (lecture.content) {
        message += `${lecture.content}\n\n`;
    }
    
    if (lecture.audioUrl) {
        message += `🎵 [استماع للمحاضرة](${lecture.audioUrl})\n\n`;
    }
    
    if (lecture.pageUrl) {
        message += `🔗 [المزيد](${lecture.pageUrl})`;
    }
    
    return message;
}

module.exports = {
    fetchLectureContent,
    formatLecture
};

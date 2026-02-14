// جلب محتوى المحاضرة (بدون صوت)
async function fetchLectureContent(url) {
    try {
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

        return {
            title: title,
            content: content.substring(0, 1500),
            pageUrl: url
        };

    } catch (error) {
        console.error('❌ فشل جلب المحاضرة:', error.message);
        throw error;
    }
}

// تنسيق رسالة المحاضرة (نص بسيط فقط)
function formatLecture(lecture) {
    let message = `*${lecture.title}*\n\n`;
    
    if (lecture.content && lecture.content.length > 50) {
        message += `${lecture.content}\n\n`;
    }
    
    message += `المزيد: ${lecture.pageUrl}`;
    
    return message;
}

module.exports = {
    fetchLectureContent,
    formatLecture
};

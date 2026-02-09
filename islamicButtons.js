const { ISLAMIC_CONTENT } = require('./islamicContent');

// ═══════════════════════════════════════════════════════════
// 📱 نظام List Messages للقسم الإسلامي
// ═══════════════════════════════════════════════════════════

/**
 * إرسال القائمة الرئيسية
 */
async function sendMainMenu(sock, chatId) {
    const sections = [
        {
            title: "🕌 الأقسام الإسلامية",
            rows: [
                { title: "📿 الأذكار", rowId: "athkar", description: "أذكار الصباح والمساء" },
                { title: "📚 الفتاوى", rowId: "fatawa", description: "فتاوى الشيخ ابن باز رحمه الله" },
                { title: "⚖️ الفقه", rowId: "fiqh", description: "عبادات، معاملات، فقه الأسرة" },
                { title: "📖 الموضوعية", rowId: "mawdooiya", description: "قرآن، عقيدة، حديث، دعوة" }
            ]
        }
    ];

    const listMessage = {
        text: `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

🕌 *القسم الإسلامي*

مرحباً بك في القسم الإسلامي من موقع الشيخ ابن باز رحمه الله تعالى

اختر القسم المطلوب من القائمة أدناه:

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`,
        footer: "Botly - القسم الإسلامي",
        title: "📋 اختر القسم",
        buttonText: "📂 فتح القائمة",
        sections
    };

    await sock.sendMessage(chatId, listMessage);
}

/**
 * إرسال قائمة أقسام الفقه
 */
async function sendFiqhMenu(sock, chatId) {
    const sections = [
        {
            title: "⚖️ أقسام الفقه",
            rows: [
                { title: "🕌 العبادات", rowId: "fiqh_ibadat", description: "الصلاة، الصيام، الحج، الزكاة..." },
                { title: "💰 المعاملات", rowId: "fiqh_muamalat", description: "البيوع، الربا، الشركة..." },
                { title: "👨‍👩‍👧 فقه الأسرة", rowId: "fiqh_usrah", description: "الزواج، الطلاق، النفقات..." },
                { title: "🏛️ العادات", rowId: "fiqh_adat", description: "عادات وتقاليد" },
                { title: "🏠 العودة للقائمة الرئيسية", rowId: "main_menu", description: "الرجوع" }
            ]
        }
    ];

    const listMessage = {
        text: `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

⚖️ *الفقه*

اختر القسم الفرعي:

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`,
        footer: "Botly - الفقه",
        title: "📋 اختر القسم الفرعي",
        buttonText: "📂 فتح القائمة",
        sections
    };

    await sock.sendMessage(chatId, listMessage);
}

/**
 * إرسال قائمة العبادات
 */
async function sendIbadatMenu(sock, chatId) {
    const sections = [
        {
            title: "🕌 العبادات",
            rows: [
                { title: "🕌 الصلاة", rowId: "fiqh_ibadat_salah", description: "أحكام الصلاة" },
                { title: "⚰️ الجنائز", rowId: "fiqh_ibadat_janazah", description: "أحكام الجنائز" },
                { title: "💰 الزكاة", rowId: "fiqh_ibadat_zakah", description: "أحكام الزكاة" },
                { title: "🌙 الصيام", rowId: "fiqh_ibadat_siyam", description: "أحكام الصيام" },
                { title: "🕋 الحج والعمرة", rowId: "fiqh_ibadat_hajj", description: "أحكام الحج" },
                { title: "💧 الطهارة", rowId: "fiqh_ibadat_taharah", description: "أحكام الطهارة" },
                { title: "⚔️ الجهاد والسير", rowId: "fiqh_ibadat_jihad", description: "أحكام الجهاد" },
                { title: "◀️ رجوع", rowId: "fiqh", description: "العودة لقائمة الفقه" }
            ]
        }
    ];

    const listMessage = {
        text: `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

🕌 *العبادات*

اختر الموضوع:

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`,
        footer: "Botly - العبادات",
        title: "📋 اختر الموضوع",
        buttonText: "📂 فتح القائمة",
        sections
    };

    await sock.sendMessage(chatId, listMessage);
}

/**
 * إرسال قائمة فئات الصلاة (10 فئات فقط في كل قائمة)
 */
async function sendSalahMenu(sock, chatId, page = 1) {
    const categories = ISLAMIC_CONTENT.fiqh.subsections.ibadat.topics.salah.categories;
    const categoryKeys = Object.keys(categories);
    const itemsPerPage = 10;
    const totalPages = Math.ceil(categoryKeys.length / itemsPerPage);
    
    const startIdx = (page - 1) * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, categoryKeys.length);
    const pageKeys = categoryKeys.slice(startIdx, endIdx);
    
    const rows = pageKeys.map(key => ({
        title: categories[key].displayName,
        rowId: `salah_${key}`,
        description: `فئة: ${categories[key].displayName}`
    }));
    
    // إضافة أزرار التنقل
    if (page < totalPages) {
        rows.push({ title: "⏩ الصفحة التالية", rowId: `salah_page_${page + 1}`, description: `صفحة ${page + 1}` });
    }
    if (page > 1) {
        rows.push({ title: "⏪ الصفحة السابقة", rowId: `salah_page_${page - 1}`, description: `صفحة ${page - 1}` });
    }
    rows.push({ title: "◀️ رجوع", rowId: "fiqh_ibadat", description: "العودة للعبادات" });
    
    const sections = [{ title: "🕌 فئات الصلاة", rows }];

    const listMessage = {
        text: `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

🕌 *الصلاة*

اختر الفئة المطلوبة:

_الصفحة ${page} من ${totalPages}_

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`,
        footer: "Botly - الصلاة",
        title: "📋 اختر الفئة",
        buttonText: "📂 فتح القائمة",
        sections
    };

    await sock.sendMessage(chatId, listMessage);
}

/**
 * إرسال قائمة المعاملات
 */
async function sendMuamalatMenu(sock, chatId) {
    const topics = ISLAMIC_CONTENT.fiqh.subsections.muamalat.topics;
    const topicKeys = Object.keys(topics);
    
    const rows = topicKeys.slice(0, 10).map(key => ({
        title: topics[key].displayName,
        rowId: `muamalat_${key}`,
        description: `موضوع: ${topics[key].displayName}`
    }));
    
    rows.push({ title: "◀️ رجوع", rowId: "fiqh", description: "العودة لقائمة الفقه" });
    
    const sections = [{ title: "💰 المعاملات", rows }];

    const listMessage = {
        text: `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

💰 *المعاملات*

اختر الموضوع:

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`,
        footer: "Botly - المعاملات",
        title: "📋 اختر الموضوع",
        buttonText: "📂 فتح القائمة",
        sections
    };

    await sock.sendMessage(chatId, listMessage);
}

/**
 * إرسال قائمة فقه الأسرة
 */
async function sendUsrahMenu(sock, chatId) {
    const topics = ISLAMIC_CONTENT.fiqh.subsections.fiqhUsrah.topics;
    const topicKeys = Object.keys(topics);
    
    const rows = topicKeys.slice(0, 10).map(key => ({
        title: topics[key].displayName,
        rowId: `usrah_${key}`,
        description: `موضوع: ${topics[key].displayName}`
    }));
    
    rows.push({ title: "◀️ رجوع", rowId: "fiqh", description: "العودة لقائمة الفقه" });
    
    const sections = [{ title: "👨‍👩‍👧 فقه الأسرة", rows }];

    const listMessage = {
        text: `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

👨‍👩‍👧 *فقه الأسرة*

اختر الموضوع:

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`,
        footer: "Botly - فقه الأسرة",
        title: "📋 اختر الموضوع",
        buttonText: "📂 فتح القائمة",
        sections
    };

    await sock.sendMessage(chatId, listMessage);
}

/**
 * إرسال قائمة الموضوعية
 */
async function sendMawdooiyaMenu(sock, chatId, page = 1) {
    const topics = ISLAMIC_CONTENT.mawdooiya.topics;
    const topicKeys = Object.keys(topics);
    const itemsPerPage = 10;
    const totalPages = Math.ceil(topicKeys.length / itemsPerPage);
    
    const startIdx = (page - 1) * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, topicKeys.length);
    const pageKeys = topicKeys.slice(startIdx, endIdx);
    
    const rows = pageKeys.map(key => ({
        title: topics[key].displayName,
        rowId: `mawdooiya_${key}`,
        description: `موضوع: ${topics[key].displayName}`
    }));
    
    // أزرار التنقل
    if (page < totalPages) {
        rows.push({ title: "⏩ الصفحة التالية", rowId: `mawdooiya_page_${page + 1}`, description: `صفحة ${page + 1}` });
    }
    if (page > 1) {
        rows.push({ title: "⏪ الصفحة السابقة", rowId: `mawdooiya_page_${page - 1}`, description: `صفحة ${page - 1}` });
    }
    rows.push({ title: "◀️ رجوع", rowId: "main_menu", description: "العودة للقائمة الرئيسية" });
    
    const sections = [{ title: "📖 الموضوعية", rows }];

    const listMessage = {
        text: `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

📖 *الموضوعية*

اختر الموضوع:

_الصفحة ${page} من ${totalPages}_

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`,
        footer: "Botly - الموضوعية",
        title: "📋 اختر الموضوع",
        buttonText: "📂 فتح القائمة",
        sections
    };

    await sock.sendMessage(chatId, listMessage);
}

/**
 * معالجة اختيار القائمة
 */
async function handleListResponse(sock, chatId, selectedId, senderId) {
    try {
        console.log(`📋 List Response: ${selectedId}`);
        
        // القائمة الرئيسية
        if (selectedId === 'main_menu') {
            await sendMainMenu(sock, chatId);
            return true;
        }
        
        // الأذكار
        if (selectedId === 'athkar') {
            await sock.sendMessage(chatId, {
                text: `✅ *تم تفعيل الأذكار*

🌅 *الصباح:* 6:50 و 7:00
🌇 *المساء:* 3:50 و 4:00

سيتم إرسال الأذكار تلقائياً للمجموعة في هذه الأوقات.`
            });
            return { action: 'enable_athkar' };
        }
        
        // الفتاوى
        if (selectedId === 'fatawa') {
            await sock.sendMessage(chatId, {
                text: `✅ *تم تفعيل الفتاوى*

📚 *التوقيت:* يومياً الساعة 12:00 ظهراً

سيتم إرسال فتوى عشوائية من موقع الشيخ ابن باز رحمه الله تلقائياً للمجموعة.`
            });
            return { action: 'enable_fatawa' };
        }
        
        // الفقه
        if (selectedId === 'fiqh') {
            await sendFiqhMenu(sock, chatId);
            return true;
        }
        
        // أقسام الفقه
        if (selectedId === 'fiqh_ibadat') {
            await sendIbadatMenu(sock, chatId);
            return true;
        }
        if (selectedId === 'fiqh_muamalat') {
            await sendMuamalatMenu(sock, chatId);
            return true;
        }
        if (selectedId === 'fiqh_usrah') {
            await sendUsrahMenu(sock, chatId);
            return true;
        }
        if (selectedId === 'fiqh_adat') {
            await sock.sendMessage(chatId, { text: '⚠️ قسم العادات قيد التطوير' });
            await sendFiqhMenu(sock, chatId);
            return true;
        }
        
        // الصلاة
        if (selectedId === 'fiqh_ibadat_salah') {
            await sendSalahMenu(sock, chatId, 1);
            return true;
        }
        
        // صفحات الصلاة
        if (selectedId.startsWith('salah_page_')) {
            const page = parseInt(selectedId.split('_')[2]);
            await sendSalahMenu(sock, chatId, page);
            return true;
        }
        
        // فئات الصلاة
        if (selectedId.startsWith('salah_')) {
            const categoryKey = selectedId.replace('salah_', '');
            
            // تجاهل أوامر page
            if (categoryKey.startsWith('page_')) return true;
            
            const category = ISLAMIC_CONTENT.fiqh.subsections.ibadat.topics.salah.categories[categoryKey];
            
            if (!category) {
                await sock.sendMessage(chatId, { text: '⚠️ فئة غير موجودة' });
                return true;
            }
            
            // تفعيل القسم
            await sock.sendMessage(chatId, {
                text: `✅ *تم تفعيل قسم: ${category.displayName}*

📖 سيتم إرسال المحاضرات تلقائياً للمجموعة كل ساعة

🔄 جاري إرسال أول محاضرة...`
            });
            
            return { 
                action: 'enable_fiqh', 
                path: ['fiqh', 'ibadat', 'salah', categoryKey],
                categoryName: category.displayName
            };
        }
        
        // الموضوعية
        if (selectedId === 'mawdooiya') {
            await sendMawdooiyaMenu(sock, chatId, 1);
            return true;
        }
        
        // صفحات الموضوعية
        if (selectedId.startsWith('mawdooiya_page_')) {
            const page = parseInt(selectedId.split('_')[2]);
            await sendMawdooiyaMenu(sock, chatId, page);
            return true;
        }
        
        // مواضيع الموضوعية
        if (selectedId.startsWith('mawdooiya_')) {
            const topicKey = selectedId.replace('mawdooiya_', '');
            
            if (topicKey.startsWith('page_')) return true;
            
            const topic = ISLAMIC_CONTENT.mawdooiya.topics[topicKey];
            
            if (!topic) {
                await sock.sendMessage(chatId, { text: '⚠️ موضوع غير موجود' });
                return true;
            }
            
            await sock.sendMessage(chatId, {
                text: `✅ *تم تفعيل قسم: ${topic.displayName}*

📖 سيتم إرسال المحاضرات تلقائياً للمجموعة كل ساعة`
            });
            
            return { 
                action: 'enable_mawdooiya', 
                path: ['mawdooiya', topicKey],
                topicName: topic.displayName
            };
        }
        
        // باقي مواضيع العبادات
        if (selectedId === 'fiqh_ibadat_janazah' || selectedId === 'fiqh_ibadat_zakah' || 
            selectedId === 'fiqh_ibadat_siyam' || selectedId === 'fiqh_ibadat_hajj' || 
            selectedId === 'fiqh_ibadat_taharah' || selectedId === 'fiqh_ibadat_jihad') {
            await sock.sendMessage(chatId, { text: '⚠️ هذا القسم قيد التطوير - سيتم إضافة المحاضرات قريباً' });
            await sendIbadatMenu(sock, chatId);
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ خطأ في معالجة List Response:', error.message);
        return false;
    }
}

/**
 * إرسال زر تحميل الصوت مع المحاضرة
 */
async function sendLectureWithAudioButton(sock, chatId, lectureMessage, audioUrl, lectureId, title) {
    const buttons = [
        { buttonId: `audio_${lectureId}`, buttonText: { displayText: '🔊 تحميل الصوت' }, type: 1 }
    ];
    
    const buttonMessage = {
        text: lectureMessage,
        footer: 'Botly - القسم الإسلامي',
        buttons: buttons,
        headerType: 1
    };
    
    await sock.sendMessage(chatId, buttonMessage);
}

module.exports = {
    sendMainMenu,
    sendFiqhMenu,
    sendIbadatMenu,
    sendSalahMenu,
    sendMuamalatMenu,
    sendUsrahMenu,
    sendMawdooiyaMenu,
    handleListResponse,
    sendLectureWithAudioButton
};


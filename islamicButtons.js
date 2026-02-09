const { ISLAMIC_CONTENT } = require('./islamicContent');

// ═══════════════════════════════════════════════════════════
// 📱 نظام List Messages للقسم الإسلامي
// ═══════════════════════════════════════════════════════════

/**
 * إرسال القائمة الرئيسية - نظام Buttons
 */
async function sendMainMenu(sock, chatId) {
    const buttons = [
        { buttonId: 'athkar', buttonText: { displayText: '📿 الأذكار' }, type: 1 },
        { buttonId: 'fatawa', buttonText: { displayText: '📚 الفتاوى' }, type: 1 },
        { buttonId: 'fiqh', buttonText: { displayText: '⚖️ الفقه' }, type: 1 }
    ];

    const buttonMessage = {
        text: `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

🕌 *القسم الإسلامي*

مرحباً بك في القسم الإسلامي من موقع الشيخ ابن باز رحمه الله تعالى

اختر القسم المطلوب:

📿 *الأذكار* - أذكار الصباح والمساء
📚 *الفتاوى* - فتاوى الشيخ ابن باز رحمه الله
⚖️ *الفقه* - عبادات، معاملات، فقه الأسرة

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`,
        footer: 'Botly - القسم الإسلامي',
        buttons: buttons,
        headerType: 1
    };

    await sock.sendMessage(chatId, buttonMessage);
}

/**
 * إرسال قائمة أقسام الفقه - نظام Buttons
 */
async function sendFiqhMenu(sock, chatId) {
    const buttons = [
        { buttonId: 'fiqh_ibadat', buttonText: { displayText: '🕌 العبادات' }, type: 1 },
        { buttonId: 'fiqh_muamalat', buttonText: { displayText: '💰 المعاملات' }, type: 1 },
        { buttonId: 'main_menu', buttonText: { displayText: '🏠 القائمة الرئيسية' }, type: 1 }
    ];

    const buttonMessage = {
        text: `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

⚖️ *الفقه*

اختر القسم الفرعي:

🕌 *العبادات* - الصلاة، الصيام، الحج، الزكاة
💰 *المعاملات* - البيوع، الربا، الشركة
👨‍👩‍👧 *فقه الأسرة* - (قريباً)
🏛️ *العادات* - (قريباً)

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`,
        footer: 'Botly - الفقه',
        buttons: buttons,
        headerType: 1
    };

    await sock.sendMessage(chatId, buttonMessage);
}

/**
 * إرسال قائمة العبادات - نظام Buttons مع صفحات
 */
async function sendIbadatMenu(sock, chatId, page = 1) {
    let buttons = [];
    let text = '';
    
    if (page === 1) {
        buttons = [
            { buttonId: 'fiqh_ibadat_salah', buttonText: { displayText: '🕌 الصلاة' }, type: 1 },
            { buttonId: 'fiqh_ibadat_zakah', buttonText: { displayText: '💰 الزكاة' }, type: 1 },
            { buttonId: 'ibadat_page_2', buttonText: { displayText: '⏩ التالي' }, type: 1 }
        ];
        
        text = `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

🕌 *العبادات* (صفحة 1/3)

🕌 *الصلاة* - أحكام الصلاة
💰 *الزكاة* - أحكام الزكاة
⚰️ *الجنائز* - (صفحة 2)
🌙 *الصيام* - (صفحة 2)
🕋 *الحج* - (صفحة 3)
💧 *الطهارة* - (صفحة 3)

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`;
    } else if (page === 2) {
        buttons = [
            { buttonId: 'fiqh_ibadat_janazah', buttonText: { displayText: '⚰️ الجنائز' }, type: 1 },
            { buttonId: 'fiqh_ibadat_siyam', buttonText: { displayText: '🌙 الصيام' }, type: 1 },
            { buttonId: 'ibadat_page_3', buttonText: { displayText: '⏩ التالي' }, type: 1 }
        ];
        
        text = `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

🕌 *العبادات* (صفحة 2/3)

⚰️ *الجنائز* - أحكام الجنائز
🌙 *الصيام* - أحكام الصيام

_اضغط التالي للمزيد..._

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`;
    } else if (page === 3) {
        buttons = [
            { buttonId: 'fiqh_ibadat_hajj', buttonText: { displayText: '🕋 الحج' }, type: 1 },
            { buttonId: 'fiqh_ibadat_taharah', buttonText: { displayText: '💧 الطهارة' }, type: 1 },
            { buttonId: 'fiqh', buttonText: { displayText: '◀️ رجوع' }, type: 1 }
        ];
        
        text = `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

🕌 *العبادات* (صفحة 3/3)

🕋 *الحج والعمرة* - أحكام الحج
💧 *الطهارة* - أحكام الطهارة
⚔️ *الجهاد* - (قريباً)

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`;
    }

    const buttonMessage = {
        text: text,
        footer: 'Botly - العبادات',
        buttons: buttons,
        headerType: 1
    };

    await sock.sendMessage(chatId, buttonMessage);
}

/**
 * إرسال قائمة فئات الصلاة - نظام Buttons مع صفحات
 */
async function sendSalahMenu(sock, chatId, page = 1) {
    const categories = ISLAMIC_CONTENT.fiqh.subsections.ibadat.topics.salah.categories;
    const categoryKeys = Object.keys(categories);
    const itemsPerPage = 3;
    const totalPages = Math.ceil(categoryKeys.length / itemsPerPage);
    
    const startIdx = (page - 1) * itemsPerPage;
    const endIdx = Math.min(startIdx + itemsPerPage, categoryKeys.length);
    const pageKeys = categoryKeys.slice(startIdx, endIdx);
    
    const buttons = [];
    let text = `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

🕌 *الصلاة* (صفحة ${page}/${totalPages})

`;
    
    // إضافة أزرار الفئات (max 3)
    let btnCount = 0;
    for (const key of pageKeys) {
        if (btnCount < 2) { // نترك مكان للزر الثالث (التالي/السابق/رجوع)
            buttons.push({
                buttonId: `salah_${key}`,
                buttonText: { displayText: categories[key].displayName.substring(0, 20) },
                type: 1
            });
            text += `• ${categories[key].displayName}\n`;
            btnCount++;
        }
    }
    
    text += `\n_الصفحة ${page} من ${totalPages}_\n\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`;
    
    // زر التنقل
    if (page < totalPages) {
        buttons.push({
            buttonId: `salah_page_${page + 1}`,
            buttonText: { displayText: `⏩ الصفحة ${page + 1}` },
            type: 1
        });
    } else {
        buttons.push({
            buttonId: 'fiqh_ibadat',
            buttonText: { displayText: '◀️ رجوع للعبادات' },
            type: 1
        });
    }

    const buttonMessage = {
        text: text,
        footer: 'Botly - الصلاة',
        buttons: buttons,
        headerType: 1
    };

    await sock.sendMessage(chatId, buttonMessage);
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
 * معالجة اختيار الزر
 */
async function handleButtonResponse(sock, chatId, selectedId, senderId) {
    try {
        console.log(`🔘 Button Response: ${selectedId}`);
        
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
            await sendIbadatMenu(sock, chatId, 1);
            return true;
        }
        if (selectedId === 'fiqh_muamalat') {
            await sock.sendMessage(chatId, { text: '⚠️ قسم المعاملات قيد التطوير' });
            await sendFiqhMenu(sock, chatId);
            return true;
        }
        if (selectedId === 'fiqh_usrah') {
            await sock.sendMessage(chatId, { text: '⚠️ قسم فقه الأسرة قيد التطوير' });
            await sendFiqhMenu(sock, chatId);
            return true;
        }
        if (selectedId === 'fiqh_adat') {
            await sock.sendMessage(chatId, { text: '⚠️ قسم العادات قيد التطوير' });
            await sendFiqhMenu(sock, chatId);
            return true;
        }
        
        // صفحات العبادات
        if (selectedId === 'ibadat_page_2') {
            await sendIbadatMenu(sock, chatId, 2);
            return true;
        }
        if (selectedId === 'ibadat_page_3') {
            await sendIbadatMenu(sock, chatId, 3);
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
        
        // فئات الصلاة - التفعيل
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
        
        // باقي مواضيع العبادات (قيد التطوير)
        if (selectedId === 'fiqh_ibadat_janazah' || selectedId === 'fiqh_ibadat_zakah' || 
            selectedId === 'fiqh_ibadat_siyam' || selectedId === 'fiqh_ibadat_hajj' || 
            selectedId === 'fiqh_ibadat_taharah' || selectedId === 'fiqh_ibadat_jihad') {
            await sock.sendMessage(chatId, { text: '⚠️ هذا القسم قيد التطوير - سيتم إضافة المحاضرات قريباً' });
            await sendIbadatMenu(sock, chatId, 1);
            return true;
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ خطأ في معالجة Button Response:', error.message);
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
    handleButtonResponse,
    sendLectureWithAudioButton
};

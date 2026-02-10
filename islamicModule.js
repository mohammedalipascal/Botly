const cron = require('node-cron');
const db = require('./googleSheetsDB');
const { fetchLectureContent, formatLecture } = require('./lectureHandler');

// إعدادات البوت (يمكن استبدالها من index.js)
const CONFIG = {
    botName: process.env.BOT_NAME || 'Islamic Bot'
};

let ISLAMIC_MODULE_ENABLED = true;
let scheduledJobs = {};
let userSessions = {}; // تتبع جلسات المستخدمين في القوائم

// هيكل القائمة
const MENU_STRUCTURE = {
    'main': {
        title: '🕌 القائمة الرئيسية',
        options: ['محاضرات العقيدة', 'محاضرات الفقه', 'محاضرات الآداب', 'أذكار'],
        backTo: null
    },
    'محاضرات العقيدة': {
        title: '📚 محاضرات العقيدة',
        options: ['التوحيد', 'أسماء الله الحسنى', 'الإيمان بالقدر'],
        backTo: 'main'
    },
    'محاضرات الفقه': {
        title: '⚖️ محاضرات الفقه',
        options: ['أحكام الصلاة', 'أحكام الزكاة', 'أحكام الصيام', 'أحكام الحج'],
        backTo: 'main'
    },
    'محاضرات الآداب': {
        title: '🌟 محاضرات الآداب',
        options: ['آداب الطعام', 'آداب النوم', 'آداب المجلس'],
        backTo: 'main'
    },
    'أذكار': {
        title: '📿 الأذكار',
        options: ['أذكار الصباح', 'أذكار المساء', 'أذكار النوم'],
        backTo: 'main'
    }
};

// تعيين الأقسام النهائية (التي يمكن تفعيلها)
const FINAL_CATEGORIES = [
    'التوحيد', 'أسماء الله الحسنى', 'الإيمان بالقدر',
    'أحكام الصلاة', 'أحكام الزكاة', 'أحكام الصيام', 'أحكام الحج',
    'آداب الطعام', 'آداب النوم', 'آداب المجلس',
    'أذكار الصباح', 'أذكار المساء', 'أذكار النوم'
];

/**
 * بدء جدولة المحاضرات
 */
async function startIslamicSchedule(sock) {
    console.log('🕌 بدء جدولة المحاضرات الإسلامية...');
    
    try {
        // تهيئة قاعدة البيانات
        const initialized = await db.initialize();
        if (!initialized) {
            console.log('⚠️ تعذر الاتصال بـ Google Sheets - سيتم العمل بدون قاعدة بيانات');
            return;
        }

        const schedules = await db.getAllSchedules();
        
        for (const schedule of schedules) {
            if (schedule.enabled && schedule.groupId) {
                createScheduleJob(sock, schedule);
            }
        }
        
        console.log(`✅ تم جدولة ${Object.keys(scheduledJobs).length} قسم`);
    } catch (error) {
        console.error('❌ خطأ في بدء الجدولة:', error.message);
    }
}

/**
 * إنشاء مهمة جدولة لقسم معين
 */
function createScheduleJob(sock, schedule) {
    const jobKey = `${schedule.category}_${schedule.groupId}`;
    
    // إلغاء المهمة القديمة إن وجدت
    if (scheduledJobs[jobKey]) {
        scheduledJobs[jobKey].stop();
    }
    
    // إنشاء مهمة جديدة
    scheduledJobs[jobKey] = cron.schedule(schedule.cronTime, async () => {
        await sendScheduledLecture(sock, schedule.category, schedule.groupId);
    });
    
    console.log(`✅ تم جدولة ${schedule.category} للمجموعة ${schedule.groupId}`);
}

/**
 * إرسال محاضرة مجدولة
 */
async function sendScheduledLecture(sock, category, groupId) {
    try {
        const nextLecture = await db.getNextLecture(category);
        
        if (!nextLecture) {
            console.log(`⚠️ لا توجد محاضرات في قسم ${category}`);
            return;
        }
        
        // جلب محتوى المحاضرة
        const content = await fetchLectureContent(nextLecture.pageUrl);
        const message = formatLecture(content);
        
        // إرسال المحاضرة
        await sock.sendMessage(groupId, { text: message });
        
        // تحديث التقدم
        await db.updateProgress(category, nextLecture.id);
        
        console.log(`✅ تم إرسال محاضرة من ${category} إلى ${groupId}`);
    } catch (error) {
        console.error(`❌ خطأ في إرسال المحاضرة:`, error.message);
    }
}

/**
 * إيقاف جميع الجداول
 */
function stopIslamicSchedule() {
    Object.values(scheduledJobs).forEach(job => job.stop());
    scheduledJobs = {};
    console.log('⏹️ تم إيقاف جميع الجداول');
}

/**
 * معالجة الأوامر الإسلامية
 */
async function handleIslamicCommand(sock, msg, command, args) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    
    // أمر القائمة الإسلامية
    if (command === 'اسلامي' || command === 'islamic') {
        await showMenu(sock, from, 'main', sender);
        return true;
    }
    
    // أمر حالة الأقسام
    if (command === 'حالة_الاقسام' || command === 'status') {
        await showCategoriesStatus(sock, from);
        return true;
    }
    
    // أمر الإدارة (محمي للمالك فقط)
    if (command === 'ادارة' || command === 'admin') {
        const ownerNumber = process.env.OWNER_NUMBER + '@s.whatsapp.net';
        
        if (sender !== ownerNumber) {
            await sock.sendMessage(from, {
                text: '❌ هذا الأمر متاح فقط لمالك البوت'
            });
            return true;
        }
        
        await showAdminMenu(sock, from, sender);
        return true;
    }
    
    return false;
}

/**
 * عرض القائمة باستخدام List Messages
 */
async function showMenu(sock, chatId, menuKey, userId) {
    const menu = MENU_STRUCTURE[menuKey];
    if (!menu) return;
    
    // حفظ حالة المستخدم
    userSessions[userId] = { currentMenu: menuKey };
    
    // إنشاء الصفوف للقائمة
    const sections = [{
        title: menu.title,
        rows: menu.options.map((option, index) => ({
            title: option,
            rowId: `menu_${menuKey}_${index}`,
            description: ''
        }))
    }];
    
    // إضافة خيار "رجوع" إذا لم تكن القائمة الرئيسية
    if (menu.backTo) {
        sections.push({
            title: '🔙 التنقل',
            rows: [{
                title: 'رجوع',
                rowId: `back_${menu.backTo}`,
                description: 'العودة للقائمة السابقة'
            }]
        });
    }
    
    const listMessage = {
        text: menu.title + '\n\nاختر من القائمة:',
        footer: CONFIG.botName || 'Islamic Bot',
        title: menu.title,
        buttonText: "📋 القائمة",
        sections
    };
    
    await sock.sendMessage(chatId, listMessage);
}

/**
 * معالجة رسائل القائمة (List Messages)
 */
async function handleListResponse(sock, msg) {
    try {
        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        
        const listResponse = msg.message?.listResponseMessage;
        if (!listResponse) return false;
        
        const selectedRowId = listResponse.singleSelectReply?.selectedRowId;
        if (!selectedRowId) return false;
        
        // معالجة خيارات الإدارة
        if (selectedRowId.startsWith('admin_')) {
            const session = userSessions[sender];
            if (!session || session.currentMenu !== 'admin') return false;
            
            switch (selectedRowId) {
                case 'admin_add_lecture':
                    await startAddLecture(sock, from, sender);
                    break;
                    
                case 'admin_edit_time':
                    await showTimeEditMenu(sock, from, sender);
                    break;
                    
                case 'admin_edit_text':
                    await sock.sendMessage(from, {
                        text: '⚠️ هذه الميزة قيد التطوير'
                    });
                    break;
            }
            
            return true;
        }
        
        // معالجة اختيار قسم لإضافة محاضرة
        if (selectedRowId.startsWith('category_add_')) {
            const session = userSessions[sender];
            if (!session || session.adminAction !== 'add_lecture') return false;
            
            const category = selectedRowId.replace('category_add_', '');
            session.lectureData = { category };
            session.step = 'enter_title';
            
            await sock.sendMessage(from, {
                text: '📝 أرسل عنوان المحاضرة'
            });
            
            return true;
        }
        
        // معالجة اختيار قسم لتعديل الوقت
        if (selectedRowId.startsWith('category_time_')) {
            const session = userSessions[sender];
            if (!session || session.adminAction !== 'edit_time') return false;
            
            const category = selectedRowId.replace('category_time_', '');
            session.selectedCategory = category;
            session.step = 'enter_cron';
            
            await sock.sendMessage(from, {
                text: `⏰ أرسل وقت النشر بصيغة Cron\n\n📌 أمثلة:\n0 9 * * * - كل يوم 9 صباحاً\n0 */6 * * * - كل 6 ساعات\n0 12 * * 5 - كل جمعة 12 ظهراً`
            });
            
            return true;
        }
        
        // التحقق من وجود جلسة للمستخدم
        if (!userSessions[sender]) {
            // قد تكون جلسة قديمة، نبدأ من القائمة الرئيسية
            await showMenu(sock, from, 'main', sender);
            return true;
        }
        
        const session = userSessions[sender];
        
        // معالجة زر الرجوع
        if (selectedRowId.startsWith('back_')) {
            const backTo = selectedRowId.replace('back_', '');
            await showMenu(sock, from, backTo, sender);
            return true;
        }
        
        // معالجة اختيار من القائمة
        if (selectedRowId.startsWith('menu_')) {
            const parts = selectedRowId.split('_');
            const menuKey = parts[1];
            const optionIndex = parseInt(parts[2]);
            
            const currentMenu = MENU_STRUCTURE[menuKey];
            if (!currentMenu) return false;
            
            const selectedOption = currentMenu.options[optionIndex];
            if (!selectedOption) return false;
            
            // التحقق من كون الخيار قسماً نهائياً
            if (FINAL_CATEGORIES.includes(selectedOption)) {
                await toggleCategory(sock, from, selectedOption, sender);
                return true;
            } else {
                // الانتقال إلى قائمة فرعية
                await showMenu(sock, from, selectedOption, sender);
                return true;
            }
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ خطأ في معالجة القائمة:', error.message);
        return false;
    }
}

/**
 * تفعيل/إلغاء تفعيل قسم (Toggle)
 */
async function toggleCategory(sock, chatId, category, userId) {
    try {
        const schedules = await db.getAllSchedules();
        const schedule = schedules.find(s => s.category === category);
        
        // Toggle: إذا مفعل يصير معطل، وإذا معطل يصير مفعل
        const currentStatus = schedule ? schedule.enabled : false;
        const newStatus = !currentStatus;
        
        await db.toggleSchedule(category, newStatus);
        
        const statusEmoji = newStatus ? '✅' : '❌';
        const statusText = newStatus ? 'مُفعّل' : 'مُعطّل';
        const actionText = newStatus ? 'تم تفعيل' : 'تم إلغاء تفعيل';
        
        await sock.sendMessage(chatId, {
            text: `${statusEmoji} *${actionText}*\n\n📂 القسم: *${category}*\n📊 الحالة: ${statusText}\n\n💡 يمكنك إعادة الاختيار لتغيير الحالة`
        });
        
        // إعادة تحميل الجداول
        if (newStatus && schedule && schedule.groupId) {
            createScheduleJob(sock, { ...schedule, enabled: true });
        } else {
            const jobKey = `${category}_${schedule?.groupId || ''}`;
            if (scheduledJobs[jobKey]) {
                scheduledJobs[jobKey].stop();
                delete scheduledJobs[jobKey];
            }
        }
        
    } catch (error) {
        console.error('❌ خطأ في تفعيل/إلغاء القسم:', error.message);
        await sock.sendMessage(chatId, {
            text: '❌ حدث خطأ في تحديث حالة القسم'
        });
    }
}

/**
 * عرض حالة جميع الأقسام
 */
async function showCategoriesStatus(sock, chatId) {
    try {
        const schedules = await db.getAllSchedules();
        
        let statusMessage = '📊 *حالة الأقسام الإسلامية*\n\n';
        
        for (const category of FINAL_CATEGORIES) {
            const schedule = schedules.find(s => s.category === category);
            const enabled = schedule ? schedule.enabled : false;
            const statusEmoji = enabled ? '✅' : '❌';
            
            statusMessage += `${statusEmoji} ${category}\n`;
        }
        
        statusMessage += '\n💡 استخدم /اسلامي لتفعيل/إلغاء الأقسام';
        
        await sock.sendMessage(chatId, {
            text: statusMessage
        });
        
    } catch (error) {
        console.error('❌ خطأ في عرض الحالة:', error.message);
    }
}

/**
 * عرض قائمة الإدارة
 */
async function showAdminMenu(sock, chatId, userId) {
    userSessions[userId] = { 
        currentMenu: 'admin',
        adminAction: null 
    };
    
    const listMessage = {
        text: '⚙️ *لوحة الإدارة*\n\nاختر العملية المطلوبة:',
        footer: CONFIG.botName || 'Islamic Bot',
        title: 'لوحة الإدارة',
        buttonText: "⚙️ الإدارة",
        sections: [{
            title: 'العمليات المتاحة',
            rows: [
                {
                    title: '➕ إضافة محاضرة',
                    rowId: 'admin_add_lecture',
                    description: 'إضافة محاضرة جديدة للقسم'
                },
                {
                    title: '⏰ تعديل الأوقات',
                    rowId: 'admin_edit_time',
                    description: 'تعديل أوقات النشر للأقسام'
                },
                {
                    title: '✏️ تعديل النصوص',
                    rowId: 'admin_edit_text',
                    description: 'تعديل نصوص الأذكار (قريباً)'
                }
            ]
        }]
    };
    
    await sock.sendMessage(chatId, listMessage);
}

/**
 * بدء عملية إضافة محاضرة
 */
async function startAddLecture(sock, chatId, userId) {
    userSessions[userId] = {
        currentMenu: 'admin',
        adminAction: 'add_lecture',
        step: 'select_category',
        lectureData: {}
    };
    
    const listMessage = {
        text: '📂 *اختر القسم لإضافة محاضرة جديدة*',
        footer: CONFIG.botName || 'Islamic Bot',
        title: 'اختيار القسم',
        buttonText: "📂 الأقسام",
        sections: [{
            title: 'الأقسام المتاحة',
            rows: FINAL_CATEGORIES.map((category) => ({
                title: category,
                rowId: `category_add_${category}`,
                description: `إضافة محاضرة في ${category}`
            }))
        }]
    };
    
    await sock.sendMessage(chatId, listMessage);
}

/**
 * معالجة خطوات إضافة محاضرة
 */
async function handleAddLectureSteps(sock, msg) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const session = userSessions[sender];
    
    if (!session || session.adminAction !== 'add_lecture') return;
    
    const messageText = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text || '';
    
    switch (session.step) {
        case 'enter_title':
            session.lectureData.title = messageText;
            session.step = 'enter_url';
            await sock.sendMessage(from, {
                text: '🔗 أرسل رابط صفحة المحاضرة'
            });
            break;
            
        case 'enter_url':
            session.lectureData.pageUrl = messageText;
            session.step = 'confirm';
            
            const confirmText = `✅ تأكيد البيانات:\n\n` +
                `📂 القسم: ${session.lectureData.category}\n` +
                `📝 العنوان: ${session.lectureData.title}\n` +
                `🔗 الرابط: ${session.lectureData.pageUrl}\n\n` +
                `أرسل "نعم" للتأكيد أو "لا" للإلغاء`;
            
            await sock.sendMessage(from, { text: confirmText });
            break;
            
        case 'confirm':
            if (messageText.includes('نعم') || messageText.includes('yes')) {
                try {
                    await db.addLecture(session.lectureData);
                    await sock.sendMessage(from, {
                        text: '✅ تم إضافة المحاضرة بنجاح!'
                    });
                } catch (error) {
                    await sock.sendMessage(from, {
                        text: '❌ حدث خطأ في إضافة المحاضرة'
                    });
                }
            } else {
                await sock.sendMessage(from, {
                    text: '❌ تم إلغاء العملية'
                });
            }
            delete userSessions[sender];
            break;
    }
}

/**
 * عرض قائمة تعديل الأوقات
 */
async function showTimeEditMenu(sock, chatId, userId) {
    userSessions[userId] = {
        currentMenu: 'admin',
        adminAction: 'edit_time',
        step: 'select_category'
    };
    
    const listMessage = {
        text: '⏰ *اختر القسم لتعديل وقت النشر*',
        footer: CONFIG.botName || 'Islamic Bot',
        title: 'تعديل الأوقات',
        buttonText: "⏰ الأقسام",
        sections: [{
            title: 'الأقسام المتاحة',
            rows: FINAL_CATEGORIES.map((category) => ({
                title: category,
                rowId: `category_time_${category}`,
                description: `تعديل وقت ${category}`
            }))
        }]
    };
    
    await sock.sendMessage(chatId, listMessage);
}

/**
 * معالجة تعديل الأوقات
 */
async function handleTimeEditSteps(sock, msg) {
    const from = msg.key.remoteJid;
    const sender = msg.key.participant || msg.key.remoteJid;
    const session = userSessions[sender];
    
    if (!session || session.adminAction !== 'edit_time') return;
    
    const messageText = msg.message?.conversation || 
                       msg.message?.extendedTextMessage?.text || '';
    
    if (session.step === 'enter_cron') {
        try {
            await db.updateScheduleTime(session.selectedCategory, messageText);
            await sock.sendMessage(from, {
                text: `✅ تم تحديث وقت ${session.selectedCategory} إلى: ${messageText}`
            });
            
            // إعادة تحميل الجدولة
            await startIslamicSchedule(sock);
            
        } catch (error) {
            await sock.sendMessage(from, {
                text: '❌ حدث خطأ في تحديث الوقت'
            });
        }
        delete userSessions[sender];
    }
}

/**
 * معالجة الرسائل العامة
 */
async function handleMessage(sock, msg) {
    const sender = msg.key.participant || msg.key.remoteJid;
    const session = userSessions[sender];
    
    // معالجة List responses
    if (msg.message?.listResponseMessage) {
        return await handleListResponse(sock, msg);
    }
    
    if (!session) return false;
    
    // معالجة خطوات إضافة محاضرة
    if (session.adminAction === 'add_lecture') {
        await handleAddLectureSteps(sock, msg);
        return true;
    }
    
    // معالجة تعديل الأوقات
    if (session.adminAction === 'edit_time') {
        await handleTimeEditSteps(sock, msg);
        return true;
    }
    
    return false;
}

module.exports = {
    handleIslamicCommand,
    handleMessage,
    startIslamicSchedule,
    stopIslamicSchedule,
    isEnabled: () => ISLAMIC_MODULE_ENABLED
};

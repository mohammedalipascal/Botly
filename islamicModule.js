const cron = require('node-cron');
const db = require('./googleSheetsDB');
const { fetchLectureContent, formatLecture } = require('./lectureHandler');

// ⭐ المالك - رقمك مباشرة
const OWNER_NUMBER = '249962204268';

let ISLAMIC_MODULE_ENABLED = true;
let scheduledJobs = {};
let userSessions = {};

// التحقق من المالك
function isOwner(sender) {
    if (!sender) return false;
    const num = sender.replace('@s.whatsapp.net', '').replace('@c.us', '');
    return num === OWNER_NUMBER;
}

// ═══════════════════════════════════════════════════════
// الأقسام الجديدة - بالضبط كما طلبت
// ═══════════════════════════════════════════════════════

const CATEGORIES = {
    // القائمة الرئيسية
    'main': ['الفقه', 'الموضوعية'],
    
    // الفقه
    'الفقه': ['العبادات', 'المعاملات', 'فقه الأسرة', 'العادات'],
    
    // العبادات
    'العبادات': ['الصلاة', 'الجنائز', 'الزكاة', 'الصيام', 'الحج والعمرة', 'الطهارة', 'الجهاد والسير'],
    
    // الصلاة
    'الصلاة': [
        'حكم الصلاة وأهميتها', 'الركوع والسجود', 'وقت الصلاة',
        'الطهارة لصحة الصلاة', 'ستر العورة للمصلي', 'استقبال القبلة',
        'القيام في الصلاة', 'التكبير والاستفتاح', 'سجود التلاوة والشكر',
        'الأذان والإقامة', 'التشهد والتسليم', 'سنن الصلاة',
        'مكروهات الصلاة', 'مبطلات الصلاة', 'قضاء الفوائت',
        'سجود السهو', 'القراءة في الصلاة', 'صلاة التطوع',
        'صلاة الاستسقاء', 'المساجد ومواضع السجود', 'صلاة المريض',
        'صلاة الخوف', 'أحكام الجمع', 'صلاة الجمعة',
        'صلاة العيدين', 'صلاة الخسوف', 'أوقات النهي',
        'صلاة الجماعة', 'مسائل متفرقة في الصلاة', 'الطمأنينة والخشوع',
        'سترة المصلي', 'النية في الصلاة', 'القنوت في الصلاة',
        'اللفظ والحركة في الصلاة', 'الوتر وقيام الليل'
    ],
    
    // الجنائز
    'الجنائز': [
        'غسل الميت وتجهيزه', 'الصلاة على الميت', 'حمل الميت ودفنه',
        'زيارة القبور', 'إهداء القرب للميت', 'حرمة الأموات',
        'أحكام التعزية', 'مسائل متفرقة في الجنائز', 'الاحتضار وتلقين الميت',
        'أحكام المقابر', 'النياحة على الميت'
    ],
    
    // الزكاة
    'الزكاة': [
        'وجوب الزكاة وأهميتها', 'زكاة بهيمة الأنعام', 'زكاة الحبوب والثمار',
        'زكاة النقدين', 'زكاة عروض التجارة', 'زكاة الفطر',
        'إخراج الزكاة وأهلها', 'صدقة التطوع', 'مسائل متفرقة في الزكاة'
    ],
    
    // الصيام
    'الصيام': [
        'فضائل رمضان', 'ما لا يفسد الصيام', 'رؤيا الهلال',
        'من يجب عليه الصوم', 'الأعذار المبيحة للفطر', 'النية في الصيام',
        'مفسدات الصيام', 'الجماع في نهار رمضان', 'مستحبات الصيام',
        'قضاء الصيام', 'صيام التطوع', 'الاعتكاف وليلة القدر',
        'مسائل متفرقة في الصيام'
    ],
    
    // الحج والعمرة
    'الحج والعمرة': [
        'فضائل الحج والعمرة', 'حكم الحج والعمرة', 'شروط الحج',
        'الإحرام', 'محظورات الإحرام', 'الفدية وجزاء الصيد',
        'صيد الحرم', 'النيابة في الحج', 'المبيت بمنى',
        'الوقوف بعرفة', 'المبيت بمزدلفة', 'الطواف بالبيت',
        'السعي', 'رمي الجمار', 'الإحصار',
        'الهدي والأضاحي', 'مسائل متفرقة في الحج والعمرة', 'المواقيت', 'التحلل'
    ],
    
    // الطهارة
    'الطهارة': [
        'المياه', 'الآنية', 'قضاء الحاجة', 'سنن الفطرة',
        'فروض الوضوء وصفته', 'نواقض الوضوء', 'ما يشرع له الوضوء',
        'المسح على الخفين', 'الغسل', 'التيمم',
        'النجاسات وإزالتها', 'الحيض والنفاس', 'مس المصحف'
    ],
    
    // الجهاد والسير
    'الجهاد والسير': ['أحكام الجهاد'],
    
    // المعاملات
    'المعاملات': [
        'الربا والصرف', 'العارية', 'السبق والمسابقات',
        'السلف والقرض', 'الرهن', 'الإفلاس والحجر',
        'الصلح', 'الحوالة', 'الضمان والكفالة',
        'الشركة', 'الوكالة', 'البيوع',
        'الشفعة', 'الغصب', 'المساقاة والمزارعة',
        'الإجارة', 'إحياء الموات', 'الوقف',
        'الهبة والعطية', 'اللقطة واللقيط', 'الوصايا',
        'الفرائض', 'الوديعة', 'الكسب المحرم'
    ],
    
    // فقه الأسرة
    'فقه الأسرة': [
        'الزواج وأحكامه', 'النظر والخلوة والاختلاط', 'الخلع',
        'الطلاق', 'الرجعة', 'الإيلاء',
        'الظهار', 'اللعان', 'العِدَد',
        'الرضاع', 'النفقات', 'الحضانة'
    ],
    
    // العادات
    'العادات': ['عادات وتقاليد'],
    
    // الموضوعية
    'الموضوعية': [
        'القرآن وعلومه', 'العقيدة', 'الحديث وعلومه',
        'التفسير', 'الدعوة والدعاة', 'الفرق والمذاهب',
        'البدع والمحدثات', 'أصول الفقه', 'العالم والمتعلم',
        'الآداب والأخلاق', 'الفضائل', 'الرقائق',
        'الأدعية والأذكار', 'التاريخ والسيرة', 'قضايا معاصرة',
        'قضايا المرأة', 'اللغة العربية', 'نصائح وتوجيهات',
        'تربية الأولاد', 'الشعر والأغاني', 'أحكام الموظفين',
        'أحكام الحيوان', 'بر الوالدين', 'المشكلات الزوجية',
        'قضايا الشباب', 'نوازل معاصرة', 'الرؤى والمنامات',
        'ردود وتعقيبات', 'الهجرة والابتعاث', 'الوسواس بأنواعه'
    ]
};

// الأقسام النهائية (التي يمكن تفعيلها)
const FINAL_CATEGORIES = [];
Object.keys(CATEGORIES).forEach(key => {
    if (!['main', 'الفقه', 'العبادات', 'الموضوعية'].includes(key)) {
        CATEGORIES[key].forEach(cat => {
            if (!FINAL_CATEGORIES.includes(cat)) {
                FINAL_CATEGORIES.push(cat);
            }
        });
    }
});

async function startIslamicSchedule(sock) {
    console.log('🕌 بدء الجدولة...');
    
    try {
        const initialized = await db.initialize();
        if (!initialized) {
            console.log('⚠️ فشل الاتصال بـ Google Sheets');
            return;
        }

        const schedules = await db.getAllSchedules();
        
        for (const schedule of schedules) {
            if (schedule.enabled && schedule.groupId) {
                createScheduleJob(sock, schedule);
            }
        }
        
        console.log(`✅ ${Object.keys(scheduledJobs).length} قسم مجدول`);
    } catch (error) {
        console.error('❌ خطأ:', error.message);
    }
}

function createScheduleJob(sock, schedule) {
    const jobKey = `${schedule.category}_${schedule.groupId}`;
    
    if (scheduledJobs[jobKey]) {
        scheduledJobs[jobKey].stop();
    }
    
    scheduledJobs[jobKey] = cron.schedule(schedule.cronTime, async () => {
        await sendScheduledLecture(sock, schedule.category, schedule.groupId);
    });
}

async function sendScheduledLecture(sock, category, groupId) {
    try {
        const nextLecture = await db.getNextLecture(category);
        if (!nextLecture) return;
        
        const content = await fetchLectureContent(nextLecture.pageUrl);
        const message = formatLecture(content);
        
        await sock.sendMessage(groupId, { text: message });
        await db.updateProgress(category, nextLecture.id);
        
        console.log(`✅ ${category}`);
    } catch (error) {
        console.error(`❌ خطأ:`, error.message);
    }
}

function stopIslamicSchedule() {
    Object.values(scheduledJobs).forEach(job => job.stop());
    scheduledJobs = {};
}

async function handleIslamicCommand(sock, msg, command, sender) {
    const from = msg.key.remoteJid;
    const msgSender = msg.key.participant || msg.key.remoteJid;
    
    // ⭐ فقط المالك
    if (!isOwner(msgSender)) {
        return false;
    }
    
    if (command === '/اسلامي' || command === 'اسلامي') {
        await showPoll(sock, from, 'main', msgSender);
        return true;
    }
    
    if (command === '/حالة_الاقسام' || command === 'حالة_الاقسام') {
        await showStatus(sock, from);
        return true;
    }
    
    if (command === '/ادارة' || command === 'ادارة') {
        await showAdminPoll(sock, from, msgSender);
        return true;
    }
    
    return false;
}

// ⭐⭐⭐ عرض Poll البسيط - مثل الكود القديم ⭐⭐⭐
async function showPoll(sock, chatId, category, userId) {
    const options = CATEGORIES[category];
    if (!options) return;
    
    userSessions[userId] = { currentCategory: category };
    
    // Poll بسيط - pollName و options فقط
    await sock.sendMessage(chatId, {
        poll: {
            name: category === 'main' ? '🕌 القائمة الرئيسية' : category,
            values: options,
            selectableCount: 1
        }
    });
}

async function handlePollResponse(sock, msg) {
    try {
        const from = msg.key.remoteJid;
        const sender = msg.key.participant || msg.key.remoteJid;
        
        if (!isOwner(sender)) return false;
        
        const session = userSessions[sender];
        if (!session) return false;
        
        const pollUpdate = msg.message?.pollUpdateMessage;
        if (!pollUpdate || !pollUpdate.vote) return false;
        
        const selectedIndex = pollUpdate.vote.selectedOptions[0];
        const currentOptions = CATEGORIES[session.currentCategory];
        const selected = currentOptions[selectedIndex];
        
        // إذا قسم نهائي → Toggle
        if (FINAL_CATEGORIES.includes(selected)) {
            await toggleCategory(sock, from, selected);
            return true;
        }
        
        // إذا قائمة فرعية → عرضها
        if (CATEGORIES[selected]) {
            await showPoll(sock, from, selected, sender);
            return true;
        }
        
        return false;
    } catch (error) {
        console.error('❌ Poll:', error.message);
        return false;
    }
}

async function toggleCategory(sock, chatId, category) {
    try {
        const schedules = await db.getAllSchedules();
        const schedule = schedules.find(s => s.category === category);
        
        const currentStatus = schedule ? schedule.enabled : false;
        const newStatus = !currentStatus;
        
        await db.toggleSchedule(category, newStatus);
        
        const emoji = newStatus ? '✅' : '❌';
        const text = newStatus ? 'مُفعّل' : 'مُعطّل';
        
        await sock.sendMessage(chatId, {
            text: `${emoji} ${category}\n📊 ${text}`
        });
        
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
        console.error('❌ Toggle:', error.message);
    }
}

async function showStatus(sock, chatId) {
    try {
        const schedules = await db.getAllSchedules();
        
        let msg = '📊 *حالة الأقسام*\n\n';
        
        for (const cat of FINAL_CATEGORIES.slice(0, 50)) {
            const schedule = schedules.find(s => s.category === cat);
            const enabled = schedule ? schedule.enabled : false;
            const emoji = enabled ? '✅' : '❌';
            msg += `${emoji} ${cat}\n`;
        }
        
        if (FINAL_CATEGORIES.length > 50) {
            msg += `\n... +${FINAL_CATEGORIES.length - 50}`;
        }
        
        msg += '\n\n💡 /اسلامي';
        
        await sock.sendMessage(chatId, { text: msg });
    } catch (error) {
        console.error('❌ الحالة:', error.message);
    }
}

async function showAdminPoll(sock, chatId, userId) {
    userSessions[userId] = { currentCategory: 'admin' };
    
    await sock.sendMessage(chatId, {
        poll: {
            name: '⚙️ لوحة الإدارة',
            values: ['➕ إضافة محاضرة', '⏰ تعديل الأوقات'],
            selectableCount: 1
        }
    });
}

async function handleMessage(sock, msg) {
    const sender = msg.key.participant || msg.key.remoteJid;
    
    if (!isOwner(sender)) return false;
    
    if (msg.message?.pollUpdateMessage) {
        return await handlePollResponse(sock, msg);
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
ش

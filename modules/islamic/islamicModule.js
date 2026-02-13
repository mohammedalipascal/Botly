const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { fetchRandomFatwa, formatFatwaMessage } = require('./fatwaModule');
const { fetchLectureContent, formatLecture } = require('./lectureHandler');
const db = require('../../database/googleSheets');

// القسم الاسلامي مع Google Sheets

let ISLAMIC_MODULE_ENABLED = false;
const ISLAMIC_STATE_FILE = path.join(__dirname, '../../islamic_state.json');

let morningJob1 = null, morningJob2 = null, eveningJob1 = null, eveningJob2 = null;
let fatwaJob = null;
const activeLectureJobs = new Map();

// تتبع موقع كل مستخدم في التنقل
const userNavigation = new Map();
const NAV_TIMEOUT = 30 * 60 * 1000; // 30 دقيقة

const MORNING_EVENING_ATHKAR = [
    { text: `أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ\n\nرَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ\n\nرَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ` },
    { text: `اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ` },
    { text: `اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ` },
    { text: `بِسْمِ اللهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ`, repeat: 3 },
    { text: `رَضِيتُ بِاللهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ صَلَّى اللهُ عَلَيْهِ وَسَلَّمَ نَبِيًّا`, repeat: 3 }
];

let currentThikrIndex = 0;

// دوال التحميل والحفظ
function loadIslamicState() {
    try {
        if (fs.existsSync(ISLAMIC_STATE_FILE)) {
            const state = JSON.parse(fs.readFileSync(ISLAMIC_STATE_FILE, 'utf-8'));
            ISLAMIC_MODULE_ENABLED = state.enabled || false;
            currentThikrIndex = state.currentThikrIndex || 0;
        }
    } catch (error) {
        console.error('خطأ في قراءة حالة القسم الاسلامي:', error.message);
    }
}

function saveIslamicState() {
    try {
        fs.writeFileSync(ISLAMIC_STATE_FILE, JSON.stringify({ 
            enabled: ISLAMIC_MODULE_ENABLED, 
            currentThikrIndex 
        }), 'utf-8');
    } catch (error) {
        console.error('خطأ في حفظ حالة القسم الاسلامي:', error.message);
    }
}

loadIslamicState();

// تنظيف Navigation Map
function cleanupNavigationMap() {
    const now = Date.now();
    for (const [sender, data] of userNavigation.entries()) {
        if (now - data.timestamp > NAV_TIMEOUT) {
            userNavigation.delete(sender);
        }
    }
}

setInterval(cleanupNavigationMap, 5 * 60 * 1000);

// نظام الـ Poll + أرقام
async function sendPollMenu(sock, sender, level, path = []) {
    try {
        let pollName = '';
        let options = [];
        
        if (level === 'main') {
            pollName = 'القسم الاسلامي - اختر';
            options = ['1️⃣ الأذكار', '2️⃣ الفتاوى', '3️⃣ الفقه', '4️⃣ الموضوعية'];
        }
        else if (level === 'fiqh_main') {
            pollName = 'الفقه - اختر القسم';
            options = ['1️⃣ العبادات', '2️⃣ المعاملات', '3️⃣ فقه الأسرة', '4️⃣ العادات'];
        }
        else if (level === 'fiqh_ibadat') {
            pollName = 'العبادات - اختر الموضوع';
            options = [
                '1️⃣ الصلاة',
                '2️⃣ الجنائز',
                '3️⃣ الزكاة',
                '4️⃣ الصيام',
                '5️⃣ الحج والعمرة',
                '6️⃣ الطهارة',
                '7️⃣ الجهاد والسير'
            ];
        }
        else if (level === 'fiqh_ibadat_salah') {
            pollName = 'الصلاة - اختر الموضوع';
            options = [
                '1️⃣ حكم الصلاة وأهميتها',
                '2️⃣ الركوع والسجود',
                '3️⃣ وقت الصلاة',
                '4️⃣ الطهارة لصحة الصلاة',
                '5️⃣ ستر العورة',
                '6️⃣ استقبال القبلة',
                '7️⃣ القيام في الصلاة',
                '8️⃣ التكبير والاستفتاح',
                '9️⃣ سجود التلاوة',
                '🔟 الأذان والإقامة'
            ];
        }
        else if (level === 'mawdooiya_main') {
            pollName = 'الموضوعية - اختر الموضوع';
            options = [
                '1️⃣ القرآن وعلومه',
                '2️⃣ العقيدة',
                '3️⃣ الحديث وعلومه',
                '4️⃣ التفسير',
                '5️⃣ الدعوة والدعاة',
                '6️⃣ الفرق والمذاهب',
                '7️⃣ البدع والمحدثات',
                '8️⃣ أصول الفقه',
                '9️⃣ العالم والمتعلم',
                '🔟 الآداب والأخلاق'
            ];
        }
        
        if (options.length > 0) {
            // إرسال Poll فقط (بدون نص)
            await sock.sendMessage(sender, {
                poll: {
                    name: pollName,
                    values: options,
                    selectableCount: 1
                }
            });
            
            userNavigation.set(sender, { level, path, timestamp: Date.now() });
            console.log(`✅ تم إرسال Poll: ${pollName}`);
        }
        
    } catch (error) {
        console.error('❌ خطأ في إرسال Poll:', error.message);
    }
}

// معالجة الاختيار بالأرقام
async function handleNumberChoice(sock, sender, choice) {
    const userNav = userNavigation.get(sender);
    
    if (!userNav) {
        await sock.sendMessage(sender, { 
            text: 'انتهت الجلسة. اكتب /اسلام للبدء من جديد' 
        });
        return true;
    }
    
    const { level, path } = userNav;
    
    // المستوى الرئيسي
    if (level === 'main') {
        if (choice === 1) {
            return await toggleAthkar(sock, sender);
        }
        else if (choice === 2) {
            return await toggleFatawa(sock, sender);
        }
        else if (choice === 3) {
            await sendPollMenu(sock, sender, 'fiqh_main', ['fiqh']);
            return true;
        }
        else if (choice === 4) {
            await sendPollMenu(sock, sender, 'mawdooiya_main', ['mawdooiya']);
            return true;
        }
    }
    
    // أقسام الفقه
    else if (level === 'fiqh_main') {
        if (choice === 1) {
            await sendPollMenu(sock, sender, 'fiqh_ibadat', ['fiqh', 'ibadat']);
            return true;
        }
        else if (choice === 2) {
            await sock.sendMessage(sender, {
                text: 'قسم المعاملات قيد التطوير'
            });
            return true;
        }
        else if (choice === 3) {
            await sock.sendMessage(sender, {
                text: 'قسم فقه الأسرة قيد التطوير'
            });
            return true;
        }
        else if (choice === 4) {
            await sock.sendMessage(sender, {
                text: 'قسم العادات قيد التطوير'
            });
            return true;
        }
    }
    
    // العبادات
    else if (level === 'fiqh_ibadat') {
        if (choice === 1) {
            await sendPollMenu(sock, sender, 'fiqh_ibadat_salah', ['fiqh', 'ibadat', 'salah']);
            return true;
        }
        else {
            await sock.sendMessage(sender, {
                text: 'هذا القسم قيد التطوير'
            });
            return true;
        }
    }
    
    // الصلاة - الوصول للمحاضرات
    else if (level === 'fiqh_ibadat_salah') {
        const categories = [
            'hukmSalah', 'rukoo', 'waqt', 'taharah', 'satr', 
            'qiblah', 'qiyam', 'takbeer', 'sujoodTilawa', 'adhan'
        ];
        const categoryNames = [
            'حكم الصلاة وأهميتها', 'الركوع والسجود', 'وقت الصلاة', 
            'الطهارة لصحة الصلاة', 'ستر العورة للمصلي', 'استقبال القبلة',
            'القيام في الصلاة', 'التكبير والاستفتاح', 'سجود التلاوة والشكر', 'الأذان والإقامة'
        ];
        
        if (choice >= 1 && choice <= categories.length) {
            const categoryKey = categories[choice - 1];
            const categoryName = categoryNames[choice - 1];
            
            return await toggleLectureCategory(
                sock, 
                sender, 
                ['fiqh', 'ibadat', 'salah', categoryKey],
                categoryName
            );
        }
    }
    
    // الموضوعية
    else if (level === 'mawdooiya_main') {
        await sock.sendMessage(sender, {
            text: 'أقسام الموضوعية قيد التطوير'
        });
        return true;
    }
    
    return false;
}

// دوال Toggle
async function toggleAthkar(sock, sender) {
    // جلب الإعدادات من Google Sheets
    const settings = await db.getScheduleSettings();
    const athkarEnabled = settings.athkar_morning?.enabled && settings.athkar_evening?.enabled;
    
    // Toggle
    await db.updateScheduleTime('athkar_morning', settings.athkar_morning?.time || '50 6 * * *');
    await db.updateScheduleTime('athkar_evening', settings.athkar_evening?.time || '50 15 * * *');
    
    if (!athkarEnabled) {
        startAthkarSchedule(sock);
        await sock.sendMessage(sender, {
            text: '*تم تفعيل قسم الأذكار*\n\nالصباح: 6:50 و 7:00\nالمساء: 3:50 و 4:00\n\nسيتم الإرسال في المجموعة المحددة'
        });
        console.log('تم تفعيل الأذكار');
    } else {
        stopAthkarSchedule();
        await sock.sendMessage(sender, {
            text: '*تم تعطيل قسم الأذكار*'
        });
        console.log('تم تعطيل الأذكار');
    }
    
    userNavigation.delete(sender);
    return true;
}

async function toggleFatawa(sock, sender) {
    const settings = await db.getScheduleSettings();
    const fatawaEnabled = settings.fatawa?.enabled;
    
    if (!fatawaEnabled) {
        startFatawaSchedule(sock);
        await sock.sendMessage(sender, {
            text: '*تم تفعيل قسم الفتاوى*\n\nيومياً: 12:00 ظهراً\n\nسيتم الإرسال في المجموعة المحددة'
        });
        console.log('تم تفعيل الفتاوى');
    } else {
        stopFatawaSchedule();
        await sock.sendMessage(sender, {
            text: '*تم تعطيل قسم الفتاوى*'
        });
        console.log('تم تعطيل الفتاوى');
    }
    
    userNavigation.delete(sender);
    return true;
}

async function toggleLectureCategory(sock, sender, pathArray, displayName) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        
        // جلب المحاضرات من Google Sheets
        const lectures = await db.getLectures(pathArray);
        
        if (!lectures || lectures.length === 0) {
            await sock.sendMessage(sender, {
                text: `*${displayName}*\n\nلا توجد محاضرات متاحة حالياً\n\nاستخدم /ادارة لإضافة محاضرات`
            });
            userNavigation.delete(sender);
            return true;
        }
        
        // التحقق من الحالة الحالية
        const isEnabled = lectures[0].enabled;
        
        if (!isEnabled) {
            // تفعيل
            const firstLecture = lectures[0];
            
            await sock.sendMessage(sender, {
                text: `*تم تفعيل قسم:*\n\n${displayName}\n\nجاري إرسال أول محاضرة...`
            });
            
            console.log(`جاري جلب: ${firstLecture.title}`);
            
            try {
                const content = await fetchLectureContent(firstLecture.pageUrl);
                const message = formatLecture(content);
                
                if (targetGroup) {
                    await sock.sendMessage(targetGroup, { text: message });
                    console.log(`تم إرسال: ${firstLecture.title}`);
                    
                    // تحديث المؤشر في Google Sheets
                    await db.updateLastSentIndex(pathArray, firstLecture.id, 1);
                    await db.updateLectureStatus(pathArray, firstLecture.id, true);
                } else {
                    console.error('ISLAMIC_GROUP_ID غير محدد في .env');
                }
                
                // بدء الجدولة
                startLectureSchedule(sock, pathArray, lectures, displayName);
                
            } catch (err) {
                console.error('فشل جلب المحاضرة:', err.message);
                await sock.sendMessage(sender, {
                    text: `فشل جلب المحاضرة: ${firstLecture.title}`
                });
            }
            
        } else {
            // تعطيل
            stopLectureSchedule(pathArray);
            
            // تحديث الحالة في Google Sheets
            for (const lecture of lectures) {
                await db.updateLectureStatus(pathArray, lecture.id, false);
            }
            
            await sock.sendMessage(sender, {
                text: `*تم تعطيل قسم:*\n\n${displayName}`
            });
            
            console.log(`تم تعطيل: ${displayName}`);
        }
        
        userNavigation.delete(sender);
        return true;
        
    } catch (error) {
        console.error('خطأ في toggleLectureCategory:', error.message);
        return false;
    }
}

// الجدولة
async function sendMorningThikr(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        if (!targetGroup) return;
        
        const thikr = MORNING_EVENING_ATHKAR[currentThikrIndex];
        let message = `*ذكر الصباح*\n\n${thikr.text}`;
        if (thikr.repeat) message += `\n\nيُقال ${thikr.repeat} مرة`;
        if (thikr.reward) message += `\n\n${thikr.reward}`;
        
        await sock.sendMessage(targetGroup, { text: message });
        currentThikrIndex = (currentThikrIndex + 1) % MORNING_EVENING_ATHKAR.length;
        saveIslamicState();
        console.log('تم إرسال ذكر الصباح');
    } catch (error) {
        console.error('خطأ في إرسال ذكر الصباح:', error.message);
    }
}

async function sendEveningThikr(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        if (!targetGroup) return;
        
        const thikr = MORNING_EVENING_ATHKAR[currentThikrIndex];
        let message = `*ذكر المساء*\n\n${thikr.text}`;
        if (thikr.repeat) message += `\n\nيُقال ${thikr.repeat} مرة`;
        if (thikr.reward) message += `\n\n${thikr.reward}`;
        
        await sock.sendMessage(targetGroup, { text: message });
        currentThikrIndex = (currentThikrIndex + 1) % MORNING_EVENING_ATHKAR.length;
        saveIslamicState();
        console.log('تم إرسال ذكر المساء');
    } catch (error) {
        console.error('خطأ في إرسال ذكر المساء:', error.message);
    }
}

async function sendFatwa(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        if (!targetGroup) return;
        
        const fatwa = await fetchRandomFatwa();
        await sock.sendMessage(targetGroup, { text: formatFatwaMessage(fatwa) });
        console.log('تم إرسال فتوى');
    } catch (error) {
        console.error('خطأ في إرسال الفتوى:', error.message);
    }
}

async function sendNextLecture(sock, pathArray, lectures, displayName) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        if (!targetGroup) return;
        
        // جلب آخر مؤشر من Google Sheets
        const updatedLectures = await db.getLectures(pathArray);
        const currentLecture = updatedLectures.find(l => l.enabled);
        
        if (!currentLecture) {
            console.log(`القسم ${displayName} معطل - إيقاف الإرسال`);
            return;
        }
        
        const currentIndex = currentLecture.lastSentIndex || 0;
        
        if (currentIndex >= updatedLectures.length) {
            console.log(`تم الانتهاء من جميع محاضرات: ${displayName}`);
            return;
        }
        
        const lecture = updatedLectures[currentIndex];
        
        console.log(`جاري جلب: ${lecture.title} (${currentIndex + 1}/${updatedLectures.length})`);
        
        try {
            const content = await fetchLectureContent(lecture.pageUrl);
            const message = formatLecture(content);
            
            await sock.sendMessage(targetGroup, { text: message });
            console.log(`تم إرسال: ${lecture.title}`);
            
            // تحديث المؤشر في Google Sheets
            await db.updateLastSentIndex(pathArray, lecture.id, currentIndex + 1);
            
        } catch (err) {
            console.error(`فشل جلب المحاضرة: ${lecture.title}`, err.message);
        }
        
    } catch (error) {
        console.error('خطأ في sendNextLecture:', error.message);
    }
}

// Cron Jobs
function startAthkarSchedule(sock) {
    stopAthkarSchedule();
    morningJob1 = cron.schedule('50 6 * * *', () => sendMorningThikr(sock), { timezone: "Africa/Cairo" });
    morningJob2 = cron.schedule('0 7 * * *', () => sendMorningThikr(sock), { timezone: "Africa/Cairo" });
    eveningJob1 = cron.schedule('50 15 * * *', () => sendEveningThikr(sock), { timezone: "Africa/Cairo" });
    eveningJob2 = cron.schedule('0 16 * * *', () => sendEveningThikr(sock), { timezone: "Africa/Cairo" });
    console.log('تم بدء جدولة الأذكار');
}

function stopAthkarSchedule() {
    if (morningJob1) { morningJob1.stop(); morningJob1 = null; }
    if (morningJob2) { morningJob2.stop(); morningJob2 = null; }
    if (eveningJob1) { eveningJob1.stop(); eveningJob1 = null; }
    if (eveningJob2) { eveningJob2.stop(); eveningJob2 = null; }
    console.log('تم إيقاف جدولة الأذكار');
}

function startFatawaSchedule(sock) {
    stopFatawaSchedule();
    fatwaJob = cron.schedule('0 12 * * *', () => sendFatwa(sock), { timezone: "Africa/Cairo" });
    console.log('تم بدء جدولة الفتاوى');
}

function stopFatawaSchedule() {
    if (fatwaJob) { fatwaJob.stop(); fatwaJob = null; }
    console.log('تم إيقاف جدولة الفتاوى');
}

function startLectureSchedule(sock, pathArray, lectures, displayName) {
    const pathKey = pathArray.join('_');
    
    stopLectureSchedule(pathArray);
    
    const job = cron.schedule('0 * * * *', () => {
        sendNextLecture(sock, pathArray, lectures, displayName);
    }, { timezone: "Africa/Cairo" });
    
    activeLectureJobs.set(pathKey, job);
    console.log(`تم بدء جدولة: ${displayName}`);
}

function stopLectureSchedule(pathArray) {
    const pathKey = pathArray.join('_');
    const job = activeLectureJobs.get(pathKey);
    
    if (job) {
        job.stop();
        activeLectureJobs.delete(pathKey);
        console.log(`تم إيقاف جدولة: ${pathKey}`);
    }
}

async function startIslamicSchedule(sock) {
    // تهيئة Google Sheets
    try {
        await db.initialize();
        await db.setupSettingsSheet();
    } catch (error) {
        console.error('فشل تهيئة Google Sheets:', error.message);
        return;
    }
    
    // جلب الإعدادات وبدء الجداول المفعلة
    const settings = await db.getScheduleSettings();
    
    if (settings.athkar_morning?.enabled || settings.athkar_evening?.enabled) {
        startAthkarSchedule(sock);
    }
    
    if (settings.fatawa?.enabled) {
        startFatawaSchedule(sock);
    }
    
    console.log('تم بدء جميع الجداول المفعلة');
}

function stopIslamicSchedule() {
    stopAthkarSchedule();
    stopFatawaSchedule();
    
    for (const job of activeLectureJobs.values()) {
        job.stop();
    }
    activeLectureJobs.clear();
    
    console.log('تم إيقاف جميع الجداول');
}

// معالج الأوامر الرئيسي
async function handleIslamicCommand(sock, msg, messageText, sender) {
    const isAdmin = sender.includes('249962204268') || 
                    sender.includes('231211024814174') ||
                    sender.includes('252355702448348') ||
                    msg.key.fromMe;
    
    if (!isAdmin) return false;
    
    const cmd = messageText.trim();
    
    // القائمة الرئيسية
    if (cmd === '/اسلام') {
        await sendPollMenu(sock, sender, 'main');
        ISLAMIC_MODULE_ENABLED = true;
        saveIslamicState();
        return true;
    }
    
    // معالجة الأرقام
    if (/^[0-9]{1,2}$/.test(cmd)) {
        return await handleNumberChoice(sock, sender, parseInt(cmd));
    }
    
    return false;
}

module.exports = {
    handleIslamicCommand,
    startIslamicSchedule,
    stopIslamicSchedule,
    isEnabled: () => ISLAMIC_MODULE_ENABLED
};

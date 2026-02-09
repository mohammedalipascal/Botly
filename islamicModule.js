const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { fetchRandomFatwa, formatFatwaMessage } = require('./fatwaModule');
const { ISLAMIC_CONTENT } = require('./islamicContent');
const { fetchLectureContent, formatLecture, downloadAudio } = require('./lectureHandler');

// ═══════════════════════════════════════════════════════════
// 🕌 القسم الإسلامي - Poll Navigation System
// ═══════════════════════════════════════════════════════════

let ISLAMIC_MODULE_ENABLED = false;
const ISLAMIC_STATE_FILE = path.join(__dirname, 'islamic_state.json');
const SECTIONS_STATE_FILE = path.join(__dirname, 'sections_state.json');

let morningJob1 = null, morningJob2 = null, eveningJob1 = null, eveningJob2 = null;
let fatwaJob = null, fiqhJob = null, mawdooiyaJob = null;

let sectionsState = {
    athkar: { enabled: false },
    fatawa: { enabled: false },
    fiqh: { enabled: false },
    mawdooiya: { enabled: false }
};

let lectureIndex = { fiqh: 0, mawdooiya: 0 };
const audioRequests = new Map();

// تتبع موقع كل مستخدم في التنقل
const userNavigation = new Map();

const MORNING_EVENING_ATHKAR = [
    { text: `أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ\n\nرَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ\n\nرَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ` },
    { text: `اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ` },
    { text: `اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ` },
    { text: `بِسْمِ اللهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ`, repeat: 3 },
    { text: `رَضِيتُ بِاللهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ صَلَّى اللهُ عَلَيْهِ وَسَلَّمَ نَبِيًّا`, repeat: 3 }
];

let currentThikrIndex = 0;

function loadIslamicState() {
    try {
        if (fs.existsSync(ISLAMIC_STATE_FILE)) {
            const state = JSON.parse(fs.readFileSync(ISLAMIC_STATE_FILE, 'utf-8'));
            ISLAMIC_MODULE_ENABLED = state.enabled || false;
            currentThikrIndex = state.currentThikrIndex || 0;
        }
    } catch (error) {}
}

function saveIslamicState() {
    try {
        fs.writeFileSync(ISLAMIC_STATE_FILE, JSON.stringify({ enabled: ISLAMIC_MODULE_ENABLED, currentThikrIndex }), 'utf-8');
    } catch (error) {}
}

function loadSectionsState() {
    try {
        if (fs.existsSync(SECTIONS_STATE_FILE)) {
            sectionsState = JSON.parse(fs.readFileSync(SECTIONS_STATE_FILE, 'utf-8'));
        }
    } catch (error) {}
}

function saveSectionsState() {
    try {
        fs.writeFileSync(SECTIONS_STATE_FILE, JSON.stringify(sectionsState, null, 2), 'utf-8');
    } catch (error) {}
}

loadIslamicState();
loadSectionsState();

// ═══════════════════════════════════════════════════════════
// 📊 نظام الـ Poll Navigation
// ═══════════════════════════════════════════════════════════

async function sendPollMenu(sock, sender, level, path = []) {
    try {
        let pollName = '';
        let options = [];
        
        // المستوى 1: القائمة الرئيسية
        if (level === 'main') {
            pollName = '🕌 القسم الإسلامي - اختر';
            options = ['الأذكار', 'الفتاوى', 'الفقه', 'الموضوعية'];
            
            await sock.sendMessage(sender, {
                text: `🕌 *القسم الإسلامي*\n\nمرحباً بك في القسم الإسلامي من موقع الشيخ ابن باز رحمه الله\n\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\nاختر من الاستطلاع أدناه:`
            });
        }
        
        // المستوى 2: أقسام الفقه
        else if (level === 'fiqh_main') {
            pollName = '⚖️ الفقه - اختر القسم';
            options = ['العبادات', 'المعاملات', 'فقه الأسرة', 'العادات'];
        }
        
        // المستوى 3: أقسام العبادات
        else if (level === 'fiqh_ibadat') {
            pollName = '🕌 العبادات - اختر الموضوع';
            options = ['الصلاة', 'الجنائز', 'الزكاة', 'الصيام', 'الحج والعمرة', 'الطهارة', 'الجهاد والسير'];
        }
        
        // المستوى 4: أقسام الصلاة
        else if (level === 'fiqh_ibadat_salah') {
            pollName = '🕌 الصلاة - اختر الموضوع';
            options = [
                'حكم الصلاة وأهميتها',
                'الركوع والسجود',
                'وقت الصلاة',
                'الطهارة لصحة الصلاة',
                'ستر العورة للمصلي',
                'استقبال القبلة',
                'القيام في الصلاة',
                'التكبير والاستفتاح',
                'سجود التلاوة والشكر',
                'الأذان والإقامة'
            ];
        }
        
        // المستوى 3: أقسام المعاملات
        else if (level === 'fiqh_muamalat') {
            pollName = '💰 المعاملات - اختر الموضوع';
            options = [
                'الربا والصرف',
                'العارية',
                'السبق والمسابقات',
                'السلف والقرض',
                'الرهن',
                'الإفلاس والحجر',
                'الصلح',
                'الحوالة',
                'الضمان والكفالة',
                'الشركة'
            ];
        }
        
        // المستوى 3: فقه الأسرة
        else if (level === 'fiqh_usrah') {
            pollName = '👨‍👩‍👧 فقه الأسرة - اختر الموضوع';
            options = [
                'الزواج وأحكامه',
                'النظر والخلوة والاختلاط',
                'الخلع',
                'الطلاق',
                'الرجعة',
                'الإيلاء',
                'الظهار',
                'اللعان',
                'العِدَد',
                'الرضاع'
            ];
        }
        
        // المستوى 2: أقسام الموضوعية
        else if (level === 'mawdooiya_main') {
            pollName = '📖 الموضوعية - اختر الموضوع';
            options = [
                'القرآن وعلومه',
                'العقيدة',
                'الحديث وعلومه',
                'التفسير',
                'الدعوة والدعاة',
                'الفرق والمذاهب',
                'البدع والمحدثات',
                'أصول الفقه',
                'العالم والمتعلم',
                'الآداب والأخلاق'
            ];
        }
        
        // إرسال Poll
        if (options.length > 0) {
            await sock.sendMessage(sender, {
                poll: {
                    name: pollName,
                    values: options,
                    selectableCount: 1
                }
            });
            
            // حفظ موقع المستخدم
            userNavigation.set(sender, { level, path, timestamp: Date.now() });
            console.log(`✅ تم إرسال Poll: ${pollName}`);
        }
        
    } catch (error) {
        console.error('❌ خطأ في إرسال Poll:', error.message);
    }
}

// معالجة اختيار Poll
async function handlePollResponse(sock, msg) {
    try {
        const pollUpdate = msg.message?.pollUpdateMessage;
        if (!pollUpdate) return false;
        
        const sender = msg.key.remoteJid;
        const userNav = userNavigation.get(sender);
        
        if (!userNav) {
            await sock.sendMessage(sender, { text: '⚠️ انتهت الجلسة. اكتب /اسلام للبدء من جديد' });
            return true;
        }
        
        // استخراج الاختيار (هذا يعتمد على كيفية عمل Poll في Baileys)
        // سنستخدم طريقة fallback: نطلب من المستخدم كتابة الرقم
        console.log('📊 Poll Response:', JSON.stringify(pollUpdate, null, 2));
        
        await sock.sendMessage(sender, {
            text: '✅ تم تسجيل اختيارك!\n\nللمتابعة، اكتب الرقم المقابل لاختيارك من الاستطلاع السابق'
        });
        
        return true;
    } catch (error) {
        console.error('❌ خطأ في معالجة Poll:', error.message);
        return false;
    }
}

// معالجة اختيار بالأرقام (Fallback)
async function handleNumberSelection(sock, msg, choice, sender) {
    const userNav = userNavigation.get(sender);
    if (!userNav) return false;
    
    const { level, path } = userNav;
    
    // المستوى الرئيسي
    if (level === 'main') {
        if (choice === '1' || choice.includes('الأذكار')) {
            sectionsState.athkar.enabled = true;
            saveSectionsState();
            startAthkarSchedule(sock);
            await sock.sendMessage(sender, {
                text: '✅ تم تفعيل الأذكار\n\n🌅 الصباح: 6:50 و 7:00\n🌇 المساء: 3:50 و 4:00'
            });
            userNavigation.delete(sender);
            return true;
        }
        else if (choice === '2' || choice.includes('الفتاوى')) {
            sectionsState.fatawa.enabled = true;
            saveSectionsState();
            startFatawaSchedule(sock);
            await sock.sendMessage(sender, {
                text: '✅ تم تفعيل الفتاوى\n\n📚 يومياً: 12:00 ظهراً'
            });
            userNavigation.delete(sender);
            return true;
        }
        else if (choice === '3' || choice.includes('الفقه')) {
            await sendPollMenu(sock, sender, 'fiqh_main', ['fiqh']);
            return true;
        }
        else if (choice === '4' || choice.includes('الموضوعية')) {
            await sendPollMenu(sock, sender, 'mawdooiya_main', ['mawdooiya']);
            return true;
        }
    }
    
    // أقسام الفقه
    else if (level === 'fiqh_main') {
        if (choice === '1' || choice.includes('العبادات')) {
            await sendPollMenu(sock, sender, 'fiqh_ibadat', ['fiqh', 'ibadat']);
            return true;
        }
        else if (choice === '2' || choice.includes('المعاملات')) {
            await sendPollMenu(sock, sender, 'fiqh_muamalat', ['fiqh', 'muamalat']);
            return true;
        }
        else if (choice === '3' || choice.includes('الأسرة')) {
            await sendPollMenu(sock, sender, 'fiqh_usrah', ['fiqh', 'usrah']);
            return true;
        }
    }
    
    // العبادات
    else if (level === 'fiqh_ibadat') {
        if (choice === '1' || choice.includes('الصلاة')) {
            await sendPollMenu(sock, sender, 'fiqh_ibadat_salah', ['fiqh', 'ibadat', 'salah']);
            return true;
        }
        // باقي المواضيع...
    }
    
    // الصلاة - الوصول للمحتوى
    else if (level === 'fiqh_ibadat_salah') {
        if (choice === '1' || choice.includes('حكم الصلاة')) {
            // ✅ تفعيل القسم
            sectionsState.fiqh.enabled = true;
            saveSectionsState();
            startFiqhSchedule(sock);
            
            // 📤 إرسال أول محاضرة
            const lecture = ISLAMIC_CONTENT.fiqh.subsections.ibadat.topics.salah.categories.hukmSalah.items[0];
            
            await sock.sendMessage(sender, {
                text: `✅ تم تفعيل قسم: حكم الصلاة وأهميتها\n\n🕋 سيتم إرسال المحاضرات كل ساعة\n\n📖 جاري إرسال أول محاضرة...`
            });
            
            // جلب وإرسال المحاضرة
            console.log(`🕋 جاري جلب: ${lecture.title}`);
            const content = await fetchLectureContent(lecture.pageUrl);
            const message = formatLecture(content, lecture.audioUrl);
            
            audioRequests.set(lecture.id, {
                audioUrl: lecture.audioUrl,
                title: lecture.title
            });
            
            await sock.sendMessage(sender, { text: message });
            await sock.sendMessage(sender, {
                text: `💬 _اكتب *صوت* للحصول على الملف الصوتي_`
            });
            
            console.log(`✅ تم تفعيل وإرسال: ${lecture.title}`);
            
            userNavigation.delete(sender);
            return true;
        }
    }
    
    return false;
}

// دوال الإرسال (Athkar, Fatwa, etc.)
async function sendMorningThikr(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        if (!targetGroup || !sectionsState.athkar.enabled) return;
        
        const thikr = MORNING_EVENING_ATHKAR[currentThikrIndex];
        let message = `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n🕌 *ذكر الصباح*\n\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n${thikr.text}`;
        if (thikr.repeat) message += `\n\n_يُقال ${thikr.repeat} مرة_`;
        if (thikr.reward) message += `\n\n${thikr.reward}`;
        message += `\n\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`;
        
        await sock.sendMessage(targetGroup, { text: message });
        currentThikrIndex = (currentThikrIndex + 1) % MORNING_EVENING_ATHKAR.length;
        saveIslamicState();
    } catch (error) {}
}

async function sendEveningThikr(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        if (!targetGroup || !sectionsState.athkar.enabled) return;
        
        const thikr = MORNING_EVENING_ATHKAR[currentThikrIndex];
        let message = `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n🕌 *ذكر المساء*\n\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n${thikr.text}`;
        if (thikr.repeat) message += `\n\n_يُقال ${thikr.repeat} مرة_`;
        if (thikr.reward) message += `\n\n${thikr.reward}`;
        message += `\n\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`;
        
        await sock.sendMessage(targetGroup, { text: message });
        currentThikrIndex = (currentThikrIndex + 1) % MORNING_EVENING_ATHKAR.length;
        saveIslamicState();
    } catch (error) {}
}

async function sendFatwa(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        if (!targetGroup || !sectionsState.fatawa.enabled) return;
        
        const fatwa = await fetchRandomFatwa();
        await sock.sendMessage(targetGroup, { text: formatFatwaMessage(fatwa) });
    } catch (error) {}
}

// الجدولة
function startAthkarSchedule(sock) {
    stopAthkarSchedule();
    morningJob1 = cron.schedule('50 6 * * *', () => sendMorningThikr(sock), { timezone: "Africa/Cairo" });
    morningJob2 = cron.schedule('0 7 * * *', () => sendMorningThikr(sock), { timezone: "Africa/Cairo" });
    eveningJob1 = cron.schedule('50 15 * * *', () => sendEveningThikr(sock), { timezone: "Africa/Cairo" });
    eveningJob2 = cron.schedule('0 16 * * *', () => sendEveningThikr(sock), { timezone: "Africa/Cairo" });
}

function stopAthkarSchedule() {
    if (morningJob1) morningJob1.stop();
    if (morningJob2) morningJob2.stop();
    if (eveningJob1) eveningJob1.stop();
    if (eveningJob2) eveningJob2.stop();
}

function startFatawaSchedule(sock) {
    stopFatawaSchedule();
    fatwaJob = cron.schedule('0 12 * * *', () => sendFatwa(sock), { timezone: "Africa/Cairo" });
}

function stopFatawaSchedule() {
    if (fatwaJob) fatwaJob.stop();
}

function startFiqhSchedule(sock) {
    stopFiqhSchedule();
    fiqhJob = cron.schedule('0 * * * *', () => {
        // سيتم إرسال محاضرات تلقائياً
    }, { timezone: "Africa/Cairo" });
}

function stopFiqhSchedule() {
    if (fiqhJob) fiqhJob.stop();
}

function startMawdooiyaSchedule(sock) {
    stopMawdooiyaSchedule();
    mawdooiyaJob = cron.schedule('0 * * * *', () => {
        // سيتم إرسال محاضرات تلقائياً
    }, { timezone: "Africa/Cairo" });
}

function stopMawdooiyaSchedule() {
    if (mawdooiyaJob) mawdooiyaJob.stop();
}

function startIslamicSchedule(sock) {
    if (sectionsState.athkar.enabled) startAthkarSchedule(sock);
    if (sectionsState.fatawa.enabled) startFatawaSchedule(sock);
    if (sectionsState.fiqh.enabled) startFiqhSchedule(sock);
    if (sectionsState.mawdooiya.enabled) startMawdooiyaSchedule(sock);
}

function stopIslamicSchedule() {
    stopAthkarSchedule();
    stopFatawaSchedule();
    stopFiqhSchedule();
    stopMawdooiyaSchedule();
}

// معالج الأوامر
async function handleIslamicCommand(sock, msg, messageText, sender) {
    const isAdmin = sender.includes('249962204268') || sender.includes('231211024814174') || msg.key.fromMe;
    if (!isAdmin) return false;
    
    // معالجة Poll responses
    if (msg.message?.pollUpdateMessage) {
        return await handlePollResponse(sock, msg);
    }
    
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
        return await handleNumberSelection(sock, msg, cmd, sender);
    }
    
    // أمر تحميل الصوت
    if (cmd === 'صوت') {
        const lastAudio = Array.from(audioRequests.values()).pop();
        if (lastAudio) {
            try {
                await sock.sendMessage(sender, { text: '⏳ جاري التحميل...' });
                const buffer = await downloadAudio(lastAudio.audioUrl);
                await sock.sendMessage(sender, {
                    audio: buffer,
                    mimetype: 'audio/mp3',
                    ptt: false,
                    fileName: `${lastAudio.title.substring(0, 50)}.mp3`
                });
            } catch (err) {
                await sock.sendMessage(sender, { text: '❌ فشل التحميل' });
            }
        }
        return true;
    }
    
    return false;
}

module.exports = {
    handleIslamicCommand,
    startIslamicSchedule,
    stopIslamicSchedule,
    isEnabled: () => ISLAMIC_MODULE_ENABLED
};

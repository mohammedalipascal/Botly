const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { fetchRandomFatwa, formatFatwaMessage } = require('./fatwaModule');
const { ISLAMIC_CONTENT } = require('./islamicContent');
const { fetchLectureContent, formatLecture, downloadAudio } = require('./lectureHandler');
const { 
    sendMainMenu, 
    handleButtonResponse, 
    sendLectureWithAudioButton 
} = require('./islamicButtons');

// ═══════════════════════════════════════════════════════════
// 🕌 القسم الإسلامي - List Messages System
// ═══════════════════════════════════════════════════════════

let ISLAMIC_MODULE_ENABLED = false;
const ISLAMIC_STATE_FILE = path.join(__dirname, 'islamic_state.json');
const SECTIONS_STATE_FILE = path.join(__dirname, 'sections_state.json');

let morningJob1 = null, morningJob2 = null, eveningJob1 = null, eveningJob2 = null;
let fatwaJob = null, fiqhJob = null, mawdooiyaJob = null;

let sectionsState = {
    athkar: { enabled: false },
    fatawa: { enabled: false },
    fiqh: { enabled: false, activePath: [], categoryName: '' },
    mawdooiya: { enabled: false, activePath: [], topicName: '' }
};

let lectureIndex = { fiqh: 0, mawdooiya: 0 };
const audioRequests = new Map();

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
// 📤 دوال الإرسال
// ═══════════════════════════════════════════════════════════

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

async function sendFiqhLecture(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        if (!targetGroup || !sectionsState.fiqh.enabled) return;
        
        const path = sectionsState.fiqh.activePath;
        if (!path || path.length === 0) return;
        
        // الوصول للمحتوى بناءً على المسار
        let content = ISLAMIC_CONTENT;
        for (const key of path.slice(0, -1)) {
            if (key === 'fiqh') content = content.fiqh.subsections;
            else if (key === 'ibadat') content = content.ibadat.topics;
            else if (key === 'salah') content = content.salah.categories;
        }
        
        const categoryKey = path[path.length - 1];
        const category = content[categoryKey];
        
        if (!category || !category.items || category.items.length === 0) return;
        
        const lecture = category.items[lectureIndex.fiqh % category.items.length];
        
        console.log(`🕋 جاري إرسال: ${lecture.title}`);
        const lectureContent = await fetchLectureContent(lecture.pageUrl);
        const message = formatLecture(lectureContent, lecture.audioUrl);
        
        // حفظ معلومات الصوت
        audioRequests.set(lecture.id, {
            audioUrl: lecture.audioUrl,
            title: lecture.title
        });
        
        // إرسال المحاضرة مع زر الصوت
        await sendLectureWithAudioButton(sock, targetGroup, message, lecture.audioUrl, lecture.id, lecture.title);
        
        lectureIndex.fiqh++;
        console.log(`✅ تم إرسال المحاضرة #${lectureIndex.fiqh}`);
        
    } catch (error) {
        console.error('❌ خطأ في إرسال محاضرة الفقه:', error.message);
    }
}

// ═══════════════════════════════════════════════════════════
// 📅 الجدولة
// ═══════════════════════════════════════════════════════════

function startAthkarSchedule(sock) {
    stopAthkarSchedule();
    morningJob1 = cron.schedule('50 6 * * *', () => sendMorningThikr(sock), { timezone: "Africa/Cairo" });
    morningJob2 = cron.schedule('0 7 * * *', () => sendMorningThikr(sock), { timezone: "Africa/Cairo" });
    eveningJob1 = cron.schedule('50 15 * * *', () => sendEveningThikr(sock), { timezone: "Africa/Cairo" });
    eveningJob2 = cron.schedule('0 16 * * *', () => sendEveningThikr(sock), { timezone: "Africa/Cairo" });
    console.log('✅ تم بدء جدولة الأذكار');
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
    console.log('✅ تم بدء جدولة الفتاوى');
}

function stopFatawaSchedule() {
    if (fatwaJob) fatwaJob.stop();
}

function startFiqhSchedule(sock) {
    stopFiqhSchedule();
    fiqhJob = cron.schedule('0 * * * *', () => sendFiqhLecture(sock), { timezone: "Africa/Cairo" });
    console.log('✅ تم بدء جدولة محاضرات الفقه');
}

function stopFiqhSchedule() {
    if (fiqhJob) fiqhJob.stop();
}

function startMawdooiyaSchedule(sock) {
    stopMawdooiyaSchedule();
    mawdooiyaJob = cron.schedule('0 * * * *', () => {
        // TODO: إضافة دالة إرسال محاضرات الموضوعية
    }, { timezone: "Africa/Cairo" });
    console.log('✅ تم بدء جدولة محاضرات الموضوعية');
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

// ═══════════════════════════════════════════════════════════
// 🎛️ معالج الأوامر
// ═══════════════════════════════════════════════════════════

async function handleIslamicCommand(sock, msg, messageText, sender) {
    const isAdmin = sender.includes('249962204268') || sender.includes('231211024814174') || msg.key.fromMe;
    
    // ✅ التحقق من أن المستخدم أدمن
    if (!isAdmin) {
        console.log('⛔ مستخدم غير مصرح له حاول استخدام القسم الإسلامي');
        return false;
    }
    
    // معالجة Buttons Responses فقط
    if (msg.message?.buttonsResponseMessage) {
        const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
        console.log(`🔘 Button Selected: ${buttonId}`);
        
        // زر تحميل الصوت
        if (buttonId.startsWith('audio_')) {
            const lectureId = buttonId.replace('audio_', '');
            const audioInfo = audioRequests.get(lectureId);
            
            if (audioInfo) {
                try {
                    await sock.sendMessage(sender, { text: '⏳ جاري التحميل...' });
                    const buffer = await downloadAudio(audioInfo.audioUrl);
                    await sock.sendMessage(sender, {
                        audio: buffer,
                        mimetype: 'audio/mp3',
                        ptt: false,
                        fileName: `${audioInfo.title.substring(0, 50)}.mp3`
                    });
                    console.log(`✅ تم إرسال الصوت: ${audioInfo.title}`);
                } catch (err) {
                    await sock.sendMessage(sender, { text: '❌ فشل التحميل' });
                    console.error('❌ خطأ في تحميل الصوت:', err.message);
                }
            } else {
                await sock.sendMessage(sender, { text: '⚠️ الصوت غير متاح' });
            }
            return true;
        }
        
        // باقي الأزرار
        const result = await handleButtonResponse(sock, sender, buttonId, sender);
        
        if (result && typeof result === 'object') {
            // تفعيل الأذكار
            if (result.action === 'enable_athkar') {
                sectionsState.athkar.enabled = true;
                saveSectionsState();
                startAthkarSchedule(sock);
            }
            
            // تفعيل الفتاوى
            if (result.action === 'enable_fatawa') {
                sectionsState.fatawa.enabled = true;
                saveSectionsState();
                startFatawaSchedule(sock);
            }
            
            // تفعيل الفقه
            if (result.action === 'enable_fiqh') {
                sectionsState.fiqh.enabled = true;
                sectionsState.fiqh.activePath = result.path;
                sectionsState.fiqh.categoryName = result.categoryName;
                saveSectionsState();
                startFiqhSchedule(sock);
                
                // إرسال أول محاضرة فوراً
                await sendFiqhLecture(sock);
            }
            
            // تفعيل الموضوعية
            if (result.action === 'enable_mawdooiya') {
                sectionsState.mawdooiya.enabled = true;
                sectionsState.mawdooiya.activePath = result.path;
                sectionsState.mawdooiya.topicName = result.topicName;
                saveSectionsState();
                startMawdooiyaSchedule(sock);
            }
        }
        
        return true;
    }
    
    const cmd = messageText.trim();
    
    // القائمة الرئيسية
    if (cmd === '/اسلام') {
        await sendMainMenu(sock, sender);
        ISLAMIC_MODULE_ENABLED = true;
        saveIslamicState();
        console.log(`✅ ${sender} فتح القائمة الرئيسية`);
        return true;
    }
    
    // أمر إيقاف الأذكار
    if (cmd === '/ايقاف_اذكار' || cmd === '/stop_athkar') {
        sectionsState.athkar.enabled = false;
        saveSectionsState();
        stopAthkarSchedule();
        await sock.sendMessage(sender, { text: '⏸️ تم إيقاف الأذكار' });
        console.log('⏸️ تم إيقاف الأذكار');
        return true;
    }
    
    // أمر إيقاف الفتاوى
    if (cmd === '/ايقاف_فتاوى' || cmd === '/stop_fatawa') {
        sectionsState.fatawa.enabled = false;
        saveSectionsState();
        stopFatawaSchedule();
        await sock.sendMessage(sender, { text: '⏸️ تم إيقاف الفتاوى' });
        console.log('⏸️ تم إيقاف الفتاوى');
        return true;
    }
    
    // أمر إيقاف الفقه
    if (cmd === '/ايقاف_فقه' || cmd === '/stop_fiqh') {
        sectionsState.fiqh.enabled = false;
        saveSectionsState();
        stopFiqhSchedule();
        await sock.sendMessage(sender, { text: '⏸️ تم إيقاف محاضرات الفقه' });
        console.log('⏸️ تم إيقاف محاضرات الفقه');
        return true;
    }
    
    // أمر إيقاف الموضوعية
    if (cmd === '/ايقاف_موضوعية' || cmd === '/stop_mawdooiya') {
        sectionsState.mawdooiya.enabled = false;
        saveSectionsState();
        stopMawdooiyaSchedule();
        await sock.sendMessage(sender, { text: '⏸️ تم إيقاف محاضرات الموضوعية' });
        console.log('⏸️ تم إيقاف محاضرات الموضوعية');
        return true;
    }
    
    // أمر الحالة
    if (cmd === '/حالة_اسلامي' || cmd === '/islamic_status') {
        const status = `📊 *حالة القسم الإسلامي*

📿 الأذكار: ${sectionsState.athkar.enabled ? '✅ مفعّل' : '❌ معطّل'}
📚 الفتاوى: ${sectionsState.fatawa.enabled ? '✅ مفعّل' : '❌ معطّل'}
⚖️ الفقه: ${sectionsState.fiqh.enabled ? `✅ مفعّل (${sectionsState.fiqh.categoryName})` : '❌ معطّل'}
📖 الموضوعية: ${sectionsState.mawdooiya.enabled ? `✅ مفعّل (${sectionsState.mawdooiya.topicName})` : '❌ معطّل'}

_استخدم /اسلام لفتح القائمة الرئيسية_`;
        
        await sock.sendMessage(sender, { text: status });
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

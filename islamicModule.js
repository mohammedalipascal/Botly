const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { fetchRandomFatwa, formatFatwaMessage } = require('./fatwaModule');
const { ISLAMIC_CONTENT } = require('./islamicContent');
const { fetchLectureContent, formatLecture, downloadAudio } = require('./lectureHandler');

// ═══════════════════════════════════════════════════════════
// 🕌 القسم الإسلامي - Buttons Working Method
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

const MORNING_EVENING_ATHKAR = [
    { text: `أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ\n\nرَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ\n\nرَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ` },
    { text: `اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ` },
    { text: `اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ` },
    { text: `بِسْمِ اللهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ`, repeat: 3 },
    { text: `رَضِيتُ بِاللهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ صَلَّى اللهُ عَلَيْهِ وَسَلَّمَ نَبِيًّا`, repeat: 3 },
    { text: `يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ، وَلَا تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ` },
    { text: `سُبْحَانَ اللهِ وَبِحَمْدِهِ`, repeat: 100, reward: `مَنْ قَالَهَا مِائَةَ مَرَّةٍ حُطَّتْ خَطَايَاهُ وَإِنْ كَانَتْ مِثْلَ زَبَدِ الْبَحْرِ` },
    { text: `لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ`, repeat: 100, reward: `مَنْ قَالَهَا مِائَةَ مَرَّةٍ فِي يَوْمٍ كَانَتْ لَهُ عَدْلَ عَشْرِ رِقَابٍ` },
    { text: `سُبْحَانَ اللهِ، وَالْحَمْدُ لِلَّهِ، وَلَا إِلَهَ إِلَّا اللهُ، وَاللهُ أَكْبَرُ`, repeat: 10 },
    { text: `أَسْتَغْفِرُ اللهَ وَأَتُوبُ إِلَيْهِ`, repeat: 100 }
];

let currentThikrIndex = 0;

function loadIslamicState() {
    try {
        if (fs.existsSync(ISLAMIC_STATE_FILE)) {
            const state = JSON.parse(fs.readFileSync(ISLAMIC_STATE_FILE, 'utf-8'));
            ISLAMIC_MODULE_ENABLED = state.enabled || false;
            currentThikrIndex = state.currentThikrIndex || 0;
            return state;
        }
    } catch (error) {}
    return { enabled: false, currentThikrIndex: 0 };
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
    return sectionsState;
}

function saveSectionsState() {
    try {
        fs.writeFileSync(SECTIONS_STATE_FILE, JSON.stringify(sectionsState, null, 2), 'utf-8');
    } catch (error) {}
}

loadIslamicState();
loadSectionsState();

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
        console.log(`✅ ذكر صباح #${currentThikrIndex + 1}`);
        currentThikrIndex = (currentThikrIndex + 1) % MORNING_EVENING_ATHKAR.length;
        saveIslamicState();
    } catch (error) {
        console.error('❌ خطأ:', error.message);
    }
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
        console.log(`✅ ذكر مساء #${currentThikrIndex + 1}`);
        currentThikrIndex = (currentThikrIndex + 1) % MORNING_EVENING_ATHKAR.length;
        saveIslamicState();
    } catch (error) {
        console.error('❌ خطأ:', error.message);
    }
}

async function sendFatwa(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        if (!targetGroup || !sectionsState.fatawa.enabled) return;
        
        console.log('📚 جاري جلب فتوى...');
        const fatwa = await fetchRandomFatwa();
        await sock.sendMessage(targetGroup, { text: formatFatwaMessage(fatwa) });
        console.log(`✅ فتوى #${fatwa.id}`);
    } catch (error) {
        console.error('❌ خطأ:', error.message);
    }
}

function getAllLectures(section) {
    const lectures = [];
    if (section === 'fiqh') {
        const fiqh = ISLAMIC_CONTENT.fiqh;
        for (const subsectionKey in fiqh.subsections) {
            const subsection = fiqh.subsections[subsectionKey];
            for (const topicKey in subsection.topics) {
                const topic = subsection.topics[topicKey];
                for (const categoryKey in topic.categories) {
                    const category = topic.categories[categoryKey];
                    if (category.items?.length > 0) lectures.push(...category.items);
                }
            }
        }
    }
    return lectures;
}

async function sendLecture(sock, section) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        if (!targetGroup || !sectionsState[section].enabled) return;
        
        const lectures = getAllLectures(section);
        if (lectures.length === 0) return;
        
        const lecture = lectures[lectureIndex[section] || 0];
        console.log(`🕋 جاري جلب: ${lecture.title}`);
        
        const content = await fetchLectureContent(lecture.pageUrl);
        const message = formatLecture(content, lecture.audioUrl);
        
        audioRequests.set(lecture.id, { audioUrl: lecture.audioUrl, title: lecture.title });
        
        // ⭐ إرسال مع زر - الطريقة الصحيحة لـ Baileys v6
        const buttons = [
            {
                buttonId: `audio_${lecture.id}`,
                buttonText: { displayText: '🎧 تحميل الصوت' },
                type: 1
            }
        ];
        
        try {
            await sock.sendMessage(targetGroup, {
                text: message,
                footer: 'اضغط الزر للاستماع',
                buttons: buttons,
                headerType: 1
            });
            console.log(`✅ محاضرة مع زر: ${lecture.title}`);
        } catch (btnError) {
            console.log('⚠️ فشل إرسال الأزرار، إرسال عادي');
            console.error('تفاصيل الخطأ:', btnError.message);
            await sock.sendMessage(targetGroup, { 
                text: message + `\n\n_اكتب: صوت_${lecture.id} للحصول على الملف الصوتي_`
            });
        }
        
        lectureIndex[section] = (lectureIndex[section] + 1) % lectures.length;
    } catch (error) {
        console.error('❌ خطأ:', error.message);
    }
}

// معالج الأزرار
async function handleButtonClick(sock, msg) {
    try {
        // الطريقة الأولى: buttonsResponseMessage
        let buttonId = msg.message?.buttonsResponseMessage?.selectedButtonId;
        
        // الطريقة الثانية: templateButtonReplyMessage
        if (!buttonId) {
            buttonId = msg.message?.templateButtonReplyMessage?.selectedId;
        }
        
        if (!buttonId) return false;
        
        console.log(`🔘 زر تم الضغط عليه: ${buttonId}`);
        
        if (buttonId.startsWith('audio_')) {
            const lectureId = buttonId.replace('audio_', '');
            const audioInfo = audioRequests.get(lectureId);
            
            if (!audioInfo) {
                await sock.sendMessage(msg.key.remoteJid, { 
                    text: '⚠️ انتهت صلاحية هذا الطلب' 
                }, { quoted: msg });
                return true;
            }
            
            console.log(`📥 تحميل الصوت: ${audioInfo.title}`);
            
            await sock.sendMessage(msg.key.remoteJid, { 
                text: '⏳ جاري تحميل الملف الصوتي...' 
            }, { quoted: msg });
            
            try {
                const audioBuffer = await downloadAudio(audioInfo.audioUrl);
                await sock.sendMessage(msg.key.remoteJid, {
                    audio: audioBuffer,
                    mimetype: 'audio/mp3',
                    ptt: false,
                    fileName: `${audioInfo.title.substring(0, 50)}.mp3`
                }, { quoted: msg });
                
                console.log(`✅ تم إرسال الملف الصوتي`);
                audioRequests.delete(lectureId);
            } catch (error) {
                console.error('❌ خطأ تحميل:', error.message);
                await sock.sendMessage(msg.key.remoteJid, { 
                    text: '❌ فشل تحميل الملف الصوتي' 
                }, { quoted: msg });
            }
            
            return true;
        }
        
        // معالجة أزرار القائمة
        switch(buttonId) {
            case 'enable_athkar':
                sectionsState.athkar.enabled = true;
                saveSectionsState();
                startAthkarSchedule(sock);
                await sock.sendMessage(msg.key.remoteJid, { 
                    text: '✅ تم تفعيل الأذكار\n\n🌅 الصباح: 6:50 و 7:00\n🌇 المساء: 3:50 و 4:00' 
                }, { quoted: msg });
                break;
            case 'enable_fatawa':
                sectionsState.fatawa.enabled = true;
                saveSectionsState();
                startFatawaSchedule(sock);
                await sock.sendMessage(msg.key.remoteJid, { 
                    text: '✅ تم تفعيل الفتاوى\n\n📚 يومياً: 12:00 ظهراً' 
                }, { quoted: msg });
                break;
            case 'enable_fiqh':
                sectionsState.fiqh.enabled = true;
                saveSectionsState();
                startFiqhSchedule(sock);
                await sock.sendMessage(msg.key.remoteJid, { 
                    text: '✅ تم تفعيل الفقه\n\n🕋 كل ساعة' 
                }, { quoted: msg });
                break;
            case 'send_morning':
                await sendMorningThikr(sock);
                break;
            case 'send_fatwa':
                await sendFatwa(sock);
                break;
            case 'send_fiqh':
                await sendLecture(sock, 'fiqh');
                break;
            case 'show_status':
                const status = `🕌 *حالة القسم الإسلامي*\n\n• الأذكار: ${sectionsState.athkar.enabled ? '✅' : '❌'}\n• الفتاوى: ${sectionsState.fatawa.enabled ? '✅' : '❌'}\n• الفقه: ${sectionsState.fiqh.enabled ? '✅' : '❌'}\n• الموضوعية: ${sectionsState.mawdooiya.enabled ? '✅' : '❌'}`;
                await sock.sendMessage(msg.key.remoteJid, { text: status }, { quoted: msg });
                break;
        }
        
        return true;
    } catch (error) {
        console.error('❌ خطأ معالجة الزر:', error.message);
        return false;
    }
}

async function sendMainMenu(sock, sender, msg) {
    const menuText = `🕌 *القسم الإسلامي*

مرحباً بك في القسم الإسلامي من موقع الشيخ ابن باز رحمه الله

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

*الأقسام المتاحة:*

🕌 الأذكار - أذكار الصباح والمساء
📚 الفتاوى - فتاوى متنوعة يومياً
⚖️ الفقه - محاضرات فقهية
📖 الموضوعية - مواضيع متنوعة

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

اختر من الأزرار أدناه`;

    const buttons = [
        { buttonId: 'enable_athkar', buttonText: { displayText: '🕌 تفعيل الأذكار' }, type: 1 },
        { buttonId: 'enable_fatawa', buttonText: { displayText: '📚 تفعيل الفتاوى' }, type: 1 },
        { buttonId: 'enable_fiqh', buttonText: { displayText: '⚖️ تفعيل الفقه' }, type: 1 }
    ];
    
    try {
        await sock.sendMessage(sender, {
            text: menuText,
            footer: 'القسم الإسلامي',
            buttons: buttons,
            headerType: 1
        });
        console.log('✅ تم إرسال القائمة مع أزرار');
    } catch (error) {
        console.error('❌ خطأ إرسال أزرار:', error.message);
        console.error('التفاصيل الكاملة:', JSON.stringify(error, null, 2));
        
        // Fallback
        await sock.sendMessage(sender, { 
            text: menuText + `\n\n_الأزرار غير مدعومة حالياً. اكتب: 1 للأذكار، 2 للفتاوى، 3 للفقه_` 
        }, { quoted: msg });
    }
}

function startAthkarSchedule(sock) {
    stopAthkarSchedule();
    morningJob1 = cron.schedule('50 6 * * *', () => sendMorningThikr(sock), { timezone: "Africa/Cairo" });
    morningJob2 = cron.schedule('0 7 * * *', () => sendMorningThikr(sock), { timezone: "Africa/Cairo" });
    eveningJob1 = cron.schedule('50 15 * * *', () => sendEveningThikr(sock), { timezone: "Africa/Cairo" });
    eveningJob2 = cron.schedule('0 16 * * *', () => sendEveningThikr(sock), { timezone: "Africa/Cairo" });
    console.log('✅ جدولة الأذكار');
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
    console.log('✅ جدولة الفتاوى');
}

function stopFatawaSchedule() {
    if (fatwaJob) fatwaJob.stop();
}

function startFiqhSchedule(sock) {
    stopFiqhSchedule();
    fiqhJob = cron.schedule('0 * * * *', () => sendLecture(sock, 'fiqh'), { timezone: "Africa/Cairo" });
    console.log('✅ جدولة الفقه');
}

function stopFiqhSchedule() {
    if (fiqhJob) fiqhJob.stop();
}

function startMawdooiyaSchedule(sock) {
    stopMawdooiyaSchedule();
    mawdooiyaJob = cron.schedule('0 * * * *', () => sendLecture(sock, 'mawdooiya'), { timezone: "Africa/Cairo" });
    console.log('✅ جدولة الموضوعية');
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

async function handleIslamicCommand(sock, msg, messageText, sender) {
    const isAdmin = sender.includes('249962204268') || sender.includes('231211024814174') || msg.key.fromMe;
    if (!isAdmin) return false;
    
    // معالجة الأزرار
    if (msg.message?.buttonsResponseMessage || msg.message?.templateButtonReplyMessage) {
        return await handleButtonClick(sock, msg);
    }
    
    const cmd = messageText.trim();
    
    if (cmd === '/اسلام') {
        await sendMainMenu(sock, sender, msg);
        ISLAMIC_MODULE_ENABLED = true;
        saveIslamicState();
        return true;
    }
    
    // Fallback commands
    if (cmd === '1') {
        sectionsState.athkar.enabled = true;
        saveSectionsState();
        startAthkarSchedule(sock);
        await sock.sendMessage(sender, { text: '✅ تم تفعيل الأذكار' }, { quoted: msg });
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

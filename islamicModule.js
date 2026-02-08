const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { fetchRandomFatwa, formatFatwaMessage } = require('./fatwaModule');
const { ISLAMIC_CONTENT } = require('./islamicContent');
const { fetchLectureContent, formatLecture, downloadAudio } = require('./lectureHandler');

// ═══════════════════════════════════════════════════════════
// 🕌 القسم الإسلامي المتقدم - موقع الشيخ ابن باز رحمه الله
// ═══════════════════════════════════════════════════════════

// ═══ الحالة العامة ═══
let ISLAMIC_MODULE_ENABLED = false;

// ═══ ملفات الحالة ═══
const ISLAMIC_STATE_FILE = path.join(__dirname, 'islamic_state.json');
const SECTIONS_STATE_FILE = path.join(__dirname, 'sections_state.json');

// ═══ Jobs للجدولة ═══
let morningJob1 = null;
let morningJob2 = null;
let eveningJob1 = null;
let eveningJob2 = null;
let fatwaJob = null;
let fiqhJob = null;
let mawdooiyaJob = null;

// ═══ حالة الأقسام ═══
let sectionsState = {
    athkar: { enabled: false },
    fatawa: { enabled: false },
    fiqh: { enabled: false },
    mawdooiya: { enabled: false }
};

// ═══ فهرس المحاضرات ═══
let lectureIndex = {
    fiqh: 0,
    mawdooiya: 0
};

// ═══════════════════════════════════════════════════════════
// 📚 أذكار الصباح والمساء
// ═══════════════════════════════════════════════════════════

const MORNING_EVENING_ATHKAR = [
    {
        text: `أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ

رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ

رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ`,
        evening: `أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ...`
    },
    {
        text: `اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ`,
        evening: `اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ`
    },
    {
        text: `اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ بِذَنْبِي فَاغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ`
    },
    {
        text: `بِسْمِ اللهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ`,
        repeat: 3
    },
    {
        text: `رَضِيتُ بِاللهِ رَبًّا، وَبِالْإِسْلَامِ دِينًا، وَبِمُحَمَّدٍ صَلَّى اللهُ عَلَيْهِ وَسَلَّمَ نَبِيًّا`,
        repeat: 3
    },
    {
        text: `يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ، وَلَا تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ`
    },
    {
        text: `أَصْبَحْنَا عَلَى فِطْرَةِ الْإِسْلَامِ، وَعَلَى كَلِمَةِ الْإِخْلَاصِ، وَعَلَى دِينِ نَبِيِّنَا مُحَمَّدٍ صَلَّى اللهُ عَلَيْهِ وَسَلَّمَ، وَعَلَى مِلَّةِ أَبِينَا إِبْرَاهِيمَ حَنِيفًا مُسْلِمًا وَمَا كَانَ مِنَ الْمُشْرِكِينَ`,
        evening: `أَمْسَيْنَا عَلَى فِطْرَةِ الْإِسْلَامِ...`
    },
    {
        text: `سُبْحَانَ اللهِ وَبِحَمْدِهِ`,
        repeat: 100,
        reward: `مَنْ قَالَهَا مِائَةَ مَرَّةٍ حُطَّتْ خَطَايَاهُ وَإِنْ كَانَتْ مِثْلَ زَبَدِ الْبَحْرِ`
    },
    {
        text: `لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ`,
        repeat: 100,
        reward: `مَنْ قَالَهَا مِائَةَ مَرَّةٍ فِي يَوْمٍ كَانَتْ لَهُ عَدْلَ عَشْرِ رِقَابٍ وَكُتِبَتْ لَهُ مِائَةُ حَسَنَةٍ وَمُحِيَتْ عَنْهُ مِائَةُ سَيِّئَةٍ وَكَانَتْ لَهُ حِرْزًا مِنَ الشَّيْطَانِ يَوْمَهُ ذَلِكَ حَتَّى يُمْسِيَ وَلَمْ يَأْتِ أَحَدٌ بِأَفْضَلَ مِمَّا جَاءَ بِهِ إِلَّا أَحَدٌ عَمِلَ أَكْثَرَ مِنْ ذَلِكَ`
    },
    {
        text: `سُبْحَانَ اللهِ، وَالْحَمْدُ لِلَّهِ، وَلَا إِلَهَ إِلَّا اللهُ، وَاللهُ أَكْبَرُ`,
        repeat: 10
    },
    {
        text: `أَسْتَغْفِرُ اللهَ وَأَتُوبُ إِلَيْهِ`,
        repeat: 100
    },
    {
        text: `أَعُوذُ بِكَلِمَاتِ اللهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ`,
        repeat: 3
    },
    {
        text: `اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ، اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي دِينِي وَدُنْيَايَ وَأَهْلِي وَمَالِي، اللَّهُمَّ اسْتُرْ عَوْرَاتِي وَآمِنْ رَوْعَاتِي، اللَّهُمَّ احْفَظْنِي مِنْ بَيْنِ يَدَيَّ وَمِنْ خَلْفِي، وَعَنْ يَمِينِي وَعَنْ شِمَالِي، وَمِنْ فَوْقِي، وَأَعُوذُ بِعَظَمَتِكَ أَنْ أُغْتَالَ مِنْ تَحْتِي`
    },
    {
        text: `اللَّهُمَّ عَالِمَ الْغَيْبِ وَالشَّهَادَةِ، فَاطِرَ السَّمَاوَاتِ وَالْأَرْضِ، رَبَّ كُلِّ شَيْءٍ وَمَلِيكَهُ، أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا أَنْتَ، أَعُوذُ بِكَ مِنْ شَرِّ نَفْسِي، وَمِنْ شَرِّ الشَّيْطَانِ وَشِرْكِهِ، وَأَنْ أَقْتَرِفَ عَلَى نَفْسِي سُوءًا، أَوْ أَجُرَّهُ إِلَى مُسْلِمٍ`
    }
];

let currentThikrIndex = 0;

// ═══════════════════════════════════════════════════════════
// 🔧 دوال الحالة
// ═══════════════════════════════════════════════════════════

function loadIslamicState() {
    try {
        if (fs.existsSync(ISLAMIC_STATE_FILE)) {
            const data = fs.readFileSync(ISLAMIC_STATE_FILE, 'utf-8');
            const state = JSON.parse(data);
            ISLAMIC_MODULE_ENABLED = state.enabled || false;
            currentThikrIndex = state.currentThikrIndex || 0;
            return state;
        }
    } catch (error) {
        console.log('⚠️ خطأ في قراءة حالة القسم الإسلامي');
    }
    return { enabled: false, currentThikrIndex: 0 };
}

function saveIslamicState() {
    try {
        const state = {
            enabled: ISLAMIC_MODULE_ENABLED,
            currentThikrIndex: currentThikrIndex
        };
        fs.writeFileSync(ISLAMIC_STATE_FILE, JSON.stringify(state), 'utf-8');
    } catch (error) {
        console.error('❌ خطأ في حفظ حالة القسم الإسلامي:', error.message);
    }
}

function loadSectionsState() {
    try {
        if (fs.existsSync(SECTIONS_STATE_FILE)) {
            const data = fs.readFileSync(SECTIONS_STATE_FILE, 'utf-8');
            sectionsState = JSON.parse(data);
            return sectionsState;
        }
    } catch (error) {
        console.log('⚠️ خطأ في قراءة حالة الأقسام');
    }
    return sectionsState;
}

function saveSectionsState() {
    try {
        fs.writeFileSync(SECTIONS_STATE_FILE, JSON.stringify(sectionsState, null, 2), 'utf-8');
    } catch (error) {
        console.error('❌ خطأ في حفظ حالة الأقسام:', error.message);
    }
}

loadIslamicState();
loadSectionsState();

// ═══════════════════════════════════════════════════════════
// 📤 دوال إرسال الأذكار
// ═══════════════════════════════════════════════════════════

async function sendMorningThikr(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        
        if (!targetGroup) {
            console.log('⚠️ لم يتم تحديد ISLAMIC_GROUP_ID');
            return;
        }
        
        if (!sectionsState.athkar.enabled) {
            console.log('⏸️ الأذكار معطّلة');
            return;
        }
        
        const thikr = MORNING_EVENING_ATHKAR[currentThikrIndex];
        const thikrText = thikr.evening ? thikr.text : thikr.text;
        
        let message = `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

🕌 *ذكر الصباح* 

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

${thikrText}`;

        if (thikr.repeat) {
            message += `\n\n_يُقال ${thikr.repeat} مرة_`;
        }

        if (thikr.reward) {
            message += `\n\n${thikr.reward}`;
        }

        message += `\n\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`;

        await sock.sendMessage(targetGroup, { text: message });
        
        console.log(`✅ تم إرسال ذكر الصباح #${currentThikrIndex + 1}`);
        
        currentThikrIndex++;
        if (currentThikrIndex >= MORNING_EVENING_ATHKAR.length) {
            currentThikrIndex = 0;
        }
        saveIslamicState();
        
    } catch (error) {
        console.error('❌ خطأ في إرسال ذكر الصباح:', error.message);
    }
}

async function sendEveningThikr(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        
        if (!targetGroup) {
            console.log('⚠️ لم يتم تحديد ISLAMIC_GROUP_ID');
            return;
        }
        
        if (!sectionsState.athkar.enabled) {
            console.log('⏸️ الأذكار معطّلة');
            return;
        }
        
        const thikr = MORNING_EVENING_ATHKAR[currentThikrIndex];
        const thikrText = thikr.evening || thikr.text;
        
        let message = `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

🕌 *ذكر المساء*

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

${thikrText}`;

        if (thikr.repeat) {
            message += `\n\n_يُقال ${thikr.repeat} مرة_`;
        }

        if (thikr.reward) {
            message += `\n\n${thikr.reward}`;
        }

        message += `\n\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`;

        await sock.sendMessage(targetGroup, { text: message });
        
        console.log(`✅ تم إرسال ذكر المساء #${currentThikrIndex + 1}`);
        
        currentThikrIndex++;
        if (currentThikrIndex >= MORNING_EVENING_ATHKAR.length) {
            currentThikrIndex = 0;
        }
        saveIslamicState();
        
    } catch (error) {
        console.error('❌ خطأ في إرسال ذكر المساء:', error.message);
    }
}

// ═══════════════════════════════════════════════════════════
// 📚 دوال إرسال الفتاوى
// ═══════════════════════════════════════════════════════════

async function sendFatwa(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        
        if (!targetGroup) {
            console.log('⚠️ لم يتم تحديد ISLAMIC_GROUP_ID');
            return;
        }
        
        if (!sectionsState.fatawa.enabled) {
            console.log('⏸️ الفتاوى معطّلة');
            return;
        }
        
        console.log('\n📚 جاري جلب فتوى من موقع ابن باز...');
        
        const fatwa = await fetchRandomFatwa();
        const message = formatFatwaMessage(fatwa);
        
        await sock.sendMessage(targetGroup, { text: message });
        
        const extraQs = fatwa.additionalQuestions ? ` (+${fatwa.additionalQuestions.length} سؤال إضافي)` : '';
        console.log(`✅ تم إرسال فتوى #${fatwa.id}: ${fatwa.title.substring(0, 50)}...${extraQs}`);
        console.log(`📝 الأسئلة: ${fatwa.question ? 'رئيسي' : 'بدون'}${extraQs}\n`);
        
    } catch (error) {
        console.error('❌ خطأ في إرسال الفتوى:', error.message);
    }
}

// ═══════════════════════════════════════════════════════════
// 🕋 دوال إرسال المحاضرات (الفقه والموضوعية)
// ═══════════════════════════════════════════════════════════

function getAllLecturesFromContent(section) {
    const lectures = [];
    
    if (section === 'fiqh') {
        const fiqh = ISLAMIC_CONTENT.fiqh;
        for (const subsectionKey in fiqh.subsections) {
            const subsection = fiqh.subsections[subsectionKey];
            for (const topicKey in subsection.topics) {
                const topic = subsection.topics[topicKey];
                for (const categoryKey in topic.categories) {
                    const category = topic.categories[categoryKey];
                    if (category.items && category.items.length > 0) {
                        lectures.push(...category.items);
                    }
                }
            }
        }
    } else if (section === 'mawdooiya') {
        const maw = ISLAMIC_CONTENT.mawdooiya;
        for (const topicKey in maw.topics) {
            const topic = maw.topics[topicKey];
            if (topic.items && topic.items.length > 0) {
                lectures.push(...topic.items);
            }
        }
    }
    
    return lectures;
}

async function sendScheduledLecture(sock, section) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        
        if (!targetGroup) {
            console.log('⚠️ لم يتم تحديد ISLAMIC_GROUP_ID');
            return;
        }
        
        if (!sectionsState[section].enabled) {
            console.log(`⏸️ ${section} معطّل`);
            return;
        }
        
        const lectures = getAllLecturesFromContent(section);
        
        if (lectures.length === 0) {
            console.log(`⚠️ لا توجد محاضرات متاحة في ${section}`);
            return;
        }
        
        // الحصول على المحاضرة التالية
        const currentIndex = lectureIndex[section] || 0;
        const lecture = lectures[currentIndex];
        
        console.log(`\n🕋 جاري جلب محاضرة من ${section}...`);
        console.log(`📖 ${lecture.title}`);
        
        // جلب محتوى المحاضرة
        const content = await fetchLectureContent(lecture.pageUrl);
        const message = formatLecture(content, lecture.audioUrl);
        
        // إرسال المحاضرة مع زر الصوت
        await sock.sendMessage(targetGroup, {
            text: message,
            footer: 'اضغط الزر للاستماع',
            buttons: [
                {
                    buttonId: `audio_${lecture.id}`,
                    buttonText: { displayText: '🎧 تحميل الصوت' },
                    type: 1
                }
            ],
            headerType: 1
        });
        
        console.log(`✅ تم إرسال محاضرة: ${lecture.title}`);
        
        // تحديث الفهرس
        lectureIndex[section] = (currentIndex + 1) % lectures.length;
        
    } catch (error) {
        console.error(`❌ خطأ في إرسال محاضرة ${section}:`, error.message);
    }
}

// ═══════════════════════════════════════════════════════════
// ⏰ دوال الجدولة
// ═══════════════════════════════════════════════════════════

function startAthkarSchedule(sock) {
    stopAthkarSchedule();
    
    // الصباح: 6:50 و 7:00
    morningJob1 = cron.schedule('50 6 * * *', () => sendMorningThikr(sock), { timezone: "Africa/Cairo" });
    morningJob2 = cron.schedule('0 7 * * *', () => sendMorningThikr(sock), { timezone: "Africa/Cairo" });
    
    // المساء: 3:50 و 4:00
    eveningJob1 = cron.schedule('50 15 * * *', () => sendEveningThikr(sock), { timezone: "Africa/Cairo" });
    eveningJob2 = cron.schedule('0 16 * * *', () => sendEveningThikr(sock), { timezone: "Africa/Cairo" });
    
    console.log('✅ تم جدولة الأذكار:');
    console.log('   🌅 الصباح: 6:50 ص و 7:00 ص');
    console.log('   🌇 المساء: 3:50 م و 4:00 م');
}

function stopAthkarSchedule() {
    if (morningJob1) morningJob1.stop();
    if (morningJob2) morningJob2.stop();
    if (eveningJob1) eveningJob1.stop();
    if (eveningJob2) eveningJob2.stop();
}

function startFatawaSchedule(sock) {
    stopFatawaSchedule();
    
    // يومياً 12:00 ظهراً
    fatwaJob = cron.schedule('0 12 * * *', () => sendFatwa(sock), { timezone: "Africa/Cairo" });
    
    console.log('✅ تم جدولة الفتاوى: 12:00 ظهراً يومياً');
}

function stopFatawaSchedule() {
    if (fatwaJob) fatwaJob.stop();
}

function startFiqhSchedule(sock) {
    stopFiqhSchedule();
    
    // كل ساعة
    fiqhJob = cron.schedule('0 * * * *', () => sendScheduledLecture(sock, 'fiqh'), { timezone: "Africa/Cairo" });
    
    console.log('✅ تم جدولة الفقه: كل ساعة');
}

function stopFiqhSchedule() {
    if (fiqhJob) fiqhJob.stop();
}

function startMawdooiyaSchedule(sock) {
    stopMawdooiyaSchedule();
    
    // كل ساعة
    mawdooiyaJob = cron.schedule('0 * * * *', () => sendScheduledLecture(sock, 'mawdooiya'), { timezone: "Africa/Cairo" });
    
    console.log('✅ تم جدولة الموضوعية: كل ساعة');
}

function stopMawdooiyaSchedule() {
    if (mawdooiyaJob) mawdooiyaJob.stop();
}

function startIslamicSchedule(sock) {
    console.log('\n⏰ بدء جدولة القسم الإسلامي...\n');
    
    if (sectionsState.athkar.enabled) {
        startAthkarSchedule(sock);
    }
    
    if (sectionsState.fatawa.enabled) {
        startFatawaSchedule(sock);
    }
    
    if (sectionsState.fiqh.enabled) {
        startFiqhSchedule(sock);
    }
    
    if (sectionsState.mawdooiya.enabled) {
        startMawdooiyaSchedule(sock);
    }
}

function stopIslamicSchedule() {
    console.log('⏸️ تم إيقاف جدولة القسم الإسلامي');
    stopAthkarSchedule();
    stopFatawaSchedule();
    stopFiqhSchedule();
    stopMawdooiyaSchedule();
}

// ═══════════════════════════════════════════════════════════
// 🎛️ معالجة الأوامر
// ═══════════════════════════════════════════════════════════

async function handleIslamicCommand(sock, msg, messageText, sender) {
    const isAdmin = sender.includes('249962204268') || sender.includes('231211024814174') || msg.key.fromMe;
    
    if (!isAdmin) return false;
    
    const command = messageText.trim();
    
    // تفعيل القسم الإسلامي الرئيسي
    if (command === '/اسلام') {
        ISLAMIC_MODULE_ENABLED = true;
        saveIslamicState();
        
        if (!sectionsState.athkar.enabled && !sectionsState.fatawa.enabled && 
            !sectionsState.fiqh.enabled && !sectionsState.mawdooiya.enabled) {
            
            await sock.sendMessage(sender, {
                text: `🕌 *القسم الإسلامي*

اختر من القائمة:

1️⃣ /اسلام_اذكار - تفعيل الأذكار
2️⃣ /اسلام_فتاوى - تفعيل الفتاوى  
3️⃣ /اسلام_فقه - تفعيل الفقه
4️⃣ /اسلام_موضوعية - تفعيل الموضوعية

📊 /اسلام_حالة - عرض الحالة`
            }, { quoted: msg });
        } else {
            startIslamicSchedule(sock);
            await sock.sendMessage(sender, {
                text: '✅ تم تفعيل القسم الإسلامي'
            }, { quoted: msg });
        }
        
        console.log('✅ تم تفعيل القسم الإسلامي');
        return true;
    }
    
    // إيقاف القسم الإسلامي
    if (command === '/اسلام_ايقاف') {
        ISLAMIC_MODULE_ENABLED = false;
        saveIslamicState();
        stopIslamicSchedule();
        
        await sock.sendMessage(sender, {
            text: '⏸️ تم إيقاف القسم الإسلامي'
        }, { quoted: msg });
        
        console.log('⏸️ تم إيقاف القسم الإسلامي');
        return true;
    }
    
    // تفعيل الأذكار
    if (command === '/اسلام_اذكار') {
        sectionsState.athkar.enabled = true;
        saveSectionsState();
        startAthkarSchedule(sock);
        
        await sock.sendMessage(sender, {
            text: '✅ تم تفعيل الأذكار\n\n🌅 الصباح: 6:50 ص و 7:00 ص\n🌇 المساء: 3:50 م و 4:00 م'
        }, { quoted: msg });
        
        console.log('✅ تم تفعيل الأذكار');
        return true;
    }
    
    // إيقاف الأذكار
    if (command === '/اسلام_اذكار_ايقاف') {
        sectionsState.athkar.enabled = false;
        saveSectionsState();
        stopAthkarSchedule();
        
        await sock.sendMessage(sender, {
            text: '⏸️ تم إيقاف الأذكار'
        }, { quoted: msg });
        
        console.log('⏸️ تم إيقاف الأذكار');
        return true;
    }
    
    // تفعيل الفتاوى
    if (command === '/اسلام_فتاوى') {
        sectionsState.fatawa.enabled = true;
        saveSectionsState();
        startFatawaSchedule(sock);
        
        await sock.sendMessage(sender, {
            text: '✅ تم تفعيل الفتاوى\n\n📚 يومياً: 12:00 ظهراً'
        }, { quoted: msg });
        
        console.log('✅ تم تفعيل الفتاوى');
        return true;
    }
    
    // إيقاف الفتاوى
    if (command === '/اسلام_فتاوى_ايقاف') {
        sectionsState.fatawa.enabled = false;
        saveSectionsState();
        stopFatawaSchedule();
        
        await sock.sendMessage(sender, {
            text: '⏸️ تم إيقاف الفتاوى'
        }, { quoted: msg });
        
        console.log('⏸️ تم إيقاف الفتاوى');
        return true;
    }
    
    // تفعيل الفقه
    if (command === '/اسلام_فقه') {
        sectionsState.fiqh.enabled = true;
        saveSectionsState();
        startFiqhSchedule(sock);
        
        await sock.sendMessage(sender, {
            text: '✅ تم تفعيل الفقه\n\n🕋 كل ساعة'
        }, { quoted: msg });
        
        console.log('✅ تم تفعيل الفقه');
        return true;
    }
    
    // إيقاف الفقه
    if (command === '/اسلام_فقه_ايقاف') {
        sectionsState.fiqh.enabled = false;
        saveSectionsState();
        stopFiqhSchedule();
        
        await sock.sendMessage(sender, {
            text: '⏸️ تم إيقاف الفقه'
        }, { quoted: msg });
        
        console.log('⏸️ تم إيقاف الفقه');
        return true;
    }
    
    // تفعيل الموضوعية
    if (command === '/اسلام_موضوعية') {
        sectionsState.mawdooiya.enabled = true;
        saveSectionsState();
        startMawdooiyaSchedule(sock);
        
        await sock.sendMessage(sender, {
            text: '✅ تم تفعيل الموضوعية\n\n📖 كل ساعة'
        }, { quoted: msg });
        
        console.log('✅ تم تفعيل الموضوعية');
        return true;
    }
    
    // إيقاف الموضوعية
    if (command === '/اسلام_موضوعية_ايقاف') {
        sectionsState.mawdooiya.enabled = false;
        saveSectionsState();
        stopMawdooiyaSchedule();
        
        await sock.sendMessage(sender, {
            text: '⏸️ تم إيقاف الموضوعية'
        }, { quoted: msg });
        
        console.log('⏸️ تم إيقاف الموضوعية');
        return true;
    }
    
    // عرض الحالة
    if (command === '/اسلام_حالة') {
        const status = `🕌 *حالة القسم الإسلامي*

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

القسم الرئيسي: ${ISLAMIC_MODULE_ENABLED ? '✅ مفعّل' : '❌ معطّل'}

الأقسام الفرعية:
• الأذكار: ${sectionsState.athkar.enabled ? '✅ مفعّل' : '❌ معطّل'}
• الفتاوى: ${sectionsState.fatawa.enabled ? '✅ مفعّل' : '❌ معطّل'}
• الفقه: ${sectionsState.fiqh.enabled ? '✅ مفعّل' : '❌ معطّل'}
• الموضوعية: ${sectionsState.mawdooiya.enabled ? '✅ مفعّل' : '❌ معطّل'}

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

الجدولة:
🌅 الأذكار الصباحية: 6:50 ص و 7:00 ص
🌇 الأذكار المسائية: 3:50 م و 4:00 م
📚 الفتاوى: 12:00 ظهراً يومياً
🕋 الفقه: كل ساعة
📖 الموضوعية: كل ساعة`;
        
        await sock.sendMessage(sender, { text: status }, { quoted: msg });
        return true;
    }
    
    // أوامر إرسال فوري
    if (command === '/ذكر_صباح') {
        await sendMorningThikr(sock);
        return true;
    }
    
    if (command === '/ذكر_مساء') {
        await sendEveningThikr(sock);
        return true;
    }
    
    if (command === '/فتوى') {
        await sendFatwa(sock);
        return true;
    }
    
    if (command === '/اسلام_اعادة') {
        currentThikrIndex = 0;
        saveIslamicState();
        await sock.sendMessage(sender, {
            text: '✅ تم إعادة ترتيب الأذكار'
        }, { quoted: msg });
        console.log('✅ تم إعادة ترتيب الأذكار');
        return true;
    }
    
    return false;
}

// ═══════════════════════════════════════════════════════════
// 📤 Exports
// ═══════════════════════════════════════════════════════════

module.exports = {
    handleIslamicCommand,
    startIslamicSchedule,
    stopIslamicSchedule,
    isEnabled: () => ISLAMIC_MODULE_ENABLED
};


const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { fetchRandomFatwa, formatFatwaMessage } = require('./fatwaModule');
const { ISLAMIC_CONTENT } = require('./islamicContent');
const { fetchLectureContent, formatLecture, downloadAudio } = require('./lectureHandler');

// ═══════════════════════════════════════════════════════════
// 🕌 القسم الإسلامي المتقدم - موقع الشيخ ابن باز رحمه الله
// ═══════════════════════════════════════════════════════════

let ISLAMIC_MODULE_ENABLED = false;

const ISLAMIC_STATE_FILE = path.join(__dirname, 'islamic_state.json');
const SECTIONS_STATE_FILE = path.join(__dirname, 'sections_state.json');

let morningJob1 = null;
let morningJob2 = null;
let eveningJob1 = null;
let eveningJob2 = null;
let fatwaJob = null;
let fiqhJob = null;
let mawdooiyaJob = null;

let sectionsState = {
    athkar: { enabled: false },
    fatawa: { enabled: false },
    fiqh: { enabled: false },
    mawdooiya: { enabled: false }
};

let lectureIndex = {
    fiqh: 0,
    mawdooiya: 0
};

// تخزين مؤقت للملفات الصوتية التي تم طلبها
const audioRequests = new Map();

// ═══════════════════════════════════════════════════════════
// 📚 الأذكار
// ═══════════════════════════════════════════════════════════

const MORNING_EVENING_ATHKAR = [
    {
        text: `أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ

رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ

رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ`,
        evening: `أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ...`
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
// 🕋 دوال إرسال المحاضرات
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
        
        const currentIndex = lectureIndex[section] || 0;
        const lecture = lectures[currentIndex];
        
        console.log(`\n🕋 جاري جلب محاضرة من ${section}...`);
        console.log(`📖 ${lecture.title}`);
        
        const content = await fetchLectureContent(lecture.pageUrl);
        const message = formatLecture(content, lecture.audioUrl);
        
        // حفظ معلومات الصوت
        audioRequests.set(lecture.id, {
            audioUrl: lecture.audioUrl,
            title: lecture.title,
            timestamp: Date.now()
        });
        
        // إرسال مع زر الصوت
        await sock.sendMessage(targetGroup, {
            text: message,
            footer: 'اضغط للاستماع',
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
        
        lectureIndex[section] = (currentIndex + 1) % lectures.length;
        
    } catch (error) {
        console.error(`❌ خطأ في إرسال محاضرة ${section}:`, error.message);
    }
}

// ═══════════════════════════════════════════════════════════
// 🎛️ معالج الأزرار التفاعلية
// ═══════════════════════════════════════════════════════════

async function handleButtonResponse(sock, msg) {
    try {
        const buttonId = msg.message?.buttonsResponseMessage?.selectedButtonId;
        
        if (!buttonId) return false;
        
        console.log(`🔘 تم الضغط على زر: ${buttonId}`);
        
        // معالجة زر الصوت
        if (buttonId.startsWith('audio_')) {
            const lectureId = buttonId.replace('audio_', '');
            const audioInfo = audioRequests.get(lectureId);
            
            if (!audioInfo) {
                await sock.sendMessage(msg.key.remoteJid, {
                    text: '⚠️ انتهت صلاحية هذا الطلب'
                }, { quoted: msg });
                return true;
            }
            
            console.log(`📥 جاري تحميل الصوت: ${audioInfo.title}...`);
            
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
                
                // حذف من الذاكرة
                audioRequests.delete(lectureId);
                
            } catch (error) {
                console.error('❌ خطأ في تحميل الصوت:', error.message);
                await sock.sendMessage(msg.key.remoteJid, {
                    text: '❌ عذراً، فشل تحميل الملف الصوتي'
                }, { quoted: msg });
            }
            
            return true;
        }
        
        // يمكن إضافة أزرار أخرى هنا
        
        return false;
        
    } catch (error) {
        console.error('❌ خطأ في معالجة الزر:', error.message);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════
// 📋 دوال القوائم المنسدلة
// ═══════════════════════════════════════════════════════════

async function sendMainMenu(sock, sender, msg) {
    const menu = {
        text: `🕌 *القسم الإسلامي*

مرحباً بك في القسم الإسلامي من موقع الشيخ ابن باز رحمه الله

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

*الأقسام المتاحة:*

🕌 الأذكار - أذكار الصباح والمساء
📚 الفتاوى - فتاوى متنوعة يومياً
⚖️ الفقه - محاضرات فقهية
📖 الموضوعية - مواضيع متنوعة

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

*الأوامر السريعة:*
/اسلام_حالة - عرض الحالة
/ذكر_صباح - ذكر الآن
/فتوى - فتوى الآن
/فقه - محاضرة فقه الآن`,
        footer: 'اختر قسماً للتحكم',
        title: 'القسم الإسلامي',
        buttonText: 'اختر قسم',
        sections: [
            {
                title: 'التحكم بالأقسام',
                rows: [
                    {
                        title: '🕌 تفعيل الأذكار',
                        rowId: 'enable_athkar',
                        description: 'أذكار الصباح والمساء'
                    },
                    {
                        title: '📚 تفعيل الفتاوى',
                        rowId: 'enable_fatawa',
                        description: 'فتوى يومياً'
                    },
                    {
                        title: '⚖️ تفعيل الفقه',
                        rowId: 'enable_fiqh',
                        description: 'محاضرات كل ساعة'
                    },
                    {
                        title: '📖 تفعيل الموضوعية',
                        rowId: 'enable_mawdooiya',
                        description: 'مواضيع كل ساعة'
                    }
                ]
            },
            {
                title: 'الإيقاف',
                rows: [
                    {
                        title: '⏸️ إيقاف الأذكار',
                        rowId: 'disable_athkar',
                        description: 'إيقاف أذكار الصباح والمساء'
                    },
                    {
                        title: '⏸️ إيقاف الفتاوى',
                        rowId: 'disable_fatawa',
                        description: 'إيقاف الفتاوى اليومية'
                    },
                    {
                        title: '⏸️ إيقاف الفقه',
                        rowId: 'disable_fiqh',
                        description: 'إيقاف محاضرات الفقه'
                    },
                    {
                        title: '⏸️ إيقاف الموضوعية',
                        rowId: 'disable_mawdooiya',
                        description: 'إيقاف الموضوعية'
                    }
                ]
            },
            {
                title: 'إرسال فوري',
                rows: [
                    {
                        title: '🌅 ذكر صباح الآن',
                        rowId: 'send_morning',
                        description: 'إرسال ذكر صباح فوراً'
                    },
                    {
                        title: '🌇 ذكر مساء الآن',
                        rowId: 'send_evening',
                        description: 'إرسال ذكر مساء فوراً'
                    },
                    {
                        title: '📚 فتوى الآن',
                        rowId: 'send_fatwa',
                        description: 'إرسال فتوى عشوائية'
                    },
                    {
                        title: '🕋 محاضرة فقه الآن',
                        rowId: 'send_fiqh',
                        description: 'إرسال محاضرة فقه'
                    },
                    {
                        title: '📖 محاضرة موضوعية الآن',
                        rowId: 'send_mawdooiya',
                        description: 'إرسال محاضرة موضوعية'
                    }
                ]
            },
            {
                title: 'أخرى',
                rows: [
                    {
                        title: '📊 عرض الحالة',
                        rowId: 'show_status',
                        description: 'حالة جميع الأقسام'
                    },
                    {
                        title: '🔄 إعادة ترتيب الأذكار',
                        rowId: 'reset_athkar',
                        description: 'البدء من أول ذكر'
                    }
                ]
            }
        ]
    };
    
    await sock.sendMessage(sender, menu, { quoted: msg });
}

async function handleListResponse(sock, msg) {
    try {
        const listResponse = msg.message?.listResponseMessage;
        
        if (!listResponse) return false;
        
        const rowId = listResponse.singleSelectReply?.selectedRowId;
        
        if (!rowId) return false;
        
        console.log(`📋 تم اختيار: ${rowId}`);
        
        const sender = msg.key.remoteJid;
        
        // معالجة الاختيارات
        switch(rowId) {
            case 'enable_athkar':
                sectionsState.athkar.enabled = true;
                saveSectionsState();
                startAthkarSchedule(sock);
                await sock.sendMessage(sender, {
                    text: '✅ تم تفعيل الأذكار\n\n🌅 الصباح: 6:50 ص و 7:00 ص\n🌇 المساء: 3:50 م و 4:00 م'
                }, { quoted: msg });
                break;
                
            case 'enable_fatawa':
                sectionsState.fatawa.enabled = true;
                saveSectionsState();
                startFatawaSchedule(sock);
                await sock.sendMessage(sender, {
                    text: '✅ تم تفعيل الفتاوى\n\n📚 يومياً: 12:00 ظهراً'
                }, { quoted: msg });
                break;
                
            case 'enable_fiqh':
                sectionsState.fiqh.enabled = true;
                saveSectionsState();
                startFiqhSchedule(sock);
                await sock.sendMessage(sender, {
                    text: '✅ تم تفعيل الفقه\n\n🕋 كل ساعة'
                }, { quoted: msg });
                break;
                
            case 'enable_mawdooiya':
                sectionsState.mawdooiya.enabled = true;
                saveSectionsState();
                startMawdooiyaSchedule(sock);
                await sock.sendMessage(sender, {
                    text: '✅ تم تفعيل الموضوعية\n\n📖 كل ساعة'
                }, { quoted: msg });
                break;
                
            case 'disable_athkar':
                sectionsState.athkar.enabled = false;
                saveSectionsState();
                stopAthkarSchedule();
                await sock.sendMessage(sender, {
                    text: '⏸️ تم إيقاف الأذكار'
                }, { quoted: msg });
                break;
                
            case 'disable_fatawa':
                sectionsState.fatawa.enabled = false;
                saveSectionsState();
                stopFatawaSchedule();
                await sock.sendMessage(sender, {
                    text: '⏸️ تم إيقاف الفتاوى'
                }, { quoted: msg });
                break;
                
            case 'disable_fiqh':
                sectionsState.fiqh.enabled = false;
                saveSectionsState();
                stopFiqhSchedule();
                await sock.sendMessage(sender, {
                    text: '⏸️ تم إيقاف الفقه'
                }, { quoted: msg });
                break;
                
            case 'disable_mawdooiya':
                sectionsState.mawdooiya.enabled = false;
                saveSectionsState();
                stopMawdooiyaSchedule();
                await sock.sendMessage(sender, {
                    text: '⏸️ تم إيقاف الموضوعية'
                }, { quoted: msg });
                break;
                
            case 'send_morning':
                await sendMorningThikr(sock);
                break;
                
            case 'send_evening':
                await sendEveningThikr(sock);
                break;
                
            case 'send_fatwa':
                await sendFatwa(sock);
                break;
                
            case 'send_fiqh':
                await sendScheduledLecture(sock, 'fiqh');
                break;
                
            case 'send_mawdooiya':
                await sendScheduledLecture(sock, 'mawdooiya');
                break;
                
            case 'show_status':
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
                break;
                
            case 'reset_athkar':
                currentThikrIndex = 0;
                saveIslamicState();
                await sock.sendMessage(sender, {
                    text: '✅ تم إعادة ترتيب الأذكار'
                }, { quoted: msg });
                break;
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ خطأ في معالجة القائمة:', error.message);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════
// ⏰ دوال الجدولة
// ═══════════════════════════════════════════════════════════

function startAthkarSchedule(sock) {
    stopAthkarSchedule();
    morningJob1 = cron.schedule('50 6 * * *', () => sendMorningThikr(sock), { timezone: "Africa/Cairo" });
    morningJob2 = cron.schedule('0 7 * * *', () => sendMorningThikr(sock), { timezone: "Africa/Cairo" });
    eveningJob1 = cron.schedule('50 15 * * *', () => sendEveningThikr(sock), { timezone: "Africa/Cairo" });
    eveningJob2 = cron.schedule('0 16 * * *', () => sendEveningThikr(sock), { timezone: "Africa/Cairo" });
    console.log('✅ تم جدولة الأذكار');
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
    console.log('✅ تم جدولة الفتاوى: 12:00 ظهراً يومياً');
}

function stopFatawaSchedule() {
    if (fatwaJob) fatwaJob.stop();
}

function startFiqhSchedule(sock) {
    stopFiqhSchedule();
    fiqhJob = cron.schedule('0 * * * *', () => sendScheduledLecture(sock, 'fiqh'), { timezone: "Africa/Cairo" });
    console.log('✅ تم جدولة الفقه: كل ساعة');
}

function stopFiqhSchedule() {
    if (fiqhJob) fiqhJob.stop();
}

function startMawdooiyaSchedule(sock) {
    stopMawdooiyaSchedule();
    mawdooiyaJob = cron.schedule('0 * * * *', () => sendScheduledLecture(sock, 'mawdooiya'), { timezone: "Africa/Cairo" });
    console.log('✅ تم جدولة الموضوعية: كل ساعة');
}

function stopMawdooiyaSchedule() {
    if (mawdooiyaJob) mawdooiyaJob.stop();
}

function startIslamicSchedule(sock) {
    console.log('\n⏰ بدء جدولة القسم الإسلامي...\n');
    if (sectionsState.athkar.enabled) startAthkarSchedule(sock);
    if (sectionsState.fatawa.enabled) startFatawaSchedule(sock);
    if (sectionsState.fiqh.enabled) startFiqhSchedule(sock);
    if (sectionsState.mawdooiya.enabled) startMawdooiyaSchedule(sock);
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
    
    // معالجة الأزرار والقوائم
    if (msg.message?.buttonsResponseMessage) {
        return await handleButtonResponse(sock, msg);
    }
    
    if (msg.message?.listResponseMessage) {
        return await handleListResponse(sock, msg);
    }
    
    const command = messageText.trim();
    
    // القائمة الرئيسية
    if (command === '/اسلام') {
        await sendMainMenu(sock, sender, msg);
        ISLAMIC_MODULE_ENABLED = true;
        saveIslamicState();
        console.log('✅ تم عرض القائمة الرئيسية');
        return true;
    }
    
    // باقي الأوامر النصية (للتوافق)
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
    
    if (command === '/فقه') {
        await sendScheduledLecture(sock, 'fiqh');
        return true;
    }
    
    if (command === '/موضوعية') {
        await sendScheduledLecture(sock, 'mawdooiya');
        return true;
    }
    
    if (command === '/اسلام_اعادة') {
        currentThikrIndex = 0;
        saveIslamicState();
        await sock.sendMessage(sender, {
            text: '✅ تم إعادة ترتيب الأذكار'
        }, { quoted: msg });
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

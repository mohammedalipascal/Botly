const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { generateWAMessageFromContent, proto } = require('@whiskeysockets/baileys');
const { fetchRandomFatwa, formatFatwaMessage } = require('./fatwaModule');
const { ISLAMIC_CONTENT } = require('./islamicContent');
const { fetchLectureContent, formatLecture, downloadAudio } = require('./lectureHandler');

// ═══════════════════════════════════════════════════════════
// 🕌 القسم الإسلامي - مع أزرار حقيقية
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

const audioRequests = new Map();

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

// دوال الإرسال
async function sendMorningThikr(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        if (!targetGroup || !sectionsState.athkar.enabled) return;
        
        const thikr = MORNING_EVENING_ATHKAR[currentThikrIndex];
        const thikrText = thikr.text;
        
        let message = `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

🕌 *ذكر الصباح*

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

${thikrText}`;

        if (thikr.repeat) message += `\n\n_يُقال ${thikr.repeat} مرة_`;
        if (thikr.reward) message += `\n\n${thikr.reward}`;
        message += `\n\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`;

        await sock.sendMessage(targetGroup, { text: message });
        console.log(`✅ تم إرسال ذكر الصباح #${currentThikrIndex + 1}`);
        
        currentThikrIndex++;
        if (currentThikrIndex >= MORNING_EVENING_ATHKAR.length) currentThikrIndex = 0;
        saveIslamicState();
    } catch (error) {
        console.error('❌ خطأ في إرسال ذكر الصباح:', error.message);
    }
}

async function sendEveningThikr(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        if (!targetGroup || !sectionsState.athkar.enabled) return;
        
        const thikr = MORNING_EVENING_ATHKAR[currentThikrIndex];
        const thikrText = thikr.evening || thikr.text;
        
        let message = `┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

🕌 *ذكر المساء*

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

${thikrText}`;

        if (thikr.repeat) message += `\n\n_يُقال ${thikr.repeat} مرة_`;
        if (thikr.reward) message += `\n\n${thikr.reward}`;
        message += `\n\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈`;

        await sock.sendMessage(targetGroup, { text: message });
        console.log(`✅ تم إرسال ذكر المساء #${currentThikrIndex + 1}`);
        
        currentThikrIndex++;
        if (currentThikrIndex >= MORNING_EVENING_ATHKAR.length) currentThikrIndex = 0;
        saveIslamicState();
    } catch (error) {
        console.error('❌ خطأ في إرسال ذكر المساء:', error.message);
    }
}

async function sendFatwa(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        if (!targetGroup || !sectionsState.fatawa.enabled) return;
        
        console.log('\n📚 جاري جلب فتوى من موقع ابن باز...');
        
        const fatwa = await fetchRandomFatwa();
        const message = formatFatwaMessage(fatwa);
        
        await sock.sendMessage(targetGroup, { text: message });
        
        const extraQs = fatwa.additionalQuestions ? ` (+${fatwa.additionalQuestions.length} سؤال إضافي)` : '';
        console.log(`✅ تم إرسال فتوى #${fatwa.id}: ${fatwa.title.substring(0, 50)}...${extraQs}\n`);
    } catch (error) {
        console.error('❌ خطأ في إرسال الفتوى:', error.message);
    }
}

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
        if (!targetGroup || !sectionsState[section].enabled) return;
        
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
        
        audioRequests.set(lecture.id, {
            audioUrl: lecture.audioUrl,
            title: lecture.title,
            timestamp: Date.now()
        });
        
        // ⭐ إرسال مع زر الصوت - الطريقة الصحيحة باستخدام proto
        try {
            const msg = generateWAMessageFromContent(targetGroup, {
                viewOnceMessage: {
                    message: {
                        messageContextInfo: {
                            deviceListMetadata: {},
                            deviceListMetadataVersion: 2
                        },
                        interactiveMessage: proto.Message.InteractiveMessage.create({
                            body: proto.Message.InteractiveMessage.Body.create({
                                text: message
                            }),
                            footer: proto.Message.InteractiveMessage.Footer.create({
                                text: "اضغط الزر للاستماع"
                            }),
                            header: proto.Message.InteractiveMessage.Header.create({
                                title: `🕋 ${content.title}`,
                                hasMediaAttachment: false
                            }),
                            nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                                buttons: [
                                    {
                                        name: "quick_reply",
                                        buttonParamsJson: JSON.stringify({
                                            display_text: "🎧 تحميل الصوت",
                                            id: `audio_${lecture.id}`
                                        })
                                    }
                                ]
                            })
                        })
                    }
                }
            }, {});
            
            await sock.relayMessage(targetGroup, msg.message, { messageId: msg.key.id });
            
            console.log(`✅ تم إرسال محاضرة مع زر: ${lecture.title}`);
        } catch (btnError) {
            // Fallback: إرسال بدون أزرار
            console.log('⚠️ فشل إرسال الأزرار، إرسال عادي...');
            await sock.sendMessage(targetGroup, { text: message + `\n\n_اكتب: صوت - للحصول على الملف الصوتي_` });
        }
        
        lectureIndex[section] = (currentIndex + 1) % lectures.length;
        
    } catch (error) {
        console.error(`❌ خطأ في إرسال محاضرة ${section}:`, error.message);
    }
}

// معالج الأزرار (من InteractiveMessage)
async function handleButtonResponse(sock, msg) {
    try {
        // من InteractiveMessage
        const response = msg.message?.interactiveResponseMessage;
        if (response) {
            const buttonId = response.nativeFlowResponseMessage?.paramsJson;
            if (buttonId) {
                const parsed = JSON.parse(buttonId);
                const id = parsed.id;
                
                console.log(`🔘 تم الضغط على زر: ${id}`);
                
                if (id && id.startsWith('audio_')) {
                    const lectureId = id.replace('audio_', '');
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
                        audioRequests.delete(lectureId);
                        
                    } catch (error) {
                        console.error('❌ خطأ في تحميل الصوت:', error.message);
                        await sock.sendMessage(msg.key.remoteJid, {
                            text: '❌ عذراً، فشل تحميل الملف الصوتي'
                        }, { quoted: msg });
                    }
                    
                    return true;
                }
            }
        }
        
        // Fallback: الطريقة القديمة للأزرار
        const buttonResponse = msg.message?.buttonsResponseMessage;
        if (buttonResponse) {
            const buttonId = buttonResponse.selectedButtonId;
            console.log(`🔘 زر قديم: ${buttonId}`);
            // نفس المعالجة...
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ خطأ في معالجة الزر:', error.message);
        return false;
    }
}

// القائمة المنسدلة بالطريقة الحديثة
async function sendMainMenu(sock, sender, msg) {
    try {
        const menuMsg = generateWAMessageFromContent(sender, {
            viewOnceMessage: {
                message: {
                    messageContextInfo: {
                        deviceListMetadata: {},
                        deviceListMetadataVersion: 2
                    },
                    interactiveMessage: proto.Message.InteractiveMessage.create({
                        body: proto.Message.InteractiveMessage.Body.create({
                            text: `🕌 *القسم الإسلامي*

مرحباً بك في القسم الإسلامي من موقع الشيخ ابن باز رحمه الله

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

*الأقسام المتاحة:*

🕌 الأذكار - أذكار الصباح والمساء
📚 الفتاوى - فتاوى متنوعة يومياً
⚖️ الفقه - محاضرات فقهية
📖 الموضوعية - مواضيع متنوعة

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

اختر من الأزرار أدناه`
                        }),
                        footer: proto.Message.InteractiveMessage.Footer.create({
                            text: "القسم الإسلامي"
                        }),
                        header: proto.Message.InteractiveMessage.Header.create({
                            title: "القائمة الرئيسية",
                            hasMediaAttachment: false
                        }),
                        nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                            buttons: [
                                {
                                    name: "quick_reply",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "🕌 تفعيل الأذكار",
                                        id: "enable_athkar"
                                    })
                                },
                                {
                                    name: "quick_reply",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "📚 تفعيل الفتاوى",
                                        id: "enable_fatawa"
                                    })
                                },
                                {
                                    name: "quick_reply",
                                    buttonParamsJson: JSON.stringify({
                                        display_text: "⚖️ تفعيل الفقه",
                                        id: "enable_fiqh"
                                    })
                                }
                            ]
                        })
                    })
                }
            }
        }, {});
        
        await sock.relayMessage(sender, menuMsg.message, { messageId: menuMsg.key.id });
        console.log('✅ تم إرسال القائمة بأزرار');
        
    } catch (error) {
        console.error('❌ خطأ في إرسال القائمة:', error.message);
        // Fallback: قائمة نصية
        await sock.sendMessage(sender, {
            text: `🕌 *القسم الإسلامي*

اختر بالأرقام:

1️⃣ تفعيل الأذكار
2️⃣ تفعيل الفتاوى
3️⃣ تفعيل الفقه
4️⃣ تفعيل الموضوعية
5️⃣ إيقاف الأذكار
6️⃣ إيقاف الفتاوى
7️⃣ إيقاف الفقه
8️⃣ إيقاف الموضوعية
9️⃣ ذكر صباح الآن
🔟 ذكر مساء الآن
1️⃣1️⃣ فتوى الآن
1️⃣2️⃣ محاضرة فقه الآن
1️⃣3️⃣ محاضرة موضوعية الآن
1️⃣4️⃣ عرض الحالة
1️⃣5️⃣ إعادة ترتيب الأذكار`
        }, { quoted: msg });
    }
}

async function handleMenuChoice(sock, msg, choice, sender) {
    switch(choice) {
        case '1':
        case 'enable_athkar':
            sectionsState.athkar.enabled = true;
            saveSectionsState();
            startAthkarSchedule(sock);
            await sock.sendMessage(sender, {
                text: '✅ تم تفعيل الأذكار\n\n🌅 الصباح: 6:50 ص و 7:00 ص\n🌇 المساء: 3:50 م و 4:00 م'
            }, { quoted: msg });
            break;
            
        case '2':
        case 'enable_fatawa':
            sectionsState.fatawa.enabled = true;
            saveSectionsState();
            startFatawaSchedule(sock);
            await sock.sendMessage(sender, {
                text: '✅ تم تفعيل الفتاوى\n\n📚 يومياً: 12:00 ظهراً'
            }, { quoted: msg });
            break;
            
        case '3':
        case 'enable_fiqh':
            sectionsState.fiqh.enabled = true;
            saveSectionsState();
            startFiqhSchedule(sock);
            await sock.sendMessage(sender, {
                text: '✅ تم تفعيل الفقه\n\n🕋 كل ساعة'
            }, { quoted: msg });
            break;
            
        case '4':
        case 'enable_mawdooiya':
            sectionsState.mawdooiya.enabled = true;
            saveSectionsState();
            startMawdooiyaSchedule(sock);
            await sock.sendMessage(sender, {
                text: '✅ تم تفعيل الموضوعية\n\n📖 كل ساعة'
            }, { quoted: msg });
            break;
            
        case '5':
        case 'disable_athkar':
            sectionsState.athkar.enabled = false;
            saveSectionsState();
            stopAthkarSchedule();
            await sock.sendMessage(sender, { text: '⏸️ تم إيقاف الأذكار' }, { quoted: msg });
            break;
            
        case '6':
        case 'disable_fatawa':
            sectionsState.fatawa.enabled = false;
            saveSectionsState();
            stopFatawaSchedule();
            await sock.sendMessage(sender, { text: '⏸️ تم إيقاف الفتاوى' }, { quoted: msg });
            break;
            
        case '7':
        case 'disable_fiqh':
            sectionsState.fiqh.enabled = false;
            saveSectionsState();
            stopFiqhSchedule();
            await sock.sendMessage(sender, { text: '⏸️ تم إيقاف الفقه' }, { quoted: msg });
            break;
            
        case '8':
        case 'disable_mawdooiya':
            sectionsState.mawdooiya.enabled = false;
            saveSectionsState();
            stopMawdooiyaSchedule();
            await sock.sendMessage(sender, { text: '⏸️ تم إيقاف الموضوعية' }, { quoted: msg });
            break;
            
        case '9':
            await sendMorningThikr(sock);
            break;
            
        case '10':
            await sendEveningThikr(sock);
            break;
            
        case '11':
            await sendFatwa(sock);
            break;
            
        case '12':
            await sendScheduledLecture(sock, 'fiqh');
            break;
            
        case '13':
            await sendScheduledLecture(sock, 'mawdooiya');
            break;
            
        case '14':
            const status = `🕌 *حالة القسم الإسلامي*

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

الأقسام:
• الأذكار: ${sectionsState.athkar.enabled ? '✅ مفعّل' : '❌ معطّل'}
• الفتاوى: ${sectionsState.fatawa.enabled ? '✅ مفعّل' : '❌ معطّل'}
• الفقه: ${sectionsState.fiqh.enabled ? '✅ مفعّل' : '❌ معطّل'}
• الموضوعية: ${sectionsState.mawdooiya.enabled ? '✅ مفعّل' : '❌ معطّل'}

┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈

الجدولة:
🌅 الأذكار: 6:50 ص، 7:00 ص، 3:50 م، 4:00 م
📚 الفتاوى: 12:00 ظهراً يومياً
🕋 الفقه: كل ساعة
📖 الموضوعية: كل ساعة`;
            await sock.sendMessage(sender, { text: status }, { quoted: msg });
            break;
            
        case '15':
            currentThikrIndex = 0;
            saveIslamicState();
            await sock.sendMessage(sender, { text: '✅ تم إعادة ترتيب الأذكار' }, { quoted: msg });
            break;
    }
}

// الجدولة
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
    console.log('✅ تم جدولة الفتاوى');
}

function stopFatawaSchedule() {
    if (fatwaJob) fatwaJob.stop();
}

function startFiqhSchedule(sock) {
    stopFiqhSchedule();
    fiqhJob = cron.schedule('0 * * * *', () => sendScheduledLecture(sock, 'fiqh'), { timezone: "Africa/Cairo" });
    console.log('✅ تم جدولة الفقه');
}

function stopFiqhSchedule() {
    if (fiqhJob) fiqhJob.stop();
}

function startMawdooiyaSchedule(sock) {
    stopMawdooiyaSchedule();
    mawdooiyaJob = cron.schedule('0 * * * *', () => sendScheduledLecture(sock, 'mawdooiya'), { timezone: "Africa/Cairo" });
    console.log('✅ تم جدولة الموضوعية');
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

// معالج الأوامر
async function handleIslamicCommand(sock, msg, messageText, sender) {
    const isAdmin = sender.includes('249962204268') || sender.includes('231211024814174') || msg.key.fromMe;
    
    if (!isAdmin) return false;
    
    // معالجة الأزرار
    if (msg.message?.interactiveResponseMessage || msg.message?.buttonsResponseMessage) {
        return await handleButtonResponse(sock, msg);
    }
    
    const command = messageText.trim();
    
    // القائمة الرئيسية
    if (command === '/اسلام') {
        await sendMainMenu(sock, sender, msg);
        ISLAMIC_MODULE_ENABLED = true;
        saveIslamicState();
        return true;
    }
    
    // معالجة الأرقام
    if (/^[0-9]{1,2}$/.test(command)) {
        await handleMenuChoice(sock, msg, command, sender);
        return true;
    }
    
    // أوامر نصية (للطلب المباشر)
    if (command === 'صوت') {
        // إرسال آخر صوت
        const lastAudio = Array.from(audioRequests.values()).pop();
        if (lastAudio) {
            try {
                await sock.sendMessage(sender, { text: '⏳ جاري تحميل...' }, { quoted: msg });
                const audioBuffer = await downloadAudio(lastAudio.audioUrl);
                await sock.sendMessage(sender, {
                    audio: audioBuffer,
                    mimetype: 'audio/mp3',
                    ptt: false,
                    fileName: `${lastAudio.title.substring(0, 50)}.mp3`
                }, { quoted: msg });
            } catch (error) {
                await sock.sendMessage(sender, { text: '❌ فشل التحميل' }, { quoted: msg });
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

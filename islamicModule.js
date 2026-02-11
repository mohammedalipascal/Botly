const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { fetchRandomFatwa, formatFatwaMessage } = require('./fatwaModule');
const { ISLAMIC_CONTENT } = require('./islamicContent');
const { fetchLectureContent, formatLecture } = require('./lectureHandler');

// القسم الاسلامي - Poll Navigation System

let ISLAMIC_MODULE_ENABLED = false;
const ISLAMIC_STATE_FILE = path.join(__dirname, 'islamic_state.json');
const SECTIONS_STATE_FILE = path.join(__dirname, 'sections_state.json');

let morningJob1 = null, morningJob2 = null, eveningJob1 = null, eveningJob2 = null;
let fatwaJob = null;
const activeLectureJobs = new Map();

// هيكل حالة الاقسام
let sectionsState = {
    athkar: { enabled: false },
    fatawa: { enabled: false },
    fiqh: {
        enabled: false,
        subsections: {
            ibadat: {
                enabled: false,
                topics: {
                    salah: {
                        enabled: false,
                        categories: {
                            hukmSalah: { enabled: false, index: 0 },
                            rukoo: { enabled: false, index: 0 },
                            waqt: { enabled: false, index: 0 },
                            taharah: { enabled: false, index: 0 },
                            satr: { enabled: false, index: 0 },
                            qiblah: { enabled: false, index: 0 },
                            qiyam: { enabled: false, index: 0 },
                            takbeer: { enabled: false, index: 0 },
                            sujoodTilawa: { enabled: false, index: 0 },
                            adhan: { enabled: false, index: 0 }
                        }
                    },
                    janazah: { enabled: false, categories: {} },
                    zakah: { enabled: false, categories: {} },
                    siyam: { enabled: false, categories: {} },
                    hajj: { enabled: false, categories: {} },
                    taharah: { enabled: false, categories: {} },
                    jihad: { enabled: false, categories: {} }
                }
            },
            muamalat: { enabled: false, topics: {} },
            fiqhUsrah: { enabled: false, topics: {} },
            adat: { enabled: false, topics: {} }
        }
    },
    mawdooiya: { enabled: false, topics: {} }
};

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

function loadSectionsState() {
    try {
        if (fs.existsSync(SECTIONS_STATE_FILE)) {
            const loaded = JSON.parse(fs.readFileSync(SECTIONS_STATE_FILE, 'utf-8'));
            sectionsState = { ...sectionsState, ...loaded };
        }
    } catch (error) {
        console.error('خطأ في قراءة حالة الاقسام:', error.message);
    }
}

function saveSectionsState() {
    try {
        fs.writeFileSync(SECTIONS_STATE_FILE, JSON.stringify(sectionsState, null, 2), 'utf-8');
    } catch (error) {
        console.error('خطأ في حفظ حالة الاقسام:', error.message);
    }
}

loadIslamicState();
loadSectionsState();

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

// نظام الـ Poll Navigation
async function sendPollMenu(sock, sender, level, path = []) {
    try {
        let pollName = '';
        let options = [];
        
        if (level === 'main') {
            pollName = 'القسم الاسلامي - اختر';
            options = ['الأذكار', 'الفتاوى', 'الفقه', 'الموضوعية'];
            
            await sock.sendMessage(sender, {
                text: `*القسم الاسلامي*\n\nمرحباً بك في القسم الاسلامي من موقع الشيخ ابن باز رحمه الله\n\nصوّت في الاستطلاع أدناه للاختيار:`
            });
        }
        else if (level === 'fiqh_main') {
            pollName = 'الفقه - اختر القسم';
            options = ['العبادات', 'المعاملات', 'فقه الأسرة', 'العادات'];
        }
        else if (level === 'fiqh_ibadat') {
            pollName = 'العبادات - اختر الموضوع';
            options = [
                'الصلاة',
                'الجنائز',
                'الزكاة',
                'الصيام',
                'الحج والعمرة',
                'الطهارة',
                'الجهاد والسير'
            ];
        }
        else if (level === 'fiqh_ibadat_salah') {
            pollName = 'الصلاة - اختر الموضوع';
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
        else if (level === 'fiqh_muamalat') {
            pollName = 'المعاملات - اختر الموضوع';
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
        else if (level === 'fiqh_usrah') {
            pollName = 'فقه الأسرة - اختر الموضوع';
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
        else if (level === 'mawdooiya_main') {
            pollName = 'الموضوعية - اختر الموضوع';
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
        
        if (options.length > 0) {
            await sock.sendMessage(sender, {
                poll: {
                    name: pollName,
                    values: options,
                    selectableCount: 1
                }
            });
            
            userNavigation.set(sender, { level, path, timestamp: Date.now() });
            console.log(`تم إرسال Poll: ${pollName}`);
        }
        
    } catch (error) {
        console.error('خطأ في إرسال Poll:', error.message);
    }
}

// معالجة Poll Response
async function handlePollResponse(sock, msg) {
    try {
        const pollUpdate = msg.message?.pollUpdateMessage;
        if (!pollUpdate) return false;
        
        const sender = msg.key.remoteJid;
        const userNav = userNavigation.get(sender);
        
        if (!userNav) {
            await sock.sendMessage(sender, { 
                text: 'انتهت الجلسة. اكتب /اسلام للبدء من جديد' 
            });
            return true;
        }
        
        // طباعة البنية الكاملة للتحليل
        console.log('=== pollUpdate الكامل ===');
        console.log(JSON.stringify(pollUpdate, null, 2));
        console.log('========================');
        
        const selectedOptions = pollUpdate.vote?.selectedOptions || [];
        if (selectedOptions.length === 0) {
            console.log('لم يتم اختيار أي خيار');
            console.log('pollUpdate.vote:', pollUpdate.vote);
            return true;
        }
        
        const selectedIndex = selectedOptions[0];
        const { level, path } = userNav;
        
        console.log(`Poll Response: Level=${level}, Selected=${selectedIndex}`);
        
        // المستوى الرئيسي
        if (level === 'main') {
            if (selectedIndex === 0) {
                return await toggleAthkar(sock, sender);
            }
            else if (selectedIndex === 1) {
                return await toggleFatawa(sock, sender);
            }
            else if (selectedIndex === 2) {
                await sendPollMenu(sock, sender, 'fiqh_main', ['fiqh']);
                return true;
            }
            else if (selectedIndex === 3) {
                await sendPollMenu(sock, sender, 'mawdooiya_main', ['mawdooiya']);
                return true;
            }
        }
        
        // أقسام الفقه
        else if (level === 'fiqh_main') {
            if (selectedIndex === 0) {
                await sendPollMenu(sock, sender, 'fiqh_ibadat', ['fiqh', 'ibadat']);
                return true;
            }
            else if (selectedIndex === 1) {
                await sendPollMenu(sock, sender, 'fiqh_muamalat', ['fiqh', 'muamalat']);
                return true;
            }
            else if (selectedIndex === 2) {
                await sendPollMenu(sock, sender, 'fiqh_usrah', ['fiqh', 'usrah']);
                return true;
            }
            else if (selectedIndex === 3) {
                return await toggleSection(sock, sender, ['fiqh', 'adat'], 'العادات');
            }
        }
        
        // العبادات
        else if (level === 'fiqh_ibadat') {
            const topics = ['salah', 'janazah', 'zakah', 'siyam', 'hajj', 'taharah', 'jihad'];
            const topicNames = ['الصلاة', 'الجنائز', 'الزكاة', 'الصيام', 'الحج والعمرة', 'الطهارة', 'الجهاد'];
            
            if (selectedIndex === 0) {
                await sendPollMenu(sock, sender, 'fiqh_ibadat_salah', ['fiqh', 'ibadat', 'salah']);
                return true;
            } else {
                const topicKey = topics[selectedIndex];
                if (topicKey) {
                    return await toggleSection(sock, sender, ['fiqh', 'ibadat', topicKey], topicNames[selectedIndex]);
                }
            }
        }
        
        // الصلاة - الوصول للفئات
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
            
            const categoryKey = categories[selectedIndex];
            if (categoryKey) {
                return await toggleLectureCategory(
                    sock, 
                    sender, 
                    ['fiqh', 'ibadat', 'salah', categoryKey],
                    categoryNames[selectedIndex]
                );
            }
        }
        
        // المعاملات
        else if (level === 'fiqh_muamalat') {
            const topics = [
                'riba', 'a3riya', 'sabaq', 'salaf', 'rahn',
                'iflas', 'sulh', 'hawala', 'daman', 'sharika'
            ];
            const topicNames = [
                'الربا والصرف', 'العارية', 'السبق والمسابقات', 'السلف والقرض', 'الرهن',
                'الإفلاس والحجر', 'الصلح', 'الحوالة', 'الضمان والكفالة', 'الشركة'
            ];
            
            const topicKey = topics[selectedIndex];
            if (topicKey) {
                return await toggleSection(sock, sender, ['fiqh', 'muamalat', topicKey], topicNames[selectedIndex]);
            }
        }
        
        // فقه الأسرة
        else if (level === 'fiqh_usrah') {
            const topics = [
                'zawaj', 'nazar', 'khul3', 'talaq', 'raj3a',
                'eela', 'dhihar', 'li3an', 'idad', 'rada3'
            ];
            const topicNames = [
                'الزواج وأحكامه', 'النظر والخلوة والاختلاط', 'الخلع', 'الطلاق', 'الرجعة',
                'الإيلاء', 'الظهار', 'اللعان', 'العِدَد', 'الرضاع'
            ];
            
            const topicKey = topics[selectedIndex];
            if (topicKey) {
                return await toggleSection(sock, sender, ['fiqh', 'usrah', topicKey], topicNames[selectedIndex]);
            }
        }
        
        // الموضوعية
        else if (level === 'mawdooiya_main') {
            const topics = [
                'quran', 'aqeedah', 'hadith', 'tafsir', 'da3wa',
                'firaq', 'bida3', 'usulFiqh', 'alim', 'adab'
            ];
            const topicNames = [
                'القرآن وعلومه', 'العقيدة', 'الحديث وعلومه', 'التفسير', 'الدعوة والدعاة',
                'الفرق والمذاهب', 'البدع والمحدثات', 'أصول الفقه', 'العالم والمتعلم', 'الآداب والأخلاق'
            ];
            
            const topicKey = topics[selectedIndex];
            if (topicKey) {
                return await toggleSection(sock, sender, ['mawdooiya', topicKey], topicNames[selectedIndex]);
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('خطأ في معالجة Poll:', error.message);
        return false;
    }
}

// دوال Toggle
async function toggleAthkar(sock, sender) {
    sectionsState.athkar.enabled = !sectionsState.athkar.enabled;
    saveSectionsState();
    
    if (sectionsState.athkar.enabled) {
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
    sectionsState.fatawa.enabled = !sectionsState.fatawa.enabled;
    saveSectionsState();
    
    if (sectionsState.fatawa.enabled) {
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

async function toggleSection(sock, sender, pathArray, displayName = '') {
    try {
        let section = sectionsState;
        for (const key of pathArray) {
            if (section[key] === undefined) {
                section[key] = { enabled: false };
            }
            section = section[key];
        }
        
        section.enabled = !section.enabled;
        saveSectionsState();
        
        const pathStr = pathArray.join(' > ');
        const name = displayName || pathStr;
        
        if (section.enabled) {
            await sock.sendMessage(sender, {
                text: `*تم تفعيل قسم:*\n\n${name}\n\nتنبيه: هذا القسم لا يحتوي على محاضرات حالياً`
            });
            console.log(`تم تفعيل: ${pathStr}`);
        } else {
            await sock.sendMessage(sender, {
                text: `*تم تعطيل قسم:*\n\n${name}`
            });
            console.log(`تم تعطيل: ${pathStr}`);
        }
        
        userNavigation.delete(sender);
        return true;
        
    } catch (error) {
        console.error('خطأ في toggleSection:', error.message);
        return false;
    }
}

async function toggleLectureCategory(sock, sender, pathArray, displayName) {
    try {
        const [mainSection, subsection, topic, category] = pathArray;
        
        const categoryState = sectionsState.fiqh.subsections.ibadat.topics.salah.categories[category];
        
        if (!categoryState) {
            await sock.sendMessage(sender, {
                text: `القسم غير موجود: ${category}`
            });
            return true;
        }
        
        categoryState.enabled = !categoryState.enabled;
        saveSectionsState();
        
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        
        if (categoryState.enabled) {
            const lecturesData = ISLAMIC_CONTENT.fiqh.subsections.ibadat.topics.salah.categories[category];
            
            if (!lecturesData || !lecturesData.items || lecturesData.items.length === 0) {
                await sock.sendMessage(sender, {
                    text: `*تم تفعيل قسم:*\n\n${displayName}\n\nلكن لا توجد محاضرات متاحة حالياً`
                });
                userNavigation.delete(sender);
                return true;
            }
            
            const firstLecture = lecturesData.items[0];
            
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
                } else {
                    console.error('ISLAMIC_GROUP_ID غير محدد في .env');
                }
                
                categoryState.index = 1;
                saveSectionsState();
                
                startLectureSchedule(sock, pathArray, lecturesData.items, displayName);
                
            } catch (err) {
                console.error('فشل جلب المحاضرة:', err.message);
                await sock.sendMessage(sender, {
                    text: `فشل جلب المحاضرة: ${firstLecture.title}`
                });
            }
            
        } else {
            stopLectureSchedule(pathArray);
            
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

// أمر معرفة حالة الأقسام
async function sendSectionsStatus(sock, sender) {
    try {
        let status = '*حالة الأقسام الاسلامية:*\n\n';
        
        status += `${sectionsState.athkar.enabled ? 'مفعل' : 'معطل'} *الأذكار*\n`;
        if (sectionsState.athkar.enabled) {
            status += '   الصباح: 6:50 و 7:00\n';
            status += '   المساء: 3:50 و 4:00\n';
        }
        status += '\n';
        
        status += `${sectionsState.fatawa.enabled ? 'مفعل' : 'معطل'} *الفتاوى*\n`;
        if (sectionsState.fatawa.enabled) {
            status += '   يومياً: 12:00 ظهراً\n';
        }
        status += '\n';
        
        status += `${sectionsState.fiqh.enabled ? 'مفعل' : 'معطل'} *الفقه*\n`;
        
        const ibadat = sectionsState.fiqh.subsections.ibadat;
        if (ibadat.enabled || Object.values(ibadat.topics).some(t => t.enabled)) {
            status += `  ${ibadat.enabled ? 'مفعل' : 'يحتوي على أقسام'} العبادات\n`;
            
            const salah = ibadat.topics.salah;
            if (salah.enabled || Object.values(salah.categories).some(c => c.enabled)) {
                status += `    ${salah.enabled ? 'مفعل' : 'يحتوي على أقسام'} الصلاة\n`;
                
                for (const [key, cat] of Object.entries(salah.categories)) {
                    if (cat.enabled) {
                        const displayName = ISLAMIC_CONTENT.fiqh.subsections.ibadat.topics.salah.categories[key]?.displayName || key;
                        status += `      مفعل ${displayName}\n`;
                    }
                }
            }
            
            for (const [topicKey, topicData] of Object.entries(ibadat.topics)) {
                if (topicKey !== 'salah' && topicData.enabled) {
                    const displayName = ISLAMIC_CONTENT.fiqh.subsections.ibadat.topics[topicKey]?.displayName || topicKey;
                    status += `    مفعل ${displayName}\n`;
                }
            }
        }
        
        const muamalat = sectionsState.fiqh.subsections.muamalat;
        if (muamalat.enabled || Object.values(muamalat.topics || {}).some(t => t?.enabled)) {
            status += `  ${muamalat.enabled ? 'مفعل' : 'يحتوي على أقسام'} المعاملات\n`;
        }
        
        const usrah = sectionsState.fiqh.subsections.fiqhUsrah;
        if (usrah.enabled || Object.values(usrah.topics || {}).some(t => t?.enabled)) {
            status += `  ${usrah.enabled ? 'مفعل' : 'يحتوي على أقسام'} فقه الأسرة\n`;
        }
        
        status += '\n';
        
        status += `${sectionsState.mawdooiya.enabled ? 'مفعل' : 'معطل'} *الموضوعية*\n`;
        
        await sock.sendMessage(sender, { text: status });
        console.log('تم إرسال حالة الأقسام');
        return true;
        
    } catch (error) {
        console.error('خطأ في sendSectionsStatus:', error.message);
        return false;
    }
}

// الجدولة
async function sendMorningThikr(sock) {
    try {
        const targetGroup = process.env.ISLAMIC_GROUP_ID;
        if (!targetGroup || !sectionsState.athkar.enabled) return;
        
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
        if (!targetGroup || !sectionsState.athkar.enabled) return;
        
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
        if (!targetGroup || !sectionsState.fatawa.enabled) return;
        
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
        
        const [mainSection, subsection, topic, category] = pathArray;
        const categoryState = sectionsState.fiqh.subsections.ibadat.topics.salah.categories[category];
        
        if (!categoryState || !categoryState.enabled) {
            console.log(`القسم ${displayName} معطل - إيقاف الإرسال`);
            return;
        }
        
        const currentIndex = categoryState.index || 0;
        
        if (currentIndex >= lectures.length) {
            console.log(`تم الانتهاء من جميع محاضرات: ${displayName}`);
            return;
        }
        
        const lecture = lectures[currentIndex];
        
        console.log(`جاري جلب: ${lecture.title} (${currentIndex + 1}/${lectures.length})`);
        
        try {
            const content = await fetchLectureContent(lecture.pageUrl);
            const message = formatLecture(content);
            
            await sock.sendMessage(targetGroup, { text: message });
            console.log(`تم إرسال: ${lecture.title}`);
            
            categoryState.index = currentIndex + 1;
            saveSectionsState();
            
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

function startIslamicSchedule(sock) {
    if (sectionsState.athkar.enabled) startAthkarSchedule(sock);
    if (sectionsState.fatawa.enabled) startFatawaSchedule(sock);
    
    const salahCategories = sectionsState.fiqh.subsections.ibadat.topics.salah.categories;
    for (const [categoryKey, categoryState] of Object.entries(salahCategories)) {
        if (categoryState.enabled) {
            const lecturesData = ISLAMIC_CONTENT.fiqh.subsections.ibadat.topics.salah.categories[categoryKey];
            if (lecturesData && lecturesData.items && lecturesData.items.length > 0) {
                const displayName = lecturesData.displayName || categoryKey;
                startLectureSchedule(sock, ['fiqh', 'ibadat', 'salah', categoryKey], lecturesData.items, displayName);
            }
        }
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
                    msg.key.fromMe;
    
    if (!isAdmin) return false;
    
    if (msg.message?.pollUpdateMessage) {
        return await handlePollResponse(sock, msg);
    }
    
    const cmd = messageText.trim();
    
    if (cmd === '/اسلام') {
        await sendPollMenu(sock, sender, 'main');
        ISLAMIC_MODULE_ENABLED = true;
        saveIslamicState();
        return true;
    }
    
    if (cmd === '/حالة_الاقسام' || cmd === '/حالة') {
        return await sendSectionsStatus(sock, sender);
    }
    
    return false;
}

module.exports = {
    handleIslamicCommand,
    startIslamicSchedule,
    stopIslamicSchedule,
    isEnabled: () => ISLAMIC_MODULE_ENABLED
};

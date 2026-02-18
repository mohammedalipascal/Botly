const cron = require('node-cron');
const db = require('../../database/googleSheets');

const sessions = new Map();
let jobs = {};
let sockRef = null;

// ===============================
// HELPERS
// ===============================

const DEFAULT_SECTIONS = {
    'Athkar_Morning': 'أذكار الصباح',
    'Athkar_Evening': 'أذكار المساء',
    'Fatawa': 'الفتاوى',
    'Fiqh': 'الفقه',
    'Aqeeda': 'العقيدة'
};

async function send(sock, to, text) {
    await sock.sendMessage(to, { text });
}

function session(sender, data = null) {
    if (data === null) return sessions.get(sender) || { level: 'main' };
    if (data === 'delete') { sessions.delete(sender); return; }
    sessions.set(sender, data);
}

// ===============================
// MENUS
// ===============================

async function sendMainMenu(sock, sender) {
    session(sender, { level: 'main' });
    const folders = await db.getFolders();
    
    let menuLines = `📿 *القسم الإسلامي*\n\n1️⃣ الأذكار\n2️⃣ الفتاوى\n3️⃣ الفقه\n4️⃣ العقيدة\n`;
    
    // المجلدات المخصصة تكمل الترقيم من 5
    folders.forEach((f, i) => {
        menuLines += `${i + 5}️⃣ ${f.replace(/_/g, ' ')}\n`;
    });
    
    const nextNum = 5 + folders.length;
    menuLines += `\n${nextNum}️⃣ إضافة محتوى\n${nextNum + 1}️⃣ إضافة مجلد\n${nextNum + 2}️⃣ حذف مجلد\n${nextNum + 3}️⃣ الجدولة\n${nextNum + 4}️⃣ إحصائيات\n\nاختر رقم:`;
    
    // حفظ الأرقام الديناميكية في الـ session
    session(sender, { 
        level: 'main', 
        folders,
        addContent: nextNum,
        addFolder: nextNum + 1,
        deleteFolder: nextNum + 2,
        schedule: nextNum + 3,
        stats: nextNum + 4
    });
    
    await send(sock, sender, menuLines);
}

async function sendAthkarMenu(sock, sender) {
    session(sender, { level: 'athkar' });
    await send(sock, sender,
`*الأذكار*

1️⃣ أذكار الصباح
2️⃣ أذكار المساء
3️⃣ إضافة مجلد
4️⃣ حذف مجلد
0️⃣ رجوع

اختر:`);
}

async function sendScheduleMenu(sock, sender) {
    session(sender, { level: 'schedule_main' });
    const folders = await db.getFolders();
    const settings = await db.getSettings();

    let lines = `*الجدولة*\n\n`;
    const items = [
        ['Athkar_Morning', 'أذكار الصباح'],
        ['Athkar_Evening', 'أذكار المساء'],
        ['Fatawa', 'الفتاوى'],
        ['Fiqh', 'الفقه'],
        ['Aqeeda', 'العقيدة'],
        ...folders.map(f => [f, f.replace(/_/g, ' ')])
    ];

    items.forEach(([key, name], i) => {
        const s = settings[key];
        const status = s?.enabled ? '✅' : '⭕';
        lines += `${i + 1}️⃣ ${name} ${status}\n`;
    });

    lines += `0️⃣ رجوع\n\naختر:`;
    await send(sock, sender, lines);
    session(sender, { level: 'schedule_main', items });
}

async function sendSectionSchedule(sock, sender, sheetName, displayName) {
    const settings = await db.getSettings();
    const s = settings[sheetName] || { times: [], enabled: false };
    const timesList = s.times.map((t, i) => `${i + 1}. ${cronToDisplay(t)}`).join('\n') || 'لا أوقات';

    session(sender, { level: 'schedule_section', sheetName, displayName });
    await send(sock, sender,
`*${displayName}*
الحالة: ${s.enabled ? '✅ مفعّل' : '⭕ معطّل'}

الأوقات:
${timesList}

1️⃣ إضافة وقت
2️⃣ عرض/حذف أوقات
3️⃣ ${s.enabled ? 'تعطيل' : 'تفعيل'}
0️⃣ رجوع

اختر:`);
}

// ===============================
// TIME HELPERS
// ===============================

function cronToDisplay(cronStr) {
    try {
        const parts = cronStr.trim().split(' ');
        const min = parseInt(parts[0]);
        const hr = parseInt(parts[1]);
        const period = hr >= 12 ? 'م' : 'ص';
        const hr12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
        return `${hr12}:${String(min).padStart(2,'0')} ${period}`;
    } catch { return cronStr; }
}

function parseAbsoluteTime(input) {
    // "7:00ص" → hour=7, min=0
    // "7:00م" → hour=19, min=0
    // "7:30م" → hour=19, min=30
    input = input.trim();
    
    const isAM = input.includes('ص');
    const isPM = input.includes('م');
    
    if (!isAM && !isPM) return null;
    
    const timeStr = input.replace('ص', '').replace('م', '').trim();
    const parts = timeStr.split(':');
    if (parts.length !== 2) return null;
    
    let hour = parseInt(parts[0]);
    const min = parseInt(parts[1]);
    
    if (isNaN(hour) || isNaN(min)) return null;
    if (hour < 1 || hour > 12 || min < 0 || min > 59) return null;
    
    // تحويل لـ 24 ساعة
    if (isPM && hour !== 12) hour += 12;
    if (isAM && hour === 12) hour = 0;
    
    const cron = `${min} ${hour} * * *`;
    const display = `${String(hour).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
    const displayAr = `${parts[0]}:${parts[1].padStart(2,'0')} ${isAM ? 'ص' : 'م'}`;
    
    return { cron, display, displayAr };
}

// ===============================
// SEND CONTENT
// ===============================

async function sendContent(sock, sheetName, displayName) {
    const group = process.env.ISLAMIC_GROUP_ID;
    if (!group) { console.error('❌ ISLAMIC_GROUP_ID غير موجود'); return; }

    const content = await db.getContent(sheetName);
    if (!content || content.length === 0) {
        console.log(`⚠️ لا محتوى في ${sheetName}`);
        return;
    }

    const settings = await db.getSettings();
    if (!settings[sheetName]?.enabled) {
        console.log(`⏸️ ${sheetName} معطّل`);
        return;
    }

    // إيجاد العنصر التالي
    const nextItem = content.find(c => c.sentIndex === 0) || content[0];
    
    console.log(`📤 إرسال ${displayName}:`);
    console.log(`   🆔 ID: ${nextItem.id}`);
    console.log(`   📝 طول النص: ${nextItem.text?.length || 0} حرف`);
    console.log(`   📄 أول 50 حرف: [${nextItem.text?.substring(0, 50)}]`);
    console.log(`   🔢 sentIndex: ${nextItem.sentIndex}`);

    if (!nextItem.text || nextItem.text.trim().length === 0) {
        console.error(`   ❌ النص فارغ! تخطي...`);
        await db.updateSentIndex(sheetName, nextItem.rowIndex, 1);
        return;
    }

    try {
        await sock.sendMessage(group, { text: nextItem.text });
        // تحديث SentIndex
        const allSent = content.every(c => c.id === nextItem.id ? true : c.sentIndex > 0);
        if (allSent) {
            // إعادة تعيين الكل
            for (const item of content) {
                await db.updateSentIndex(sheetName, item.rowIndex, 0);
            }
        } else {
            await db.updateSentIndex(sheetName, nextItem.rowIndex, 1);
        }
        console.log(`✅ تم الإرسال: ${displayName}`);
    } catch (e) {
        console.error(`❌ فشل الإرسال: ${e.message}`);
    }
}

// ===============================
// SCHEDULE
// ===============================

async function startSchedule(sock, sheetName, displayName) {
    // حفظ المرجع دائماً
    if (sock) sockRef = sock;
    
    // أوقف القديم
    if (jobs[sheetName]) {
        jobs[sheetName].forEach(j => j.stop());
        delete jobs[sheetName];
        console.log(`🔄 إيقاف الجدولة القديمة: ${sheetName}`);
    }

    const settings = await db.getSettings();
    const times = settings[sheetName]?.times || [];

    if (times.length === 0) {
        console.log(`⚠️ لا أوقات لـ ${sheetName}`);
        return;
    }

    const now = new Date().toLocaleString('en-US', { 
        timeZone: 'Africa/Cairo', 
        hour: '2-digit', 
        minute: '2-digit', 
        hour12: false 
    });
    console.log(`\n⏰ ======== جدولة ${displayName} ========`);
    console.log(`   📅 الآن بالقاهرة: ${now}`);
    console.log(`   📋 عدد الأوقات: ${times.length}`);

    jobs[sheetName] = times.map((cronTime, i) => {
        const display = cronToDisplay(cronTime);
        console.log(`   ⏰ [${i+1}] ${display} → cron: "${cronTime}"`);
        
        const job = cron.schedule(cronTime.trim(), async () => {
            const fireTime = new Date().toLocaleString('en-US', { 
                timeZone: 'Africa/Cairo', 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit',
                hour12: false 
            });
            console.log(`\n🔔 ======== CRON FIRED ========`);
            console.log(`   ⏰ الوقت: ${fireTime} (القاهرة)`);
            console.log(`   📌 القسم: ${displayName} (${sheetName})`);
            
            const currentSock = sockRef;
            if (!currentSock) {
                console.error(`   ❌ sockRef = null! لا يمكن الإرسال`);
                return;
            }
            console.log(`   ✅ sock متوفر، جاري الإرسال...`);
            await sendContent(currentSock, sheetName, displayName);
            console.log(`   ==============================\n`);
        }, { timezone: 'Africa/Cairo', scheduled: true });
        
        // تحقق أن الـ job شغّال
        console.log(`   ✅ Job created, running: ${job ? 'نعم' : 'لا'}`);
        return job;
    });
    
    console.log(`✅ تم إعداد ${jobs[sheetName].length} جدولة لـ ${displayName}`);
    console.log(`========================================\n`);
}

function stopSchedule(sheetName) {
    if (jobs[sheetName]) {
        jobs[sheetName].forEach(j => j.stop());
        delete jobs[sheetName];
        console.log(`⏹️ إيقاف جدولة: ${sheetName}`);
    }
}

// ===============================
// COMMAND HANDLER
// ===============================

async function handleCommand(sock, msg, text, sender) {
    const isAdmin = sender.includes('249962204268') ||
                    sender.includes('231211024814174') ||
                    sender.includes('252355702448348') ||
                    msg.key.fromMe;

    if (!isAdmin) return false;

    // أوامر خاصة
    if (text === '/اسلام' || text === '/islam' || text === '/ادارة' || text === '/admin') {
        await sendMainMenu(sock, sender);
        return true;
    }

    if (text === '/restart' || text === '/اعادة') {
        await send(sock, sender, '🔄 إعادة التشغيل...');
        process.exit(0);
        return true;
    }

    if (text === '/groups' || text === '/مجموعات') {
        try {
            const groups = await sock.groupFetchAllParticipating();
            let msg2 = '📋 *المجموعات:*\n\n';
            for (const [id, g] of Object.entries(groups)) {
                msg2 += `📌 ${g.subject}\n🆔 ${id}\n👥 ${g.participants?.length || 0} عضو\n\n`;
            }
            await send(sock, sender, msg2);
        } catch (e) {
            await send(sock, sender, `❌ ${e.message}`);
        }
        return true;
    }

    // إذا الرسالة رقم
    if (/^\d+$/.test(text.trim())) {
        return await handleNumber(sock, sender, parseInt(text.trim()));
    }

    // نص عادي (إدخال)
    return await handleText(sock, sender, text);
}

// ===============================
// NUMBER HANDLER
// ===============================

async function handleNumber(sock, sender, num) {
    const s = session(sender);

    // ======= MAIN MENU =======
    if (s.level === 'main') {
        const folders = s.folders || [];
        const addContent = s.addContent || (5 + folders.length);
        const addFolder  = s.addFolder  || (6 + folders.length);
        const delFolder  = s.deleteFolder || (7 + folders.length);
        const schedule   = s.schedule   || (8 + folders.length);
        const stats      = s.stats      || (9 + folders.length);

        if (num === 1) {
            await sendAthkarMenu(sock, sender);
        } else if (num === 2) {
            await activateSection(sock, sender, 'Fatawa', 'الفتاوى');
        } else if (num === 3) {
            await activateSection(sock, sender, 'Fiqh', 'الفقه');
        } else if (num === 4) {
            await activateSection(sock, sender, 'Aqeeda', 'العقيدة');
        } else if (num === addContent) {
            await sendAddContentMenu(sock, sender);
        } else if (num === addFolder) {
            await send(sock, sender, '📁 اكتب اسم المجلد الجديد:');
            session(sender, { level: 'create_folder' });
        } else if (num === delFolder) {
            await sendDeleteFolderMenu(sock, sender);
        } else if (num === schedule) {
            await sendScheduleMenu(sock, sender);
        } else if (num === stats) {
            await sendStats(sock, sender);
        } else {
            // مجلدات مخصصة (5 إلى addContent-1)
            const folderIndex = num - 5;
            if (folderIndex >= 0 && folderIndex < folders.length) {
                await activateSection(sock, sender, folders[folderIndex], folders[folderIndex].replace(/_/g, ' '));
            }
        }
        return true;
    }

    // ======= ATHKAR MENU =======
    if (s.level === 'athkar') {
        if (num === 0) return await sendMainMenu(sock, sender);
        if (num === 1) await activateSection(sock, sender, 'Athkar_Morning', 'أذكار الصباح');
        else if (num === 2) await activateSection(sock, sender, 'Athkar_Evening', 'أذكار المساء');
        else if (num === 3) {
            await send(sock, sender, '📁 اكتب اسم المجلد الجديد داخل الأذكار:');
            session(sender, { level: 'create_folder', parent: 'Athkar' });
        } else if (num === 4) {
            await sendDeleteFolderMenu(sock, sender);
        }
        return true;
    }

    // ======= ADD CONTENT MENU =======
    if (s.level === 'add_content') {
        if (num === 0) return await sendMainMenu(sock, sender);
        const items = s.items || [];
        const picked = items[num - 1];
        if (picked) {
            session(sender, { level: 'typing_content', sheetName: picked.key, displayName: picked.name });
            await send(sock, sender, `✍️ اكتب المحتوى لـ *${picked.name}* وسيُرسل كما هو:`);
        }
        return true;
    }

    // ======= DELETE FOLDER =======
    if (s.level === 'delete_folder') {
        if (num === 0) return await sendMainMenu(sock, sender);
        const folders = s.folders || [];
        const picked = folders[num - 1];
        if (picked) {
            await db.deleteContentSheet(picked);
            stopSchedule(picked);
            await send(sock, sender, `✅ تم حذف *${picked.replace(/_/g, ' ')}*`);
            await sendMainMenu(sock, sender);
        }
        return true;
    }

    // ======= SCHEDULE MAIN =======
    if (s.level === 'schedule_main') {
        if (num === 0) return await sendMainMenu(sock, sender);
        const items = s.items || [];
        const picked = items[num - 1];
        if (picked) {
            await sendSectionSchedule(sock, sender, picked[0], picked[1]);
        }
        return true;
    }

    // ======= SCHEDULE SECTION =======
    if (s.level === 'schedule_section') {
        if (num === 0) return await sendScheduleMenu(sock, sender);
        if (num === 1) {
            await send(sock, sender,
`⏰ *إضافة وقت*

اكتب الوقت بتوقيت القاهرة:
مثال: \`7:00ص\` = السابعة صباحاً
مثال: \`3:30م\` = الثالثة والنصف مساءً`);
            session(sender, { ...s, level: 'adding_time' });
        } else if (num === 2) {
            await sendTimesDisplay(sock, sender, s.sheetName, s.displayName);
        } else if (num === 3) {
            const settings = await db.getSettings();
            const current = settings[s.sheetName]?.enabled || false;
            const times = settings[s.sheetName]?.times || [];
            
            await db.setEnabled(s.sheetName, !current);
            
            if (!current) {
                // تفعيل
                if (times.length === 0) {
                    await send(sock, sender, `✅ تم تفعيل *${s.displayName}*\n⚠️ أضف وقتاً أولاً لتبدأ الجدولة`);
                } else {
                    await send(sock, sender, `✅ تم تفعيل *${s.displayName}*`);
                    await startSchedule(sockRef || sock, s.sheetName, s.displayName);
                }
            } else {
                // تعطيل
                stopSchedule(s.sheetName);
                await send(sock, sender, `⭕ تم تعطيل *${s.displayName}*`);
            }
            await sendMainMenu(sock, sender);
        }
        return true;
    }

    // ======= TIMES DISPLAY (delete) =======
    if (s.level === 'times_display') {
        if (num === 0) return await sendSectionSchedule(sock, sender, s.sheetName, s.displayName);
        const index = num - 1;
        const remaining = await db.deleteTime(s.sheetName, index);
        if (remaining !== null) {
            await send(sock, sender, `✅ تم الحذف`);
            // أعد تشغيل الجدولة
            if (remaining.length > 0) {
                await startSchedule(sockRef, s.sheetName, s.displayName);
            } else {
                stopSchedule(s.sheetName);
            }
        }
        await sendMainMenu(sock, sender);
        return true;
    }

    return false;
}

// ===============================
// TEXT HANDLER
// ===============================

async function handleText(sock, sender, text) {
    const s = session(sender);

    // ======= TYPING CONTENT =======
    if (s.level === 'typing_content') {
        await db.addContent(s.sheetName, text);
        await send(sock, sender, `✅ تم الحفظ في *${s.displayName}*`);
        await sendMainMenu(sock, sender);
        return true;
    }

    // ======= CREATE FOLDER =======
    if (s.level === 'create_folder') {
        const { created, sheetName } = await db.createFolder(text.trim());
        if (created) {
            await send(sock, sender, `✅ تم إنشاء مجلد *${text.trim()}*\nيمكنك إضافة محتوى وجدولة له الآن`);
        } else {
            await send(sock, sender, `⚠️ المجلد *${text.trim()}* موجود مسبقاً`);
        }
        await sendMainMenu(sock, sender);
        return true;
    }

    // ======= ADDING TIME =======
    if (s.level === 'adding_time') {
        const result = parseAbsoluteTime(text.trim());
        if (!result) {
            await send(sock, sender, '❌ صيغة خاطئة\nمثال: 7:00ص أو 3:30م');
            await sendMainMenu(sock, sender);
            return true;
        }
        
        const times = await db.addTime(s.sheetName, result.cron);
        await db.upsertSection(s.sheetName, null, null);
        
        await send(sock, sender,
`✅ تم إضافة الوقت
📌 القسم: *${s.displayName}*
⏰ سيُرسل الساعة: *${result.displayAr}* (القاهرة)
📋 إجمالي الأوقات: ${times.length}

⚠️ تأكد من تفعيل القسم لكي يرسل`);

        const updatedSettings = await db.getSettings();
        if (updatedSettings[s.sheetName]?.enabled) {
            await startSchedule(sockRef || sock, s.sheetName, s.displayName);
        }
        
        await sendMainMenu(sock, sender);
        return true;
    }

    return false;
}

// ===============================
// HELPERS FOR MENUS
// ===============================

async function activateSection(sock, sender, sheetName, displayName) {
    await db.createContentSheet(sheetName);
    await db.upsertSection(sheetName, null, null);
    
    const settings = await db.getSettings();
    const current = settings[sheetName]?.enabled || false;
    const times = settings[sheetName]?.times || [];
    
    await db.setEnabled(sheetName, !current);
    
    if (!current) {
        // تفعيل
        if (times.length === 0) {
            await send(sock, sender, `✅ تم تفعيل *${displayName}*\n⚠️ لا أوقات محددة - أضف وقتاً من الجدولة`);
        } else {
            await send(sock, sender, `✅ تم تفعيل *${displayName}*`);
            await startSchedule(sock, sheetName, displayName);
        }
    } else {
        // تعطيل
        stopSchedule(sheetName);
        await send(sock, sender, `⭕ تم تعطيل *${displayName}*`);
    }
    await sendMainMenu(sock, sender);
}

async function sendAddContentMenu(sock, sender) {
    const folders = await db.getFolders();
    const items = [
        { key: 'Athkar_Morning', name: 'أذكار الصباح' },
        { key: 'Athkar_Evening', name: 'أذكار المساء' },
        { key: 'Fatawa', name: 'الفتاوى' },
        { key: 'Fiqh', name: 'الفقه' },
        { key: 'Aqeeda', name: 'العقيدة' },
        ...folders.map(f => ({ key: f, name: f.replace(/_/g, ' ') }))
    ];

    let lines = `*إضافة محتوى*\n\n`;
    items.forEach((item, i) => { lines += `${i + 1}️⃣ ${item.name}\n`; });
    lines += `0️⃣ رجوع\n\nاختر القسم:`;

    session(sender, { level: 'add_content', items });
    await send(sock, sender, lines);
}

async function sendDeleteFolderMenu(sock, sender) {
    const folders = await db.getFolders();
    if (folders.length === 0) {
        await send(sock, sender, '⚠️ لا مجلدات مخصصة لحذفها');
        await sendMainMenu(sock, sender);
        return;
    }
    let lines = `*حذف مجلد*\n\n`;
    folders.forEach((f, i) => { lines += `${i + 1}️⃣ ${f.replace(/_/g, ' ')}\n`; });
    lines += `0️⃣ رجوع\n\nاختر المجلد:`;
    session(sender, { level: 'delete_folder', folders });
    await send(sock, sender, lines);
}

async function sendTimesDisplay(sock, sender, sheetName, displayName) {
    const settings = await db.getSettings();
    const times = settings[sheetName]?.times || [];
    if (times.length === 0) {
        await send(sock, sender, '⚠️ لا أوقات محددة');
        await sendMainMenu(sock, sender);
        return;
    }
    let lines = `⏰ *أوقات ${displayName}:*\n\n`;
    times.forEach((t, i) => { lines += `${i + 1}. ${cronToDisplay(t)}\n`; });
    lines += `\nاختر رقم للحذف\n0️⃣ رجوع`;
    session(sender, { level: 'times_display', sheetName, displayName });
    await send(sock, sender, lines);
}

async function sendStats(sock, sender) {
    const stats = await db.getStats();
    let lines = `📊 *الإحصائيات:*\n\n`;
    stats.forEach(s => {
        const status = s.enabled ? '✅' : '⭕';
        lines += `${status} *${s.name.replace(/_/g, ' ')}*\n`;
        lines += `   📝 ${s.count} محتوى | ⏰ ${s.times.length} وقت\n\n`;
    });
    await send(sock, sender, lines);
    await sendMainMenu(sock, sender);
}

// ===============================
// INITIALIZE
// ===============================

async function initialize(sock) {
    sockRef = sock;
    
    console.log('🔍 فحص ENV:');
    console.log(`   ISLAMIC_GROUP_ID: ${process.env.ISLAMIC_GROUP_ID ? '✅' : '❌ غير موجود'}`);
    console.log(`   GOOGLE_SHEET_ID: ${process.env.GOOGLE_SHEET_ID ? '✅' : '❌ غير موجود'}`);

    if (!process.env.ISLAMIC_GROUP_ID || !process.env.GOOGLE_SHEET_ID) {
        console.log('⚠️ القسم الإسلامي معطل');
        return;
    }

    try {
        console.log('🔄 تهيئة القسم الإسلامي...');
        
        // إيقاف أي جدولات قديمة
        Object.keys(jobs).forEach(key => {
            if (jobs[key]) {
                jobs[key].forEach(j => j.stop());
            }
        });
        jobs = {};
        
        await db.initialize();
        await db.setupSettings();

        // تشغيل الجداول المفعّلة
        const settings = await db.getSettings();
        const allSections = {
            ...DEFAULT_SECTIONS,
        };

        // أضف المجلدات المخصصة
        const folders = await db.getFolders();
        folders.forEach(f => { allSections[f] = f.replace(/_/g, ' '); });

        for (const [sheetName, displayName] of Object.entries(allSections)) {
            const s = settings[sheetName];
            if (s?.enabled && s?.times?.length > 0) {
                console.log(`🔄 تحميل جدولة: ${displayName}`);
                await startSchedule(sock, sheetName, displayName);
            }
        }

        console.log('✅ القسم الإسلامي جاهز');
    } catch (e) {
        console.error('❌ فشل التهيئة:', e.message);
    }
}

function isEnabled() {
    return !!(process.env.ISLAMIC_GROUP_ID && process.env.GOOGLE_SHEET_ID);
}

function resetModule() {
    console.log('🔄 إعادة تعيين القسم الإسلامي...');
    // إيقاف كل الجدولات
    Object.keys(jobs).forEach(key => {
        if (jobs[key]) {
            jobs[key].forEach(j => j.stop());
        }
    });
    jobs = {};
    sessions.clear();
    sockRef = null;
    console.log('✅ تم إعادة التعيين');
}

module.exports = {
    handleIslamicCommand: handleCommand,
    initializeIslamicModule: initialize,
    islamicIsEnabled: isEnabled,
    resetIslamicModule: resetModule
};

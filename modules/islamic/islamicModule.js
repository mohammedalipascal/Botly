const cron = require('node-cron');
const db = require('../../database/googleSheets');

const sessions = new Map(); // جلسة واحدة موحدة
let jobs = {};

// إرسال محتوى من DB
async function sendContent(sock, path, title) {
    try {
        const group = process.env.ISLAMIC_GROUP_ID;
        if (!group) {
            console.error('❌ ISLAMIC_GROUP_ID غير محدد');
            return;
        }
        
        const content = await db.getContent(path);
        if (!content || content.length === 0) {
            console.log(`لا محتوى في ${title}`);
            return;
        }
        
        const first = content[0];
        if (!first.enabled) return;
        
        const index = first.lastSentIndex || 0;
        if (index >= content.length) return;
        
        const item = content[index];
        let text = (item.text || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
        if (text.length > 4000) text = text.substring(0, 4000);
        
        const message = `${item.title}\n\n${text}`;
        
        try {
            await sock.sendMessage(group, { text: message });
            await db.updateIndex(path, item.id, index + 1);
            console.log(`✅ تم إرسال: ${item.title}`);
        } catch (e) {
            await sock.sendMessage(group, { text: item.title });
            await db.updateIndex(path, item.id, index + 1);
        }
    } catch (e) {
        console.error(`خطأ في ${title}:`, e.message);
    }
}

// القائمة الرئيسية الموحدة
async function sendMainMenu(sock, sender) {
    await sock.sendMessage(sender, {
        poll: {
            name: 'القسم الإسلامي',
            values: [
                '1️⃣ الأذكار',
                '2️⃣ الفتاوى',
                '3️⃣ الفقه',
                '4️⃣ الموضوعية',
                '5️⃣ إضافة محتوى',
                '6️⃣ الجدولة',
                '7️⃣ إحصائيات'
            ],
            selectableCount: 1
        }
    });
    sessions.set(sender, { level: 'main' });
}

// Polls
async function sendPoll(sock, sender, name, options, level) {
    await sock.sendMessage(sender, {
        poll: { name, values: options, selectableCount: 1 }
    });
    sessions.set(sender, { level });
}

// Toggle
async function toggle(sock, sender, path, title) {
    try {
        const content = await db.getContent(path);
        if (!content || content.length === 0) {
            await sock.sendMessage(sender, { text: `لا محتوى. أضف من القائمة` });
            return true;
        }
        
        const newStatus = !content[0].enabled;
        await db.updateStatus(path, content[0].id, newStatus);
        
        await sock.sendMessage(sender, { 
            text: newStatus ? `✅ تفعيل: ${title}` : `❌ تعطيل: ${title}` 
        });
        
        if (newStatus) {
            await sendContent(sock, path, title);
            await startSchedule(sock, path, title);
        } else {
            stopSchedule(path);
        }
        return true;
    } catch (e) {
        return false;
    }
}

// الجدولة
async function startSchedule(sock, path, title) {
    const key = path.join('_');
    
    console.log(`🔧 بدء جدولة: ${title} (${key})`);
    
    if (jobs[key]) {
        (Array.isArray(jobs[key]) ? jobs[key] : [jobs[key]]).forEach(j => j.stop());
        delete jobs[key];
    }
    
    try {
        const settings = await db.getSettings();
        
        let section = '';
        if (path[0] === 'athkar') section = `athkar_${path[1]}`;
        else if (path[0] === 'fatawa') section = 'fatawa';
        else section = path.join('_');
        
        console.log(`   📍 Section: ${section}`);
        
        const times = settings[section]?.time || '';
        if (!times) {
            console.log(`   ❌ لا أوقات للقسم: ${section}`);
            return;
        }
        
        const timesList = times.split(',').filter(t => t.trim());
        jobs[key] = [];
        
        const now = new Date();
        const cairoNow = now.toLocaleString('en-US', {
            timeZone: 'Africa/Cairo',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
        
        console.log(`   🕐 الوقت الآن بالقاهرة: ${cairoNow}`);
        
        timesList.forEach((cronTime, index) => {
            const parts = cronTime.trim().split(' ');
            const scheduleTime = `${parts[1]}:${parts[0].padStart(2, '0')}`;
            
            console.log(`   ⏰ وقت ${index + 1}: ${scheduleTime} (cron: ${cronTime.trim()})`);
            
            const job = cron.schedule(cronTime.trim(), () => {
                const execTime = new Date().toLocaleString('en-US', {
                    timeZone: 'Africa/Cairo',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
                console.log(`🔔 [${execTime}] تشغيل جدولة: ${title}`);
                sendContent(sock, path, title);
            }, { 
                timezone: "Africa/Cairo",
                scheduled: true
            });
            
            jobs[key].push(job);
        });
        
        console.log(`✅ جدولة ${title}: ${timesList.length} وقت`);
    } catch (e) {
        console.error(`❌ خطأ في جدولة ${title}:`, e.message);
    }
}

function stopSchedule(path) {
    const key = path.join('_');
    if (jobs[key]) {
        (Array.isArray(jobs[key]) ? jobs[key] : [jobs[key]]).forEach(j => j.stop());
        delete jobs[key];
    }
}

// معالج الأرقام
async function handleNumber(sock, sender, num) {
    const s = sessions.get(sender);
    if (!s) return false;
    
    if (s.level === 'main') {
        if (num === 1) {
            await sendPoll(sock, sender, 'الأذكار', ['1️⃣ صباحي', '2️⃣ مسائي', '0️⃣ رجوع'], 'athkar_menu');
        } else if (num === 2) {
            return await toggle(sock, sender, ['fatawa'], 'الفتاوى');
        } else if (num === 3) {
            await sendPoll(sock, sender, 'الفقه', [
                '1️⃣ العبادات', '2️⃣ المعاملات', 
                '3️⃣ فقه الأسرة', '4️⃣ العادات', '0️⃣ رجوع'
            ], 'fiqh_menu');
        } else if (num === 4) {
            await sock.sendMessage(sender, { text: '🚧 قيد التطوير' });
        } else if (num === 5) {
            await sendPoll(sock, sender, 'إضافة محتوى', ['1️⃣ ذكر', '2️⃣ فتوى', '3️⃣ محاضرة', '0️⃣ رجوع'], 'add_menu');
        } else if (num === 6) {
            await sendPoll(sock, sender, 'الجدولة', [
                '1️⃣ الأذكار', '2️⃣ الفتاوى', '3️⃣ الفقه', '0️⃣ رجوع'
            ], 'schedule_menu');
        } else if (num === 7) {
            await sendStats(sock, sender);
        }
        return true;
    }
    
    if (s.level === 'athkar_menu') {
        if (num === 0) return await sendMainMenu(sock, sender);
        const types = ['morning', 'evening'];
        const names = ['الصباح', 'المساء'];
        if (num >= 1 && num <= 2) {
            return await toggle(sock, sender, ['athkar', types[num-1]], `الأذكار - ${names[num-1]}`);
        }
    }
    
    if (s.level === 'fiqh_menu') {
        if (num === 0) return await sendMainMenu(sock, sender);
        const sections = ['ibadat', 'muamalat', 'usra', 'adat'];
        const names = ['العبادات', 'المعاملات', 'فقه الأسرة', 'العادات'];
        
        if (num >= 1 && num <= 4) {
            if (num === 1) {
                await sendPoll(sock, sender, 'العبادات', [
                    '1️⃣ الصلاة', '2️⃣ الجنائز', '3️⃣ الزكاة', 
                    '4️⃣ الصيام', '5️⃣ الحج', '6️⃣ الطهارة',
                    '7️⃣ الجهاد', '0️⃣ رجوع'
                ], 'ibadat_menu');
            } else {
                await sock.sendMessage(sender, { text: '🚧 قيد التطوير' });
            }
        }
        return true;
    }
    
    if (s.level === 'ibadat_menu') {
        if (num === 0) {
            await sendPoll(sock, sender, 'الفقه', [
                '1️⃣ العبادات', '2️⃣ المعاملات', '3️⃣ فقه الأسرة', 
                '4️⃣ العادات', '0️⃣ رجوع'
            ], 'fiqh_menu');
            return true;
        }
        const topics = ['salah', 'janazah', 'zakah', 'siyam', 'hajj', 'taharah', 'jihad'];
        const names = ['الصلاة', 'الجنائز', 'الزكاة', 'الصيام', 'الحج', 'الطهارة', 'الجهاد'];
        if (num >= 1 && num <= 7) {
            return await toggle(sock, sender, ['fiqh', 'ibadat', topics[num-1]], names[num-1]);
        }
    }
    
    if (s.level === 'add_menu') {
        if (num === 0) return await sendMainMenu(sock, sender);
        if (num === 1) {
            await sendPoll(sock, sender, 'نوع الذكر', ['1️⃣ صباحي', '2️⃣ مسائي', '0️⃣ رجوع'], 'add_athkar_type');
        } else if (num === 2) {
            await sock.sendMessage(sender, { text: '✍️ اكتب نص الفتوى (فرصة واحدة):' });
            sessions.set(sender, { level: 'text_fatwa' });
        } else if (num === 3) {
            await sendPoll(sock, sender, 'الفقه', ['1️⃣ العبادات', '0️⃣ رجوع'], 'add_fiqh');
        }
        return true;
    }
    
    if (s.level === 'add_athkar_type') {
        if (num === 0) {
            await sendPoll(sock, sender, 'إضافة محتوى', ['1️⃣ ذكر', '2️⃣ فتوى', '3️⃣ محاضرة', '0️⃣ رجوع'], 'add_menu');
            return true;
        }
        const types = ['morning', 'evening'];
        const names = ['صباحي', 'مسائي'];
        if (num >= 1 && num <= 2) {
            await sock.sendMessage(sender, { text: `✍️ اكتب نص الذكر ${names[num-1]} (فرصة واحدة):` });
            sessions.set(sender, { level: 'text_athkar', type: types[num-1], name: names[num-1] });
        }
        return true;
    }
    
    if (s.level === 'add_fiqh') {
        if (num === 0) {
            await sendPoll(sock, sender, 'إضافة محتوى', ['1️⃣ ذكر', '2️⃣ فتوى', '3️⃣ محاضرة', '0️⃣ رجوع'], 'add_menu');
            return true;
        }
        if (num === 1) {
            await sendPoll(sock, sender, 'العبادات', [
                '1️⃣ الصلاة', '2️⃣ الجنائز', '3️⃣ الزكاة', 
                '4️⃣ الصيام', '5️⃣ الحج', '6️⃣ الطهارة',
                '7️⃣ الجهاد', '0️⃣ رجوع'
            ], 'add_ibadat');
        } else {
            await sock.sendMessage(sender, { text: '🚧 قيد التطوير' });
        }
        return true;
    }
    
    if (s.level === 'add_ibadat') {
        if (num === 0) {
            await sendPoll(sock, sender, 'الفقه', ['1️⃣ العبادات', '0️⃣ رجوع'], 'add_fiqh');
            return true;
        }
        const topics = ['salah', 'janazah', 'zakah', 'siyam', 'hajj', 'taharah', 'jihad'];
        const names = ['الصلاة', 'الجنائز', 'الزكاة', 'الصيام', 'الحج', 'الطهارة', 'الجهاد'];
        if (num >= 1 && num <= 7) {
            await sock.sendMessage(sender, { text: `✍️ اكتب نص ${names[num-1]} (فرصة واحدة):` });
            sessions.set(sender, { 
                level: 'text_lecture', 
                path: ['fiqh', 'ibadat', topics[num-1]], 
                title: names[num-1] 
            });
        }
        return true;
    }
    
    if (s.level === 'schedule_menu') {
        if (num === 0) return await sendMainMenu(sock, sender);
        
        if (num === 1) {
            await sendPoll(sock, sender, `الأذكار - الجدولة`, [
                '1️⃣ إضافة وقت', '2️⃣ عرض/حذف أوقات', '3️⃣ تفعيل/تعطيل', '0️⃣ رجوع'
            ], 'schedule_sub');
            sessions.set(sender, { level: 'schedule_sub', section: 'athkar', name: 'الأذكار' });
        } else if (num === 2) {
            await sendPoll(sock, sender, `الفتاوى - الجدولة`, [
                '1️⃣ إضافة وقت', '2️⃣ عرض/حذف أوقات', '3️⃣ تفعيل/تعطيل', '0️⃣ رجوع'
            ], 'schedule_sub');
            sessions.set(sender, { level: 'schedule_sub', section: 'fatawa', name: 'الفتاوى' });
        } else if (num === 3) {
            await sendPoll(sock, sender, 'الفقه - الجدولة', [
                '1️⃣ الصلاة', '2️⃣ الجنائز', '3️⃣ الزكاة', '0️⃣ رجوع'
            ], 'schedule_fiqh');
        }
        return true;
    }
    
    if (s.level === 'schedule_fiqh') {
        if (num === 0) {
            await sendPoll(sock, sender, 'الجدولة', [
                '1️⃣ الأذكار', '2️⃣ الفتاوى', '3️⃣ الفقه', '0️⃣ رجوع'
            ], 'schedule_menu');
            return true;
        }
        const topics = ['salah', 'janazah', 'zakah'];
        const names = ['الصلاة', 'الجنائز', 'الزكاة'];
        if (num >= 1 && num <= 3) {
            await sendPoll(sock, sender, `${names[num-1]} - الجدولة`, [
                '1️⃣ إضافة وقت', '2️⃣ عرض/حذف أوقات', '3️⃣ تفعيل/تعطيل', '0️⃣ رجوع'
            ], 'schedule_sub');
            sessions.set(sender, { 
                level: 'schedule_sub', 
                section: `fiqh_ibadat_${topics[num-1]}`, 
                name: names[num-1] 
            });
        }
        return true;
    }
    
    if (s.level === 'schedule_sub') {
        if (num === 0) {
            await sendPoll(sock, sender, 'الجدولة', ['1️⃣ الأذكار', '2️⃣ الفتاوى', '0️⃣ رجوع'], 'schedule_menu');
            return true;
        }
        if (num === 1) {
            await sock.sendMessage(sender, { text: `⏰ اكتب الوقت (مثال: 6:30) - فرصة واحدة:` });
            sessions.set(sender, { level: 'set_time', section: s.section });
        } else if (num === 2) {
            await showTimesForDelete(sock, sender, s.section);
        } else if (num === 3) {
            const settings = await db.getSettings();
            const current = settings[s.section]?.enabled || false;
            await db.updateScheduleStatus(s.section, !current);
            await sock.sendMessage(sender, { text: current ? '❌ معطّل' : '✅ مفعّل' });
            await sendMainMenu(sock, sender);
        }
        return true;
    }
    
    // حذف وقت
    if (s.level === 'delete_time') {
        if (num === 0) {
            await sendMainMenu(sock, sender);
            return true;
        }
        const index = num - 1;
        if (index >= 0 && index < s.times.length) {
            s.times.splice(index, 1);
            await db.updateTime(s.section, s.times.join(','));
            await sock.sendMessage(sender, { text: '✅ تم الحذف' });
        } else {
            await sock.sendMessage(sender, { text: '❌ رقم خاطئ' });
        }
        sessions.delete(sender);
        await sendMainMenu(sock, sender);
        return true;
    }
    
    return false;
}

// معالج النصوص
async function handleText(sock, sender, text) {
    const s = sessions.get(sender);
    if (!s) return false;
    
    if (s.level === 'text_athkar') {
        await db.addContent(['athkar', s.type], {
            title: `ذكر ${s.name}`,
            text: text,
            type: 'ذكر'
        });
        await sock.sendMessage(sender, { text: '✅ تم الحفظ' });
        sessions.delete(sender);
        await sendMainMenu(sock, sender);
        return true;
    }
    
    if (s.level === 'text_fatwa') {
        await db.addContent(['fatawa'], {
            title: 'فتوى',
            text: text,
            type: 'فتوى'
        });
        await sock.sendMessage(sender, { text: '✅ تم الحفظ' });
        sessions.delete(sender);
        await sendMainMenu(sock, sender);
        return true;
    }
    
    if (s.level === 'text_lecture') {
        await db.addContent(s.path, {
            title: s.title,
            text: text,
            type: 'محاضرة'
        });
        await sock.sendMessage(sender, { text: '✅ تم الحفظ' });
        sessions.delete(sender);
        await sendMainMenu(sock, sender);
        return true;
    }
    
    if (s.level === 'set_time') {
        const match = text.match(/^(\d{1,2}):(\d{2})$/);
        if (!match) {
            await sock.sendMessage(sender, { text: '❌ صيغة خاطئة' });
            sessions.delete(sender);
            await sendMainMenu(sock, sender);
            return true;
        }
        
        const h = parseInt(match[1]);
        const m = parseInt(match[2]);
        if (h > 23 || m > 59) {
            await sock.sendMessage(sender, { text: '❌ وقت خاطئ' });
            sessions.delete(sender);
            await sendMainMenu(sock, sender);
            return true;
        }
        
        const cron = `${m} ${h} * * *`;
        const settings = await db.getSettings();
        const currentTime = settings[s.section]?.time || '';
        const newTime = currentTime ? `${currentTime},${cron}` : cron;
        
        await db.updateTime(s.section, newTime);
        await sock.sendMessage(sender, { text: '✅ تم الإضافة' });
        sessions.delete(sender);
        await sendMainMenu(sock, sender);
        return true;
    }
    
    return false;
}

// عرض أوقات مع خيار حذف
async function showTimesForDelete(sock, sender, section) {
    const settings = await db.getSettings();
    const times = settings[section]?.time || '';
    
    if (!times) {
        await sock.sendMessage(sender, { text: 'لا أوقات' });
        return;
    }
    
    const timesList = times.split(',');
    const message = `⏰ الأوقات:\n\n` + timesList.map((cron, i) => {
        const parts = cron.trim().split(' ');
        return `${i+1}. ${parts[1]}:${parts[0].padStart(2, '0')}`;
    }).join('\n') + `\n\n✍️ للحذف: اكتب الرقم (فرصة واحدة)\n0️⃣ رجوع`;
    
    await sock.sendMessage(sender, { text: message });
    sessions.set(sender, { level: 'delete_time', section, times: timesList });
}

// إحصائيات
async function sendStats(sock, sender) {
    let stats = '*الإحصائيات:*\n\n';
    
    const sections = [
        { path: ['athkar', 'morning'], name: 'الأذكار - الصباح' },
        { path: ['fatawa'], name: 'الفتاوى' },
        { path: ['fiqh', 'ibadat', 'salah'], name: 'الفقه - الصلاة' }
    ];
    
    for (const sec of sections) {
        const content = await db.getContent(sec.path);
        if (content.length > 0 && content[0].enabled) {
            stats += `✅ ${sec.name}: ${content.length} محتوى\n`;
        }
    }
    
    await sock.sendMessage(sender, { text: stats + '\n0️⃣ رجوع' });
    sessions.set(sender, { level: 'stats' });
}

// Command Handler
async function handleCommand(sock, msg, text, sender) {
    const isAdmin = sender.includes('249962204268') || 
                    sender.includes('231211024814174') ||
                    sender.includes('252355702448348') ||
                    msg.key.fromMe;

    if (!isAdmin) return false;

    // تجاهل poll responses لمنع الحلقة اللانهائية
    if (msg.message?.pollUpdateMessage || msg.message?.pollCreationMessage) {
        return false;
    }

    if (text === '/اسلام' || text === '/islam' || text === '/ادارة' || text === '/admin') {
        await sendMainMenu(sock, sender);
        return true;
    }

    if (/^\d{1,2}$/.test(text)) {
        return await handleNumber(sock, sender, parseInt(text));
    }

    return await handleText(sock, sender, text);
}

// Init
async function initialize(sock) {
    try {
        if (!process.env.ISLAMIC_GROUP_ID || !process.env.GOOGLE_SHEET_ID) {
            console.log('⚠️ القسم الإسلامي معطل');
            return;
        }

        await db.initialize();
        await db.setupSettings();

        const settings = await db.getSettings();
        for (const [section, config] of Object.entries(settings)) {
            if (config.enabled) {
                const times = config.time.split(',');
                times.forEach(cron => {
                    if (section.includes('athkar')) {
                        const type = section.split('_')[1];
                        startSchedule(sock, ['athkar', type], 'الأذكار');
                    } else if (section === 'fatawa') {
                        startSchedule(sock, ['fatawa'], 'الفتاوى');
                    }
                });
            }
        }

        console.log('✅ القسم الإسلامي جاهز');
    } catch (e) {
        console.error('❌ فشل:', e.message);
    }
}

function isEnabled() {
    return !!(process.env.ISLAMIC_GROUP_ID && process.env.GOOGLE_SHEET_ID);
}

module.exports = {
    handleIslamicCommand: handleCommand,
    initializeIslamicModule: initialize,
    islamicIsEnabled: isEnabled
};

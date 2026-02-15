const cron = require('node-cron');
const db = require('../../database/googleSheets');

const sessions = new Map();
let jobs = {};

// إرسال محتوى
async function sendContent(sock, path, title) {
    console.log(`🔔 [${new Date().toLocaleString('ar-EG', {timeZone: 'Africa/Cairo'})}] محاولة إرسال: ${title}`);
    
    try {
        const group = process.env.ISLAMIC_GROUP_ID;
        console.log(`   📍 GROUP_ID: ${group || '❌ غير موجود'}`);
        
        if (!group) {
            console.error('   ❌ ISLAMIC_GROUP_ID غير محدد في ENV!');
            return;
        }
        
        const content = await db.getContent(path);
        console.log(`   📦 المحتوى: ${content?.length || 0} عنصر`);
        
        if (!content || content.length === 0) {
            console.log('   ❌ لا محتوى في DB');
            return;
        }
        
        const first = content[0];
        console.log(`   🔘 الحالة: ${first.enabled ? 'مفعّل' : 'معطّل'}`);
        
        if (!first.enabled) {
            console.log('   ⏸️ القسم معطّل - لن يُرسل');
            return;
        }
        
        const index = first.lastSentIndex || 0;
        console.log(`   📊 المؤشر: ${index}/${content.length}`);
        
        if (index >= content.length) {
            console.log('   ✅ انتهى المحتوى');
            return;
        }
        
        const item = content[index];
        let text = (item.text || '').replace(/[*_~`\u200B-\u200D\uFEFF]/g, '').trim();
        if (text.length > 2000) text = text.substring(0, 2000);
        
        const message = `${item.title}\n\n${text}`;
        console.log(`   📤 محاولة الإرسال إلى ${group}...`);
        
        await sock.sendMessage(group, { text: message });
        console.log(`   ✅ تم الإرسال بنجاح!`);
        
        await db.updateIndex(path, item.id, index + 1);
        console.log(`   💾 تم تحديث المؤشر إلى ${index + 1}`);
        
    } catch (e) {
        console.error(`   ❌ خطأ في الإرسال: ${e.message}`);
        console.error(`   📋 Stack: ${e.stack}`);
    }
}

// قائمة رئيسية
async function sendMainMenu(sock, sender) {
    const menu = `📿 *القسم الإسلامي*

1️⃣ الأذكار
2️⃣ الفتاوى
3️⃣ الفقه
4️⃣ الموضوعية
5️⃣ إضافة محتوى
6️⃣ الجدولة
7️⃣ إحصائيات

اختر رقم:`;
    
    await sock.sendMessage(sender, { text: menu });
    sessions.set(sender, { level: 'main' });
}

// قوائم فرعية
async function sendMenu(sock, sender, title, options, level) {
    const menu = `*${title}*\n\n` + options.join('\n') + '\n\n0️⃣ رجوع';
    await sock.sendMessage(sender, { text: menu });
    sessions.set(sender, { level });
}

// Toggle
async function toggle(sock, sender, path, title) {
    const content = await db.getContent(path);
    if (!content || content.length === 0) {
        await sock.sendMessage(sender, { text: '❌ لا محتوى. أضف أولاً' });
        await sendMainMenu(sock, sender);
        return;
    }
    
    const newStatus = !content[0].enabled;
    await db.updateStatus(path, content[0].id, newStatus);
    
    await sock.sendMessage(sender, { text: newStatus ? `✅ ${title}` : `❌ ${title}` });
    
    if (newStatus) {
        await sendContent(sock, path, title);
        await startSchedule(sock, path, title);
    } else {
        stopSchedule(path);
    }
    
    await sendMainMenu(sock, sender);
}

// الجدولة
async function startSchedule(sock, path, title) {
    const key = path.join('_');
    console.log(`⏰ إعداد جدولة: ${title} (${key})`);
    
    if (jobs[key]) {
        (Array.isArray(jobs[key]) ? jobs[key] : [jobs[key]]).forEach(j => j.stop());
        delete jobs[key];
        console.log(`   🔄 إيقاف الجدولة القديمة`);
    }
    
    const settings = await db.getSettings();
    let section = path[0] === 'athkar' ? `athkar_${path[1]}` : 
                  path[0] === 'fatawa' ? 'fatawa' : path.join('_');
    
    console.log(`   📍 Section: ${section}`);
    
    const times = settings[section]?.time || '';
    console.log(`   ⏱️ الأوقات: ${times || 'لا يوجد'}`);
    
    if (!times) {
        console.log(`   ❌ لا أوقات محددة للقسم`);
        return;
    }
    
    const timesList = times.split(',').filter(t => t.trim());
    console.log(`   📋 عدد الأوقات: ${timesList.length}`);
    
    const now = new Date();
    const cairoTime = now.toLocaleString('en-US', {
        timeZone: 'Africa/Cairo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    console.log(`   🕐 الوقت الآن بالقاهرة: ${cairoTime}`);
    
    jobs[key] = timesList.map((cronTime, i) => {
        const parts = cronTime.trim().split(' ');
        const scheduleTime = `${parts[1]}:${parts[0].padStart(2, '0')}`;
        console.log(`   ⏰ [${i+1}] ${scheduleTime} (cron: ${cronTime.trim()})`);
        
        return cron.schedule(cronTime.trim(), () => {
            console.log(`\n🔔 ======== CRON TRIGGERED ========`);
            console.log(`⏰ الوقت: ${new Date().toLocaleString('ar-EG', {timeZone: 'Africa/Cairo'})}`);
            console.log(`📌 القسم: ${title}`);
            sendContent(sock, path, title);
        }, { 
            timezone: "Africa/Cairo", 
            scheduled: true 
        });
    });
    
    console.log(`✅ تم إعداد ${jobs[key].length} جدولة لـ ${title}`);
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
    
    // القائمة الرئيسية
    if (s.level === 'main') {
        if (num === 1) {
            await sendMenu(sock, sender, 'الأذكار', ['1️⃣ صباحي', '2️⃣ مسائي'], 'athkar');
        } else if (num === 2) {
            await toggle(sock, sender, ['fatawa'], 'الفتاوى');
        } else if (num === 3) {
            await sendMenu(sock, sender, 'الفقه', [
                '1️⃣ العبادات', '2️⃣ المعاملات', 
                '3️⃣ فقه الأسرة', '4️⃣ العادات'
            ], 'fiqh');
        } else if (num === 4) {
            await sock.sendMessage(sender, { text: '🚧 قيد التطوير' });
            await sendMainMenu(sock, sender);
        } else if (num === 5) {
            await sendMenu(sock, sender, 'إضافة محتوى', [
                '1️⃣ ذكر', '2️⃣ فتوى', '3️⃣ محاضرة'
            ], 'add');
        } else if (num === 6) {
            await sendMenu(sock, sender, 'الجدولة', [
                '1️⃣ الأذكار - الصباح', '2️⃣ الأذكار - المساء', 
                '3️⃣ الفتاوى', '4️⃣ الفقه'
            ], 'schedule');
        } else if (num === 7) {
            await sendStats(sock, sender);
        }
        return true;
    }
    
    // الأذكار
    if (s.level === 'athkar') {
        if (num === 0) return await sendMainMenu(sock, sender);
        const types = ['morning', 'evening'];
        const names = ['الصباح', 'المساء'];
        if (num >= 1 && num <= 2) {
            await toggle(sock, sender, ['athkar', types[num-1]], `الأذكار - ${names[num-1]}`);
        }
        return true;
    }
    
    // الفقه
    if (s.level === 'fiqh') {
        if (num === 0) return await sendMainMenu(sock, sender);
        if (num === 1) {
            await sendMenu(sock, sender, 'العبادات', [
                '1️⃣ الصلاة', '2️⃣ الجنائز', '3️⃣ الزكاة', 
                '4️⃣ الصيام', '5️⃣ الحج', '6️⃣ الطهارة', '7️⃣ الجهاد'
            ], 'ibadat');
        } else {
            await sock.sendMessage(sender, { text: '🚧 قيد التطوير' });
            await sendMainMenu(sock, sender);
        }
        return true;
    }
    
    // العبادات
    if (s.level === 'ibadat') {
        if (num === 0) {
            await sendMenu(sock, sender, 'الفقه', [
                '1️⃣ العبادات', '2️⃣ المعاملات', 
                '3️⃣ فقه الأسرة', '4️⃣ العادات'
            ], 'fiqh');
            return true;
        }
        const topics = ['salah', 'janazah', 'zakah', 'siyam', 'hajj', 'taharah', 'jihad'];
        const names = ['الصلاة', 'الجنائز', 'الزكاة', 'الصيام', 'الحج', 'الطهارة', 'الجهاد'];
        if (num >= 1 && num <= 7) {
            await toggle(sock, sender, ['fiqh', 'ibadat', topics[num-1]], names[num-1]);
        }
        return true;
    }
    
    // إضافة
    if (s.level === 'add') {
        if (num === 0) return await sendMainMenu(sock, sender);
        if (num === 1) {
            await sendMenu(sock, sender, 'نوع الذكر', ['1️⃣ صباحي', '2️⃣ مسائي'], 'add_athkar');
        } else if (num === 2) {
            await sock.sendMessage(sender, { text: '✍️ اكتب نص الفتوى:' });
            sessions.set(sender, { level: 'text_fatwa' });
        } else if (num === 3) {
            await sendMenu(sock, sender, 'الفقه', ['1️⃣ العبادات'], 'add_fiqh');
        }
        return true;
    }
    
    if (s.level === 'add_athkar') {
        if (num === 0) {
            await sendMenu(sock, sender, 'إضافة محتوى', [
                '1️⃣ ذكر', '2️⃣ فتوى', '3️⃣ محاضرة'
            ], 'add');
            return true;
        }
        const types = ['morning', 'evening'];
        const names = ['صباحي', 'مسائي'];
        if (num >= 1 && num <= 2) {
            await sock.sendMessage(sender, { text: `✍️ اكتب نص الذكر ${names[num-1]}:` });
            sessions.set(sender, { level: 'text_athkar', type: types[num-1], name: names[num-1] });
        }
        return true;
    }
    
    if (s.level === 'add_fiqh') {
        if (num === 0) {
            await sendMenu(sock, sender, 'إضافة محتوى', [
                '1️⃣ ذكر', '2️⃣ فتوى', '3️⃣ محاضرة'
            ], 'add');
            return true;
        }
        if (num === 1) {
            await sendMenu(sock, sender, 'العبادات', [
                '1️⃣ الصلاة', '2️⃣ الجنائز', '3️⃣ الزكاة', 
                '4️⃣ الصيام', '5️⃣ الحج', '6️⃣ الطهارة', '7️⃣ الجهاد'
            ], 'add_ibadat');
        }
        return true;
    }
    
    if (s.level === 'add_ibadat') {
        if (num === 0) {
            await sendMenu(sock, sender, 'الفقه', ['1️⃣ العبادات'], 'add_fiqh');
            return true;
        }
        const topics = ['salah', 'janazah', 'zakah', 'siyam', 'hajj', 'taharah', 'jihad'];
        const names = ['الصلاة', 'الجنائز', 'الزكاة', 'الصيام', 'الحج', 'الطهارة', 'الجهاد'];
        if (num >= 1 && num <= 7) {
            await sock.sendMessage(sender, { text: `✍️ اكتب نص ${names[num-1]}:` });
            sessions.set(sender, { level: 'text_lecture', path: ['fiqh', 'ibadat', topics[num-1]], title: names[num-1] });
        }
        return true;
    }
    
    // الجدولة
    if (s.level === 'schedule') {
        if (num === 0) return await sendMainMenu(sock, sender);
        const sections = [
            { key: 'athkar_morning', name: 'الأذكار - الصباح' },
            { key: 'athkar_evening', name: 'الأذكار - المساء' },
            { key: 'fatawa', name: 'الفتاوى' }
        ];
        if (num >= 1 && num <= 3) {
            await sendMenu(sock, sender, sections[num-1].name, [
                '1️⃣ إضافة وقت', '2️⃣ الأوقات (عرض/حذف)', '3️⃣ تفعيل'
            ], 'schedule_sub');
            sessions.set(sender, { level: 'schedule_sub', section: sections[num-1].key, name: sections[num-1].name });
        } else if (num === 4) {
            await sendMenu(sock, sender, 'الفقه - الجدولة', [
                '1️⃣ الصلاة', '2️⃣ الجنائز', '3️⃣ الزكاة'
            ], 'schedule_fiqh');
        }
        return true;
    }
    
    if (s.level === 'schedule_fiqh') {
        if (num === 0) {
            await sendMenu(sock, sender, 'الجدولة', [
                '1️⃣ الأذكار - الصباح', '2️⃣ الأذكار - المساء', 
                '3️⃣ الفتاوى', '4️⃣ الفقه'
            ], 'schedule');
            return true;
        }
        const topics = ['salah', 'janazah', 'zakah'];
        const names = ['الصلاة', 'الجنائز', 'الزكاة'];
        if (num >= 1 && num <= 3) {
            await sendMenu(sock, sender, names[num-1], [
                '1️⃣ إضافة وقت', '2️⃣ عرض أوقات', '3️⃣ حذف وقت', '4️⃣ تفعيل'
            ], 'schedule_sub');
            sessions.set(sender, { level: 'schedule_sub', section: `fiqh_ibadat_${topics[num-1]}`, name: names[num-1] });
        }
        return true;
    }
    
    if (s.level === 'schedule_sub') {
        if (num === 0) {
            await sendMenu(sock, sender, 'الجدولة', [
                '1️⃣ الأذكار - الصباح', '2️⃣ الأذكار - المساء', 
                '3️⃣ الفتاوى', '4️⃣ الفقه'
            ], 'schedule');
            return true;
        }
        if (num === 1) {
            await sock.sendMessage(sender, { text: '⏰ اكتب الوقت (مثال: 6:30):' });
            sessions.set(sender, { level: 'set_time', section: s.section });
        } else if (num === 2) {
            await showTimesDelete(sock, sender, s.section);
        } else if (num === 3) {
            const settings = await db.getSettings();
            const current = settings[s.section]?.enabled || false;
            await db.updateScheduleStatus(s.section, !current);
            await sock.sendMessage(sender, { text: current ? '❌ معطّل' : '✅ مفعّل' });
            await sendMainMenu(sock, sender);
        }
        return true;
    }
    
    if (s.level === 'delete_time') {
        if (num === 0) return await sendMainMenu(sock, sender);
        const index = num - 1;
        if (index >= 0 && index < s.times.length) {
            s.times.splice(index, 1);
            await db.updateTime(s.section, s.times.join(','));
            await sock.sendMessage(sender, { text: '✅ تم الحذف' });
        }
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
        await db.addContent(['athkar', s.type], { title: `ذكر ${s.name}`, text, type: 'ذكر' });
        await sock.sendMessage(sender, { text: '✅ تم الحفظ' });
        sessions.delete(sender);
        await sendMainMenu(sock, sender);
        return true;
    }
    
    if (s.level === 'text_fatwa') {
        await db.addContent(['fatawa'], { title: 'فتوى', text, type: 'فتوى' });
        await sock.sendMessage(sender, { text: '✅ تم الحفظ' });
        sessions.delete(sender);
        await sendMainMenu(sock, sender);
        return true;
    }
    
    if (s.level === 'text_lecture') {
        await db.addContent(s.path, { title: s.title, text, type: 'محاضرة' });
        await sock.sendMessage(sender, { text: '✅ تم الحفظ' });
        sessions.delete(sender);
        await sendMainMenu(sock, sender);
        return true;
    }
    
    if (s.level === 'set_time') {
        const match = text.match(/^(\d{1,2}):(\d{2})$/);
        if (!match || parseInt(match[1]) > 23 || parseInt(match[2]) > 59) {
            await sock.sendMessage(sender, { text: '❌ صيغة خاطئة' });
            sessions.delete(sender);
            await sendMainMenu(sock, sender);
            return true;
        }
        
        const cron = `${match[2]} ${match[1]} * * *`;
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

async function showTimes(sock, sender, section) {
    const settings = await db.getSettings();
    const times = settings[section]?.time || '';
    if (!times) {
        await sock.sendMessage(sender, { text: 'لا أوقات' });
        return;
    }
    const list = times.split(',').map((c, i) => {
        const p = c.trim().split(' ');
        return `${i+1}. ${p[1]}:${p[0].padStart(2, '0')}`;
    }).join('\n');
    await sock.sendMessage(sender, { text: `⏰ الأوقات:\n\n${list}\n\n0️⃣ رجوع` });
}

async function showTimesDelete(sock, sender, section) {
    const settings = await db.getSettings();
    const times = settings[section]?.time || '';
    if (!times) {
        await sock.sendMessage(sender, { text: 'لا أوقات' });
        return;
    }
    const timesList = times.split(',');
    const list = timesList.map((c, i) => {
        const p = c.trim().split(' ');
        return `${i+1}. ${p[1]}:${p[0].padStart(2, '0')}`;
    }).join('\n');
    await sock.sendMessage(sender, { text: `⏰ الأوقات:\n\n${list}\n\nللحذف اختر رقم:\n0️⃣ رجوع` });
    sessions.set(sender, { level: 'delete_time', section, times: timesList });
}

async function sendStats(sock, sender) {
    const sections = [
        { path: ['athkar', 'morning'], name: 'الأذكار - الصباح' },
        { path: ['fatawa'], name: 'الفتاوى' },
        { path: ['fiqh', 'ibadat', 'salah'], name: 'الصلاة' }
    ];
    
    let stats = '*الإحصائيات:*\n\n';
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

    if (text === '/اسلام' || text === '/islam' || text === '/ادارة' || text === '/admin') {
        await sendMainMenu(sock, sender);
        return true;
    }

    if (text === '/restart' || text === '/اعادة') {
        if (!isAdmin) return false;
        await sock.sendMessage(sender, { text: '🔄 إعادة التشغيل...' });
        console.log('🔄 إعادة التشغيل بأمر من المستخدم');
        process.exit(0); // Clever Cloud سيعيد التشغيل تلقائياً
        return true;
    }

    if (text.startsWith('/test ') || text.startsWith('/اختبار ')) {
        if (!isAdmin) return false;
        
        const section = text.split(' ')[1];
        
        if (section === 'صباح' || section === 'morning') {
            await sock.sendMessage(sender, { text: '🧪 اختبار فوري: الأذكار - الصباح' });
            await sendContent(sock, ['athkar', 'morning'], 'الأذكار - الصباح');
        } else if (section === 'مساء' || section === 'evening') {
            await sock.sendMessage(sender, { text: '🧪 اختبار فوري: الأذكار - المساء' });
            await sendContent(sock, ['athkar', 'evening'], 'الأذكار - المساء');
        } else if (section === 'فتاوى' || section === 'fatawa') {
            await sock.sendMessage(sender, { text: '🧪 اختبار فوري: الفتاوى' });
            await sendContent(sock, ['fatawa'], 'الفتاوى');
        } else {
            await sock.sendMessage(sender, { text: '❌ استخدام:\n/test صباح\n/test مساء\n/test فتاوى' });
        }
        
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
            if (config.enabled && config.time) {
                let path, title;
                
                if (section === 'athkar_morning') {
                    path = ['athkar', 'morning'];
                    title = 'الأذكار - الصباح';
                } else if (section === 'athkar_evening') {
                    path = ['athkar', 'evening'];
                    title = 'الأذكار - المساء';
                } else if (section === 'fatawa') {
                    path = ['fatawa'];
                    title = 'الفتاوى';
                } else if (section.startsWith('fiqh_')) {
                    path = section.split('_');
                    title = `الفقه - ${path[path.length - 1]}`;
                } else {
                    continue;
                }
                
                await startSchedule(sock, path, title);
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

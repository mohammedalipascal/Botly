const cron = require('node-cron');
const db = require('../../database/googleSheets');

const islamicNav = new Map(); // مفتاح منفصل عن Admin
const NAV_TIMEOUT = 30 * 60 * 1000;

let jobs = {};

// إرسال محتوى من DB
async function sendContent(sock, path, title) {
    try {
        const group = process.env.ISLAMIC_GROUP_ID;
        if (!group) return;
        
        const content = await db.getContent(path);
        if (!content || content.length === 0) {
            console.log(`لا محتوى في ${title}`);
            return;
        }
        
        const first = content[0];
        if (!first.enabled) {
            console.log(`${title} معطّل`);
            return;
        }
        
        const index = first.lastSentIndex || 0;
        if (index >= content.length) {
            console.log(`انتهى ${title}`);
            return;
        }
        
        const item = content[index];
        
        // إرسال نص بسيط بدون markdown
        const message = `${item.title}\n\n${item.text}`;
        
        await sock.sendMessage(group, { text: message });
        await db.updateIndex(path, item.id, index + 1);
        
        console.log(`✅ تم إرسال: ${item.title}`);
    } catch (e) {
        console.error(`خطأ في ${title}:`, e.message);
    }
}

// Poll Menu
async function sendPoll(sock, sender, level, path = []) {
    let name = '';
    let opts = [];
    
    if (level === 'islamic_main') {
        name = 'القسم الاسلامي';
        opts = ['1️⃣ الأذكار', '2️⃣ الفتاوى', '3️⃣ الفقه', '4️⃣ الموضوعية'];
    } else if (level === 'islamic_athkar') {
        name = 'الأذكار';
        opts = ['1️⃣ صباحي', '2️⃣ مسائي', '0️⃣ رجوع'];
    } else if (level === 'islamic_fiqh_main') {
        name = 'الفقه';
        opts = ['1️⃣ العبادات', '2️⃣ المعاملات', '3️⃣ فقه الأسرة', '4️⃣ العادات', '0️⃣ رجوع'];
    } else if (level === 'islamic_fiqh_ibadat') {
        name = 'العبادات';
        opts = ['1️⃣ الصلاة', '2️⃣ الجنائز', '3️⃣ الزكاة', '4️⃣ الصيام', '5️⃣ الحج', '6️⃣ الطهارة', '7️⃣ الجهاد', '0️⃣ رجوع'];
    }
    
    if (opts.length > 0) {
        await sock.sendMessage(sender, {
            poll: { name, values: opts, selectableCount: 1 }
        });
        
        islamicNav.set(sender, { level, path, timestamp: Date.now() });
        console.log(`✅ Poll: ${name}`);
    }
}

// Toggle محتوى
async function toggleContent(sock, sender, path, title) {
    try {
        const content = await db.getContent(path);
        
        if (!content || content.length === 0) {
            await sock.sendMessage(sender, { text: `لا محتوى في ${title}\n\nأضف من /ادارة أولاً` });
            return true;
        }
        
        const first = content[0];
        const newStatus = !first.enabled;
        
        await db.updateStatus(path, first.id, newStatus);
        
        const msg = newStatus ? `✅ تفعيل: ${title}` : `❌ تعطيل: ${title}`;
        await sock.sendMessage(sender, { text: msg });
        
        if (newStatus) {
            await sendContent(sock, path, title);
            await startSchedule(sock, path, title);
        } else {
            stopSchedule(path);
        }
        
        return true;
    } catch (e) {
        console.error('خطأ toggle:', e.message);
        return false;
    }
}

// Schedules - دعم أوقات متعددة
async function startSchedule(sock, path, title) {
    const key = path.join('_');
    
    // إيقاف الجدولة القديمة
    if (jobs[key]) {
        if (Array.isArray(jobs[key])) {
            jobs[key].forEach(j => j.stop());
        } else {
            jobs[key].stop();
        }
        delete jobs[key];
    }
    
    try {
        // جلب الأوقات من Settings
        const settings = await db.getSettings();
        
        // البحث عن القسم الصحيح
        let section = '';
        if (path[0] === 'athkar') {
            section = `athkar_${path[1]}`; // athkar_morning
        } else if (path[0] === 'fatawa') {
            section = 'fatawa';
        } else {
            section = path.join('_'); // fiqh_ibadat_salah
        }
        
        const times = settings[section]?.time || '';
        
        if (!times) {
            console.log(`لا أوقات للقسم: ${section}`);
            return;
        }
        
        const timesList = times.split(',').filter(t => t.trim());
        jobs[key] = [];
        
        timesList.forEach((cronTime, index) => {
            const job = cron.schedule(cronTime.trim(), () => {
                console.log(`⏰ وقت الجدولة: ${title}`);
                sendContent(sock, path, title);
            }, { timezone: "Africa/Cairo" });
            
            jobs[key].push(job);
        });
        
        console.log(`⏰ جدولة ${title}: ${timesList.length} وقت`);
    } catch (e) {
        console.error(`خطأ في جدولة ${title}:`, e.message);
    }
}

function stopSchedule(path) {
    const key = path.join('_');
    if (jobs[key]) {
        jobs[key].forEach(j => j.stop());
        delete jobs[key];
    }
}

// التنقل
async function handleNumber(sock, sender, num) {
    const session = islamicNav.get(sender);
    if (!session) return false;
    
    const { level } = session;
    
    if (level === 'islamic_main') {
        if (num === 1) {
            await sendPoll(sock, sender, 'islamic_athkar', ['athkar']);
            return true;
        } else if (num === 2) {
            return await toggleContent(sock, sender, ['fatawa'], 'الفتاوى');
        } else if (num === 3) {
            await sendPoll(sock, sender, 'islamic_fiqh_main', ['fiqh']);
            return true;
        } else if (num === 4) {
            await sock.sendMessage(sender, { text: '🚧 قيد التطوير' });
            return true;
        }
    } 
    else if (level === 'islamic_athkar') {
        if (num === 0) {
            await sendPoll(sock, sender, 'islamic_main');
            return true;
        }
        const types = ['morning', 'evening'];
        const names = ['الأذكار الصباحية', 'الأذكار المسائية'];
        if (num >= 1 && num <= 2) {
            return await toggleContent(sock, sender, ['athkar', types[num-1]], names[num-1]);
        }
    }
    else if (level === 'islamic_fiqh_main') {
        if (num === 0) {
            await sendPoll(sock, sender, 'islamic_main');
            return true;
        } else if (num === 1) {
            await sendPoll(sock, sender, 'islamic_fiqh_ibadat', ['fiqh', 'ibadat']);
            return true;
        } else {
            await sock.sendMessage(sender, { text: '🚧 قيد التطوير' });
            return true;
        }
    } 
    else if (level === 'islamic_fiqh_ibadat') {
        if (num === 0) {
            await sendPoll(sock, sender, 'islamic_fiqh_main', ['fiqh']);
            return true;
        }
        const topics = ['salah', 'janazah', 'zakah', 'siyam', 'hajj', 'taharah', 'jihad'];
        const names = ['الصلاة', 'الجنائز', 'الزكاة', 'الصيام', 'الحج', 'الطهارة', 'الجهاد'];
        
        if (num >= 1 && num <= 7) {
            const path = ['fiqh', 'ibadat', topics[num - 1]];
            return await toggleContent(sock, sender, path, names[num - 1]);
        }
    }
    
    return false;
}

// Command Handler
async function handleIslamicCommand(sock, msg, text, sender) {
    const isAdmin = sender.includes('249962204268') || 
                    sender.includes('231211024814174') ||
                    sender.includes('252355702448348') ||
                    msg.key.fromMe;

    if (!isAdmin) return false;

    const cmd = text.trim();

    if (cmd === '/اسلام' || cmd === '/islam') {
        await sendPoll(sock, sender, 'islamic_main');
        return true;
    }

    // فقط معالجة الأرقام إذا كانت هناك جلسة islamic
    const session = islamicNav.get(sender);
    if (!session) return false;

    if (/^\d{1,2}$/.test(cmd)) {
        return await handleNumber(sock, sender, parseInt(cmd));
    }

    return false;
}

// Init
async function initializeIslamicModule(sock) {
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
                        const job = require('node-cron').schedule(cron.trim(), () => {
                            sendContent(sock, ['athkar', type], `الأذكار`);
                        }, { timezone: "Africa/Cairo" });
                        
                        const key = `athkar_${type}`;
                        if (!jobs[key]) jobs[key] = [];
                        jobs[key].push(job);
                    } else if (section === 'fatawa') {
                        const job = require('node-cron').schedule(cron.trim(), () => {
                            sendContent(sock, ['fatawa'], 'الفتاوى');
                        }, { timezone: "Africa/Cairo" });
                        
                        if (!jobs['fatawa']) jobs['fatawa'] = [];
                        jobs['fatawa'].push(job);
                    }
                });
            }
        }

        console.log('✅ القسم الإسلامي جاهز');
    } catch (e) {
        console.error('❌ فشل تشغيل القسم الإسلامي:', e.message);
    }
}

function islamicIsEnabled() {
    return !!(process.env.ISLAMIC_GROUP_ID && process.env.GOOGLE_SHEET_ID);
}

module.exports = {
    handleIslamicCommand,
    initializeIslamicModule,
    islamicIsEnabled
};

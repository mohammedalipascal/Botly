const cron = require('node-cron');
const db = require('../../database/googleSheets');

const userNav = new Map();
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
        await sock.sendMessage(group, { text: `*${item.title}*\n\n${item.text}` });
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
    
    if (level === 'main') {
        name = 'القسم الاسلامي';
        opts = ['1️⃣ الأذكار', '2️⃣ الفتاوى', '3️⃣ الفقه', '4️⃣ الموضوعية'];
    } else if (level === 'fiqh_main') {
        name = 'الفقه';
        opts = ['1️⃣ العبادات', '2️⃣ المعاملات', '3️⃣ فقه الأسرة', '4️⃣ العادات'];
    } else if (level === 'fiqh_ibadat') {
        name = 'العبادات';
        opts = ['1️⃣ الصلاة', '2️⃣ الجنائز', '3️⃣ الزكاة', '4️⃣ الصيام', '5️⃣ الحج', '6️⃣ الطهارة', '7️⃣ الجهاد'];
    }
    
    if (opts.length > 0) {
        await sock.sendMessage(sender, {
            poll: { name, values: opts, selectableCount: 1 }
        });
        
        userNav.set(sender, { level, path, timestamp: Date.now() });
        console.log(`✅ Poll: ${name}`);
    }
}

// Toggle محتوى
async function toggleContent(sock, sender, path, title) {
    try {
        const content = await db.getContent(path);
        
        if (!content || content.length === 0) {
            await sock.sendMessage(sender, { text: `لا محتوى في ${title}` });
            return true;
        }
        
        const first = content[0];
        const newStatus = !first.enabled;
        
        await db.updateStatus(path, first.id, newStatus);
        
        const msg = newStatus ? `✅ تفعيل: ${title}` : `❌ تعطيل: ${title}`;
        await sock.sendMessage(sender, { text: msg });
        
        if (newStatus) {
            await sendContent(sock, path, title);
            startSchedule(sock, path, title);
        } else {
            stopSchedule(path);
        }
        
        return true;
    } catch (e) {
        console.error('خطأ toggle:', e.message);
        return false;
    }
}

// Schedules
function startSchedule(sock, path, title) {
    const key = path.join('_');
    if (jobs[key]) jobs[key].stop();
    
    jobs[key] = cron.schedule('0 * * * *', () => sendContent(sock, path, title), {
        timezone: "Africa/Cairo"
    });
    
    console.log(`⏰ جدولة: ${title}`);
}

function stopSchedule(path) {
    const key = path.join('_');
    if (jobs[key]) {
        jobs[key].stop();
        delete jobs[key];
    }
}

// التنقل
async function handleNumber(sock, sender, num) {
    const session = userNav.get(sender);
    if (!session) return false;
    
    const { level } = session;
    
    if (level === 'main') {
        if (num === 1) {
            await sock.sendMessage(sender, { text: '🚧 الأذكار - أضف محتوى من /ادارة' });
            return true;
        } else if (num === 2) {
            await sock.sendMessage(sender, { text: '🚧 الفتاوى - أضف محتوى من /ادارة' });
            return true;
        } else if (num === 3) {
            await sendPoll(sock, sender, 'fiqh_main', ['fiqh']);
            return true;
        } else if (num === 4) {
            await sock.sendMessage(sender, { text: '🚧 قيد التطوير' });
            return true;
        }
    } else if (level === 'fiqh_main') {
        if (num === 1) {
            await sendPoll(sock, sender, 'fiqh_ibadat', ['fiqh', 'ibadat']);
            return true;
        }
    } else if (level === 'fiqh_ibadat') {
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
        await sendPoll(sock, sender, 'main');
        return true;
    }

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
                const key = section;
                jobs[key] = cron.schedule(config.time, () => {
                    if (section.includes('athkar')) {
                        const type = section.split('_')[1];
                        sendContent(sock, ['athkar', type], `الأذكار - ${type}`);
                    } else if (section === 'fatawa') {
                        sendContent(sock, ['fatawa'], 'الفتاوى');
                    }
                }, { timezone: "Africa/Cairo" });
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

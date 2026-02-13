const db = require('../../database/googleSheets');

// لوحة الإدارة
class AdminPanel {
    constructor() {
        this.adminSessions = new Map(); // تتبع جلسات الأدمن
    }

    // التحقق من صلاحيات الأدمن
    isAdmin(sender) {
        const isAdminCheck = sender.includes('249962204268') || 
                            sender.includes('231211024814174');
        console.log(`🔐 Admin check for ${sender}: ${isAdminCheck}`);
        return isAdminCheck;
    }

    // معالج الأوامر الرئيسي
    async handleAdminCommand(sock, msg, messageText, sender) {
        console.log(`📝 Admin handler called: ${messageText} from ${sender}`);
        
        if (!this.isAdmin(sender)) {
            console.log('⛔ Not admin - ignoring');
            return false;
        }

        const cmd = messageText.trim();

        // القائمة الرئيسية
        if (cmd === '/ادارة' || cmd === '/admin') {
            console.log('✅ Showing admin main menu');
            await this.sendMainMenu(sock, sender);
            return true;
        }

        // معالجة الأرقام بناءً على الجلسة
        const session = this.adminSessions.get(sender);
        
        if (session && /^[0-9]{1,2}$/.test(cmd)) {
            return await this.handleNumberChoice(sock, sender, parseInt(cmd), session);
        }

        // أوامر مباشرة
        if (cmd.startsWith('/add_lecture ')) {
            return await this.handleAddLectureCommand(sock, sender, cmd);
        }

        if (cmd.startsWith('/update_schedule ')) {
            return await this.handleUpdateScheduleCommand(sock, sender, cmd);
        }

        return false;
    }

    // ═══════════════════════════════════════════════════════════
    // القوائم
    // ═══════════════════════════════════════════════════════════

    // القائمة الرئيسية
    async sendMainMenu(sock, sender) {
        const menu = `╔═══════════════════════════╗
║   ⚙️ لوحة الإدارة      ║
╚═══════════════════════════╝

┌─────────────────────────┐
│  1️⃣ إدارة المحاضرات      │
│  2️⃣ إدارة الجدولة        │
│  3️⃣ إحصائيات            │
│  4️⃣ إعدادات عامة         │
└─────────────────────────┘

💬 اكتب الرقم للاختيار`;

        await sock.sendMessage(sender, { text: menu });
        
        this.adminSessions.set(sender, {
            level: 'main',
            timestamp: Date.now()
        });
    }

    // قائمة إدارة المحاضرات
    async sendLecturesMenu(sock, sender) {
        const menu = `╔═══════════════════════════╗
║   📚 إدارة المحاضرات    ║
╚═══════════════════════════╝

┌─────────────────────────┐
│  1️⃣ إضافة محاضرة جديدة   │
│  2️⃣ عرض جميع المحاضرات   │
│  3️⃣ تعديل محاضرة         │
│  4️⃣ حذف محاضرة           │
│  5️⃣ تفعيل/تعطيل محاضرة   │
│  0️⃣ رجوع                 │
└─────────────────────────┘

💬 اكتب الرقم`;

        await sock.sendMessage(sender, { text: menu });
        
        this.adminSessions.set(sender, {
            level: 'lectures_menu',
            timestamp: Date.now()
        });
    }

    // قائمة إدارة الجدولة
    async sendScheduleMenu(sock, sender) {
        try {
            const settings = await db.getScheduleSettings();
            
            let menu = `╔═══════════════════════════╗
║   ⏰ إدارة الجدولة      ║
╚═══════════════════════════╝

*الجدولة الحالية:*

`;

            let index = 1;
            for (const [section, config] of Object.entries(settings)) {
                const status = config.enabled ? '✅' : '❌';
                menu += `${index}️⃣ ${status} *${section}*\n   ⏰ ${config.time}\n\n`;
                index++;
            }

            menu += `┌─────────────────────────┐
│  تعديل وقت أي قسم      │
│  0️⃣ رجوع                │
└─────────────────────────┘

💬 اكتب الرقم لتعديل الوقت`;

            await sock.sendMessage(sender, { text: menu });
            
            this.adminSessions.set(sender, {
                level: 'schedule_menu',
                settings: settings,
                timestamp: Date.now()
            });

        } catch (error) {
            await sock.sendMessage(sender, {
                text: `❌ فشل جلب إعدادات الجدولة: ${error.message}`
            });
        }
    }

    // قائمة الإحصائيات
    async sendStatsMenu(sock, sender) {
        try {
            // جلب إحصائيات من جميع الأقسام
            const sections = [
                ['fiqh', 'ibadat', 'salah', 'hukmSalah'],
                ['fiqh', 'ibadat', 'salah', 'rukoo'],
                // يمكن إضافة المزيد
            ];

            let stats = `╔═══════════════════════════╗
║   📊 الإحصائيات         ║
╚═══════════════════════════╝

`;

            for (const sectionPath of sections) {
                const lectures = await db.getLectures(sectionPath);
                const enabled = lectures.filter(l => l.enabled).length;
                const total = lectures.length;

                stats += `📁 *${sectionPath.join(' > ')}*\n`;
                stats += `   📚 المحاضرات: ${total}\n`;
                stats += `   ✅ المفعّلة: ${enabled}\n`;
                stats += `   ❌ المعطّلة: ${total - enabled}\n\n`;
            }

            stats += `┌─────────────────────────┐
│  0️⃣ رجوع                │
└─────────────────────────┘`;

            await sock.sendMessage(sender, { text: stats });
            
            this.adminSessions.set(sender, {
                level: 'stats_menu',
                timestamp: Date.now()
            });

        } catch (error) {
            await sock.sendMessage(sender, {
                text: `❌ فشل جلب الإحصائيات: ${error.message}`
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // معالجة الاختيارات
    // ═══════════════════════════════════════════════════════════

    async handleNumberChoice(sock, sender, choice, session) {
        const { level } = session;

        // القائمة الرئيسية
        if (level === 'main') {
            if (choice === 1) {
                await this.sendLecturesMenu(sock, sender);
                return true;
            }
            else if (choice === 2) {
                await this.sendScheduleMenu(sock, sender);
                return true;
            }
            else if (choice === 3) {
                await this.sendStatsMenu(sock, sender);
                return true;
            }
            else if (choice === 4) {
                await sock.sendMessage(sender, {
                    text: '⚠️ الإعدادات العامة قيد التطوير'
                });
                return true;
            }
        }

        // قائمة المحاضرات
        else if (level === 'lectures_menu') {
            if (choice === 0) {
                await this.sendMainMenu(sock, sender);
                return true;
            }
            else if (choice === 1) {
                await this.startAddLectureWizard(sock, sender);
                return true;
            }
            else if (choice === 2) {
                await this.showAllLectures(sock, sender);
                return true;
            }
            else if (choice === 3) {
                await sock.sendMessage(sender, {
                    text: '⚠️ تعديل المحاضرات قيد التطوير'
                });
                return true;
            }
            else if (choice === 4) {
                await sock.sendMessage(sender, {
                    text: '⚠️ حذف المحاضرات قيد التطوير'
                });
                return true;
            }
            else if (choice === 5) {
                await sock.sendMessage(sender, {
                    text: '⚠️ تفعيل/تعطيل قيد التطوير'
                });
                return true;
            }
        }

        // قائمة الجدولة
        else if (level === 'schedule_menu') {
            if (choice === 0) {
                await this.sendMainMenu(sock, sender);
                return true;
            }
            else {
                const sections = Object.keys(session.settings);
                if (choice > 0 && choice <= sections.length) {
                    const selectedSection = sections[choice - 1];
                    await this.startScheduleEditWizard(sock, sender, selectedSection);
                    return true;
                }
            }
        }

        // قائمة الإحصائيات
        else if (level === 'stats_menu') {
            if (choice === 0) {
                await this.sendMainMenu(sock, sender);
                return true;
            }
        }

        return false;
    }

    // ═══════════════════════════════════════════════════════════
    // معالجات متقدمة
    // ═══════════════════════════════════════════════════════════

    // بدء معالج إضافة محاضرة
    async startAddLectureWizard(sock, sender) {
        const msg = `📝 *إضافة محاضرة جديدة*

أرسل البيانات بالتنسيق التالي:

\`\`\`
/add_lecture
القسم: fiqh/ibadat/salah/hukmSalah
العنوان: محاضرة جديدة
رابط الصفحة: https://...
رابط الصوت: https://...
النوع: lecture
\`\`\`

مثال:
\`\`\`
/add_lecture
fiqh/ibadat/salah/hukmSalah
محاضرة تجريبية
https://binbaz.org.sa/...
https://files.zadapps.info/...
lecture
\`\`\``;

        await sock.sendMessage(sender, { text: msg });
    }

    // معالج أمر إضافة محاضرة
    async handleAddLectureCommand(sock, sender, cmd) {
        try {
            const lines = cmd.split('\n').filter(l => l.trim());
            
            if (lines.length < 5) {
                await sock.sendMessage(sender, {
                    text: '❌ بيانات غير كاملة. استخدم /add_lecture مع جميع البيانات'
                });
                return true;
            }

            const sectionPath = lines[1].trim().split('/');
            const title = lines[2].trim();
            const pageUrl = lines[3].trim();
            const audioUrl = lines[4].trim();
            const type = lines[5]?.trim() || 'lecture';

            const lecture = {
                id: `lecture_${Date.now()}`,
                title,
                pageUrl,
                audioUrl,
                type,
                enabled: true
            };

            const success = await db.addLecture(sectionPath, lecture);

            if (success) {
                await sock.sendMessage(sender, {
                    text: `✅ تم إضافة المحاضرة بنجاح!\n\n📚 ${title}`
                });
            } else {
                await sock.sendMessage(sender, {
                    text: '❌ فشل إضافة المحاضرة'
                });
            }

            return true;

        } catch (error) {
            await sock.sendMessage(sender, {
                text: `❌ خطأ: ${error.message}`
            });
            return true;
        }
    }

    // عرض جميع المحاضرات
    async showAllLectures(sock, sender) {
        try {
            await sock.sendMessage(sender, {
                text: '⏳ جاري جلب المحاضرات...'
            });

            // جلب من قسم واحد كمثال
            const lectures = await db.getLectures(['fiqh', 'ibadat', 'salah', 'hukmSalah']);

            if (lectures.length === 0) {
                await sock.sendMessage(sender, {
                    text: '📭 لا توجد محاضرات في هذا القسم'
                });
                return true;
            }

            let list = `📚 *المحاضرات - حكم الصلاة وأهميتها*\n\n`;

            lectures.forEach((lecture, index) => {
                const status = lecture.enabled ? '✅' : '❌';
                list += `${index + 1}. ${status} *${lecture.title}*\n`;
                list += `   📍 المؤشر: ${lecture.lastSentIndex}\n\n`;
            });

            await sock.sendMessage(sender, { text: list });
            return true;

        } catch (error) {
            await sock.sendMessage(sender, {
                text: `❌ فشل جلب المحاضرات: ${error.message}`
            });
            return true;
        }
    }

    // بدء معالج تعديل الجدولة
    async startScheduleEditWizard(sock, sender, section) {
        const msg = `⏰ *تعديل جدولة: ${section}*

أرسل الوقت الجديد بصيغة Cron:

مثال:
\`\`\`
/update_schedule ${section} 0 14 * * *
\`\`\`

📖 شرح صيغة Cron:
• دقيقة (0-59)
• ساعة (0-23)
• يوم من الشهر (1-31)
• شهر (1-12)
• يوم من الأسبوع (0-6)

مثال: \`0 14 * * *\` = كل يوم الساعة 2 ظهراً`;

        await sock.sendMessage(sender, { text: msg });
    }

    // معالج أمر تحديث الجدولة
    async handleUpdateScheduleCommand(sock, sender, cmd) {
        try {
            const parts = cmd.split(' ').filter(p => p);
            
            if (parts.length < 7) {
                await sock.sendMessage(sender, {
                    text: '❌ صيغة خاطئة. استخدم: /update_schedule [section] [cron expression]'
                });
                return true;
            }

            const section = parts[1];
            const cronExpression = parts.slice(2).join(' ');

            const success = await db.updateScheduleTime(section, cronExpression);

            if (success) {
                await sock.sendMessage(sender, {
                    text: `✅ تم تحديث جدولة ${section}\n\n⏰ الوقت الجديد: ${cronExpression}`
                });
            } else {
                await sock.sendMessage(sender, {
                    text: '❌ فشل تحديث الجدولة'
                });
            }

            return true;

        } catch (error) {
            await sock.sendMessage(sender, {
                text: `❌ خطأ: ${error.message}`
            });
            return true;
        }
    }

    // تنظيف الجلسات القديمة
    cleanOldSessions() {
        const now = Date.now();
        const TIMEOUT = 30 * 60 * 1000; // 30 دقيقة

        for (const [sender, session] of this.adminSessions.entries()) {
            if (now - session.timestamp > TIMEOUT) {
                this.adminSessions.delete(sender);
            }
        }
    }
}

// تنظيف دوري
const adminPanel = new AdminPanel();
setInterval(() => adminPanel.cleanOldSessions(), 5 * 60 * 1000);

module.exports = adminPanel;

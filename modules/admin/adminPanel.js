const db = require('../../database/googleSheets');

// لوحة الإدارة
class AdminPanel {
    constructor() {
        this.adminSessions = new Map(); // تتبع جلسات الأدمن
    }

    // التحقق من صلاحيات الأدمن
    isAdmin(sender) {
        return sender.includes('249962204268') || 
               sender.includes('231211024814174') ||
               sender.includes('252355702448348');
    }

    // معالج الأوامر الرئيسي
    async handleAdminCommand(sock, msg, messageText, sender) {
        if (!this.isAdmin(sender)) return false;

        const cmd = messageText.trim();
        const session = this.adminSessions.get(sender);

        // القائمة الرئيسية
        if (cmd === '/ادارة' || cmd === '/admin') {
            console.log('✅ Admin: Opening admin panel');
            await this.sendMainMenu(sock, sender);
            return true;
        }

        // معالجة الأرقام
        if (/^[0-9]{1,2}$/.test(cmd)) {
            if (session) {
                return await this.handleNumberChoice(sock, sender, parseInt(cmd), session);
            }
        }
        
        // معالجة النصوص (روابط، أسماء أقسام، إلخ)
        if (session) {
            // انتظار رابط المحاضرة
            if (session.level === 'waiting_lecture_url') {
                if (cmd.startsWith('http')) {
                    return await this.handleLectureUrl(sock, sender, cmd, session.path, session.topicName);
                }
            }
            
            // تعديل العنوان أو الحفظ
            if (session.level === 'editing_lecture_title') {
                if (cmd === 'تم') {
                    // استخدام العنوان المقترح
                    return await this.saveLecture(sock, sender, session.path, session.url, session.suggestedTitle);
                } else {
                    // استخدام العنوان الجديد
                    return await this.saveLecture(sock, sender, session.path, session.url, cmd);
                }
            }
            
            // إنشاء قسم جديد
            if (session.level === 'creating_new_category') {
                return await this.handleNewCategoryName(sock, sender, cmd, session.path);
            }
        }

        return false;
    }
    
    // معالج رابط المحاضرة
    async handleLectureUrl(sock, sender, url, path, topicName) {
        try {
            await sock.sendMessage(sender, {
                text: `⏳ جاري جلب المحاضرة...`
            });
            
            const { fetchLectureContent } = require('../islamic/lectureHandler');
            const content = await fetchLectureContent(url);
            
            if (!content) {
                await sock.sendMessage(sender, {
                    text: `❌ فشل جلب المحاضرة من الرابط`
                });
                return true;
            }
            
            // عرض المحاضرة واقتراح العنوان
            await sock.sendMessage(sender, {
                text: `✅ *تم جلب المحاضرة بنجاح!*\n\n📌 *العنوان المقترح:*\n${content.title}\n\n✍️ *اكتب عنوان جديد* أو اكتب *تم* لاستخدام العنوان الحالي`
            });
            
            this.adminSessions.set(sender, {
                level: 'editing_lecture_title',
                path: path,
                url: url,
                audioUrl: content.audioUrl || '',
                suggestedTitle: content.title,
                topicName: topicName,
                timestamp: Date.now()
            });
            
            return true;
            
        } catch (error) {
            await sock.sendMessage(sender, {
                text: `❌ خطأ: ${error.message}`
            });
            return true;
        }
    }
    
    // حفظ المحاضرة في Google Sheets
    async saveLecture(sock, sender, path, pageUrl, title) {
        try {
            const session = this.adminSessions.get(sender);
            
            await sock.sendMessage(sender, {
                text: `💾 جاري الحفظ...`
            });
            
            const lecture = {
                id: `lecture_${Date.now()}`,
                title: title,
                pageUrl: pageUrl,
                audioUrl: session.audioUrl || '',
                type: 'lecture',
                enabled: true
            };
            
            const success = await db.addLecture(path, lecture);
            
            if (success) {
                await sock.sendMessage(sender, {
                    text: `✅ *تم حفظ المحاضرة بنجاح!*\n\n📚 ${title}\n📍 ${session.topicName}\n\n💡 يمكنك الآن تفعيل القسم من القائمة الإسلامية`
                });
                
                // العودة للقائمة الرئيسية
                this.adminSessions.delete(sender);
                await this.sendMainMenu(sock, sender);
            } else {
                await sock.sendMessage(sender, {
                    text: `❌ فشل حفظ المحاضرة في قاعدة البيانات`
                });
            }
            
            return true;
            
        } catch (error) {
            await sock.sendMessage(sender, {
                text: `❌ خطأ في الحفظ: ${error.message}`
            });
            return true;
        }
    }
    
    // معالج اسم القسم الجديد
    async handleNewCategoryName(sock, sender, categoryName, parentPath) {
        try {
            const categoryKey = categoryName
                .toLowerCase()
                .replace(/\s+/g, '_')
                .replace(/[^\w_]/g, '');
            
            // TODO: إضافة القسم الجديد في Google Sheets
            
            await sock.sendMessage(sender, {
                text: `✅ تم إنشاء القسم: ${categoryName}\n\n📍 المسار: ${[...parentPath, categoryKey].join(' > ')}\n\n📎 أرسل رابط المحاضرة الآن`
            });
            
            this.adminSessions.set(sender, {
                level: 'waiting_lecture_url',
                path: [...parentPath, categoryKey],
                timestamp: Date.now()
            });
            
            return true;
            
        } catch (error) {
            await sock.sendMessage(sender, {
                text: `❌ خطأ: ${error.message}`
            });
            return true;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // القوائم
    // ═══════════════════════════════════════════════════════════

    // القائمة الرئيسية - Poll
    async sendMainMenu(sock, sender) {
        const pollName = 'لوحة الإدارة';
        const options = [
            '1️⃣ إدارة المحاضرات',
            '2️⃣ إدارة الجدولة',
            '3️⃣ إحصائيات'
        ];
        
        await sock.sendMessage(sender, {
            poll: {
                name: pollName,
                values: options,
                selectableCount: 1
            }
        });
        
        this.adminSessions.set(sender, {
            level: 'main',
            timestamp: Date.now()
        });
    }

    // قائمة إدارة المحاضرات - Poll
    async sendLecturesMenu(sock, sender) {
        const pollName = 'إدارة المحاضرات';
        const options = [
            '1️⃣ إضافة محاضرة',
            '2️⃣ عرض المحاضرات',
            '3️⃣ حذف محاضرة',
            '0️⃣ رجوع'
        ];
        
        await sock.sendMessage(sender, {
            poll: {
                name: pollName,
                values: options,
                selectableCount: 1
            }
        });
        
        this.adminSessions.set(sender, {
            level: 'lectures_menu',
            timestamp: Date.now()
        });
    }

    // قائمة إدارة الجدولة - Poll بسيط
    async sendScheduleMenu(sock, sender) {
        const pollName = 'إدارة الجدولة - اختر القسم';
        const options = [
            '1️⃣ الأذكار',
            '2️⃣ الفتاوى',
            '3️⃣ الفقه',
            '4️⃣ الموضوعية',
            '0️⃣ رجوع'
        ];
        
        await sock.sendMessage(sender, {
            poll: {
                name: pollName,
                values: options,
                selectableCount: 1
            }
        });
        
        this.adminSessions.set(sender, {
            level: 'schedule_menu',
            timestamp: Date.now()
        });
    }
    
    // قائمة فرعية للجدولة
    async sendScheduleSubMenu(sock, sender, section, sectionName) {
        const pollName = `${sectionName} - الجدولة`;
        const options = [
            '1️⃣ تعيين الوقت',
            '2️⃣ تفعيل/تعطيل',
            '0️⃣ رجوع'
        ];
        
        await sock.sendMessage(sender, {
            poll: {
                name: pollName,
                values: options,
                selectableCount: 1
            }
        });
        
        this.adminSessions.set(sender, {
            level: 'schedule_submenu',
            section: section,
            sectionName: sectionName,
            timestamp: Date.now()
        });
    }

    // قائمة الإحصائيات - بسيطة
    async sendStatsMenu(sock, sender) {
        try {
            let stats = `*الإحصائيات - الأقسام المفعلة:*\n\n`;
            
            // جلب الأقسام المفعلة من Google Sheets
            const sections = [
                { path: ['fiqh', 'ibadat', 'salah'], name: 'الفقه - الصلاة' },
                { path: ['fiqh', 'ibadat', 'janazah'], name: 'الفقه - الجنائز' },
                { path: ['fiqh', 'ibadat', 'zakah'], name: 'الفقه - الزكاة' }
            ];

            let activeCount = 0;
            
            for (const section of sections) {
                try {
                    const lectures = await db.getLectures(section.path);
                    if (lectures && lectures.length > 0 && lectures[0].enabled) {
                        activeCount++;
                        const progress = lectures[0].lastSentIndex || 0;
                        const total = lectures.length;
                        stats += `✅ *${section.name}*\n   📊 ${progress}/${total} محاضرات\n\n`;
                    }
                } catch (e) {
                    // تجاهل الأقسام غير الموجودة
                }
            }
            
            if (activeCount === 0) {
                stats += '📭 لا توجد أقسام مفعلة حالياً';
            }
            
            stats += `\n\n0️⃣ رجوع`;

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
                await sock.sendMessage(sender, { text: '🚧 قيد التطوير' });
                return true;
            }
        }

        // إضافة محاضرة - الخطوة 1: القسم الرئيسي
        else if (level === 'add_lecture_step1') {
            if (choice === 0) {
                await this.sendLecturesMenu(sock, sender);
                return true;
            }
            else if (choice === 1) {
                await this.navigateFiqh(sock, sender, 'subsection');
                return true;
            }
            else if (choice === 2) {
                await sock.sendMessage(sender, { text: '🚧 الموضوعية قيد التطوير' });
                return true;
            }
        }

        // الفقه - اختيار القسم الفرعي
        else if (level === 'add_lecture_fiqh_subsection') {
            if (choice === 0) {
                await this.startAddLectureWizard(sock, sender);
                return true;
            }
            else if (choice === 1) {
                session.selectedSubsection = 'ibadat';
                this.adminSessions.set(sender, session);
                await this.navigateFiqh(sock, sender, 'topic');
                return true;
            }
        }

        // العبادات - اختيار الموضوع (نهائي)
        else if (level === 'add_lecture_fiqh_final') {
            if (choice === 0) {
                await this.navigateFiqh(sock, sender, 'subsection');
                return true;
            }
            else if (choice === 8) { // ➕ إنشاء قسم جديد
                await this.createNewCategory(sock, sender, session.path);
                return true;
            }
            else if (choice >= 1 && choice <= 7) {
                const topics = ['salah', 'janazah', 'zakah', 'siyam', 'hajj', 'taharah', 'jihad'];
                const topicNames = ['الصلاة', 'الجنائز', 'الزكاة', 'الصيام', 'الحج والعمرة', 'الطهارة', 'الجهاد'];
                
                const finalPath = [...session.path, topics[choice - 1]];
                const topicName = topicNames[choice - 1];
                
                await sock.sendMessage(sender, {
                    text: `📍 *المسار المختار:*\nالعبادات > ${topicName}\n\n📎 *أرسل رابط المحاضرة الآن*\n\nمثال:\nhttps://binbaz.org.sa/audios/187/...`
                });
                
                this.adminSessions.set(sender, {
                    level: 'waiting_lecture_url',
                    path: finalPath,
                    topicName: topicName,
                    timestamp: Date.now()
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
            else if (choice === 1) {
                await this.sendScheduleSubMenu(sock, sender, 'athkar', 'الأذكار');
                return true;
            }
            else if (choice === 2) {
                await this.sendScheduleSubMenu(sock, sender, 'fatawa', 'الفتاوى');
                return true;
            }
            else if (choice === 3) {
                await sock.sendMessage(sender, { text: '🚧 الفقه قيد التطوير' });
                return true;
            }
            else if (choice === 4) {
                await sock.sendMessage(sender, { text: '🚧 الموضوعية قيد التطوير' });
                return true;
            }
        }
        
        // القائمة الفرعية للجدولة
        else if (level === 'schedule_submenu') {
            if (choice === 0) {
                await this.sendScheduleMenu(sock, sender);
                return true;
            }
            else if (choice === 1) {
                // تعيين الوقت
                await sock.sendMessage(sender, {
                    text: `⏰ *تعيين وقت ${session.sectionName}*\n\nأرسل الوقت بصيغة Cron:\n\nمثال:\n\`0 6 * * *\` = 6:00 صباحاً\n\`30 15 * * *\` = 3:30 مساءً\n\n📖 [شرح Cron](https://crontab.guru/)`
                });
                
                this.adminSessions.set(sender, {
                    level: 'setting_schedule_time',
                    section: session.section,
                    sectionName: session.sectionName,
                    timestamp: Date.now()
                });
                return true;
            }
            else if (choice === 2) {
                // Toggle
                await this.toggleSchedule(sock, sender, session.section, session.sectionName);
                return true;
            }
        }

        return false;
    }
    
    // Toggle جدولة
    async toggleSchedule(sock, sender, section) {
        try {
            const settings = await db.getScheduleSettings();
            const currentStatus = settings[section]?.enabled || false;
            const newStatus = !currentStatus;
            
            // تحديث في Google Sheets
            // TODO: إضافة دالة updateScheduleStatus في googleSheets.js
            
            const statusText = newStatus ? '✅ مفعّل' : '❌ معطّل';
            await sock.sendMessage(sender, {
                text: `${section}: ${statusText}`
            });
            
            await this.sendScheduleMenu(sock, sender);
            return true;
            
        } catch (error) {
            await sock.sendMessage(sender, {
                text: `❌ خطأ: ${error.message}`
            });
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // معالجات متقدمة
    // ═══════════════════════════════════════════════════════════

    // بدء معالج إضافة محاضرة تفاعلي
    async startAddLectureWizard(sock, sender) {
        const pollName = 'اختر القسم الرئيسي';
        const options = [
            '1️⃣ الفقه',
            '2️⃣ الموضوعية',
            '0️⃣ إلغاء'
        ];
        
        await sock.sendMessage(sender, {
            poll: {
                name: pollName,
                values: options,
                selectableCount: 1
            }
        });
        
        this.adminSessions.set(sender, {
            level: 'add_lecture_step1',
            path: [],
            timestamp: Date.now()
        });
    }
    
    // التنقل في أقسام الفقه (مبسط)
    async navigateFiqh(sock, sender, step) {
        let pollName = '';
        let options = [];
        let nextLevel = '';
        let currentPath = [];
        
        if (step === 'subsection') {
            pollName = 'الفقه - اختر القسم';
            options = ['1️⃣ العبادات', '2️⃣ المعاملات', '3️⃣ فقه الأسرة', '4️⃣ العادات', '0️⃣ رجوع'];
            nextLevel = 'add_lecture_fiqh_subsection';
            currentPath = ['fiqh'];
        }
        else if (step === 'topic') {
            const session = this.adminSessions.get(sender);
            const subsection = session.selectedSubsection;
            
            if (subsection === 'ibadat') {
                pollName = 'العبادات - اختر الموضوع';
                options = [
                    '1️⃣ الصلاة', '2️⃣ الجنائز', '3️⃣ الزكاة', '4️⃣ الصيام',
                    '5️⃣ الحج والعمرة', '6️⃣ الطهارة', '7️⃣ الجهاد',
                    '➕ إنشاء قسم جديد', '0️⃣ رجوع'
                ];
                currentPath = ['fiqh', 'ibadat'];
                nextLevel = 'add_lecture_fiqh_final';
            }
        }
        
        await sock.sendMessage(sender, {
            poll: {
                name: pollName,
                values: options,
                selectableCount: 1
            }
        });
        
        const session = this.adminSessions.get(sender) || {};
        this.adminSessions.set(sender, {
            ...session,
            level: nextLevel,
            path: currentPath,
            timestamp: Date.now()
        });
    }
    
    // إنشاء قسم جديد
    async createNewCategory(sock, sender, parentPath) {
        await sock.sendMessage(sender, {
            text: `➕ *إنشاء قسم جديد*\n\n📍 المسار: ${parentPath.join(' > ')}\n\n✍️ اكتب اسم القسم الجديد:`
        });
        
        this.adminSessions.set(sender, {
            level: 'creating_new_category',
            path: parentPath,
            timestamp: Date.now()
        });
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

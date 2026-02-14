const db = require('../../database/googleSheets');

class AdminPanel {
    constructor() {
        this.adminSessions = new Map(); // مفتاح منفصل عن Islamic
    }

    isAdmin(sender) {
        return sender.includes('249962204268') || 
               sender.includes('231211024814174') ||
               sender.includes('252355702448348');
    }

    async sendMain(sock, sender) {
        await sock.sendMessage(sender, {
            poll: {
                name: 'لوحة الإدارة',
                values: ['1️⃣ إضافة محتوى', '2️⃣ الجدولة', '3️⃣ إحصائيات'],
                selectableCount: 1
            }
        });
        this.adminSessions.set(sender, { level: 'admin_main' });
    }

    async sendAddMenu(sock, sender) {
        await sock.sendMessage(sender, {
            poll: {
                name: 'إضافة محتوى',
                values: ['1️⃣ أذكار', '2️⃣ فتاوى', '3️⃣ فقه', '4️⃣ موضوعية', '0️⃣ رجوع'],
                selectableCount: 1
            }
        });
        this.adminSessions.set(sender, { level: 'admin_add_menu' });
    }

    async sendAthkarTypeMenu(sock, sender) {
        await sock.sendMessage(sender, {
            poll: {
                name: 'نوع الذكر',
                values: ['1️⃣ صباحي', '2️⃣ مسائي', '0️⃣ رجوع'],
                selectableCount: 1
            }
        });
        this.adminSessions.set(sender, { level: 'admin_athkar_type' });
    }

    async sendFiqhMenu(sock, sender) {
        await sock.sendMessage(sender, {
            poll: {
                name: 'الفقه - اختر القسم',
                values: ['1️⃣ العبادات', '2️⃣ المعاملات', '3️⃣ فقه الأسرة', '4️⃣ العادات', '0️⃣ رجوع'],
                selectableCount: 1
            }
        });
        this.adminSessions.set(sender, { level: 'admin_fiqh_menu' });
    }

    async sendIbadatMenu(sock, sender) {
        await sock.sendMessage(sender, {
            poll: {
                name: 'العبادات - اختر الموضوع',
                values: [
                    '1️⃣ الصلاة', '2️⃣ الجنائز', '3️⃣ الزكاة', 
                    '4️⃣ الصيام', '5️⃣ الحج', '6️⃣ الطهارة', 
                    '7️⃣ الجهاد', '0️⃣ رجوع'
                ],
                selectableCount: 1
            }
        });
        this.adminSessions.set(sender, { level: 'admin_ibadat_menu' });
    }

    async sendScheduleMenu(sock, sender) {
        await sock.sendMessage(sender, {
            poll: {
                name: 'الجدولة',
                values: ['1️⃣ الأذكار', '2️⃣ الفتاوى', '3️⃣ الفقه', '0️⃣ رجوع'],
                selectableCount: 1
            }
        });
        this.adminSessions.set(sender, { level: 'admin_schedule_menu' });
    }

    async sendScheduleSubMenu(sock, sender, section, name) {
        await sock.sendMessage(sender, {
            poll: {
                name: `${name} - الجدولة`,
                values: ['1️⃣ إضافة وقت', '2️⃣ عرض الأوقات', '3️⃣ حذف وقت', '4️⃣ تفعيل/تعطيل', '0️⃣ رجوع'],
                selectableCount: 1
            }
        });
        this.adminSessions.set(sender, { level: 'admin_schedule_sub', section, name });
    }

    async handleNumber(sock, sender, num) {
        const s = this.adminSessions.get(sender);
        if (!s) return false;

        if (s.level === 'admin_main') {
            if (num === 1) {
                await this.sendAddMenu(sock, sender);
                return true;
            } else if (num === 2) {
                await this.sendScheduleMenu(sock, sender);
                return true;
            } else if (num === 3) {
                await this.sendStats(sock, sender);
                return true;
            }
        } 
        else if (s.level === 'admin_add_menu') {
            if (num === 0) {
                await this.sendMain(sock, sender);
                return true;
            } else if (num === 1) {
                await this.sendAthkarTypeMenu(sock, sender);
                return true;
            } else if (num === 2) {
                await sock.sendMessage(sender, { text: '✍️ اكتب نص الفتوى:' });
                this.adminSessions.set(sender, { level: 'admin_text_fatwa' });
                return true;
            } else if (num === 3) {
                await this.sendFiqhMenu(sock, sender);
                return true;
            } else if (num === 4) {
                await sock.sendMessage(sender, { text: '🚧 الموضوعية قيد التطوير' });
                return true;
            }
        }
        else if (s.level === 'admin_athkar_type') {
            if (num === 0) {
                await this.sendAddMenu(sock, sender);
                return true;
            }
            const types = ['morning', 'evening'];
            const names = ['صباحي', 'مسائي'];
            if (num >= 1 && num <= 2) {
                await sock.sendMessage(sender, { text: `✍️ اكتب نص الذكر ${names[num-1]}:` });
                this.adminSessions.set(sender, { 
                    level: 'admin_text_athkar', 
                    athkarType: types[num-1],
                    athkarName: names[num-1]
                });
                return true;
            }
        }
        else if (s.level === 'admin_fiqh_menu') {
            if (num === 0) {
                await this.sendAddMenu(sock, sender);
                return true;
            } else if (num === 1) {
                await this.sendIbadatMenu(sock, sender);
                return true;
            } else {
                await sock.sendMessage(sender, { text: '🚧 قيد التطوير' });
                return true;
            }
        }
        else if (s.level === 'admin_ibadat_menu') {
            if (num === 0) {
                await this.sendFiqhMenu(sock, sender);
                return true;
            }
            const topics = ['salah', 'janazah', 'zakah', 'siyam', 'hajj', 'taharah', 'jihad'];
            const names = ['الصلاة', 'الجنائز', 'الزكاة', 'الصيام', 'الحج', 'الطهارة', 'الجهاد'];
            if (num >= 1 && num <= 7) {
                await sock.sendMessage(sender, { text: `✍️ اكتب نص ${names[num-1]}:` });
                this.adminSessions.set(sender, {
                    level: 'admin_text_lecture',
                    path: ['fiqh', 'ibadat', topics[num-1]],
                    title: names[num-1]
                });
                return true;
            }
        }
        else if (s.level === 'admin_schedule_menu') {
            if (num === 0) {
                await this.sendMain(sock, sender);
                return true;
            } else if (num === 1) {
                await this.sendScheduleSubMenu(sock, sender, 'athkar', 'الأذكار');
                return true;
            } else if (num === 2) {
                await this.sendScheduleSubMenu(sock, sender, 'fatawa', 'الفتاوى');
                return true;
            } else if (num === 3) {
                await sock.sendMessage(sender, { text: '🚧 قيد التطوير' });
                return true;
            }
        }
        else if (s.level === 'admin_schedule_sub') {
            if (num === 0) {
                await this.sendScheduleMenu(sock, sender);
                return true;
            } else if (num === 1) {
                await sock.sendMessage(sender, { text: `⏰ اكتب الوقت:\nمثال: 6:30` });
                this.adminSessions.set(sender, { level: 'admin_set_time', section: s.section, name: s.name });
                return true;
            } else if (num === 2) {
                await this.showTimes(sock, sender, s.section);
                return true;
            } else if (num === 3) {
                await this.showTimesForDelete(sock, sender, s.section, s.name);
                return true;
            } else if (num === 4) {
                const settings = await db.getSettings();
                const current = settings[s.section]?.enabled || false;
                await db.updateScheduleStatus(s.section, !current);
                await sock.sendMessage(sender, { text: `${!current ? '✅ مفعّل' : '❌ معطّل'}` });
                await this.sendScheduleMenu(sock, sender);
                return true;
            }
        }

        return false;
    }

    async handleText(sock, sender, text) {
        const s = this.adminSessions.get(sender);
        if (!s) return false;

        // حذف وقت
        if (s.level === 'admin_delete_time') {
            const num = parseInt(text);
            if (isNaN(num)) {
                await sock.sendMessage(sender, { text: '❌ اكتب رقم صحيح' });
                return true;
            }
            await this.deleteTime(sock, sender, num, s.section, s.name, s.times);
            return true;
        }

        if (s.level === 'admin_text_athkar') {
            const success = await db.addContent(['athkar', s.athkarType], {
                title: `ذكر ${s.athkarName}`,
                text: text,
                type: 'ذكر'
            });
            
            if (success) {
                await sock.sendMessage(sender, { text: `✅ تم حفظ الذكر ${s.athkarName}!` });
            } else {
                await sock.sendMessage(sender, { text: '❌ فشل الحفظ' });
            }
            
            this.adminSessions.delete(sender);
            await this.sendMain(sock, sender);
            return true;
        } 
        else if (s.level === 'admin_text_fatwa') {
            const success = await db.addContent(['fatawa'], {
                title: 'فتوى',
                text: text,
                type: 'فتوى'
            });
            
            if (success) {
                await sock.sendMessage(sender, { text: '✅ تم حفظ الفتوى!' });
            } else {
                await sock.sendMessage(sender, { text: '❌ فشل الحفظ' });
            }
            
            this.adminSessions.delete(sender);
            await this.sendMain(sock, sender);
            return true;
        } 
        else if (s.level === 'admin_text_lecture') {
            const success = await db.addContent(s.path, {
                title: s.title,
                text: text,
                type: 'محاضرة'
            });
            
            if (success) {
                await sock.sendMessage(sender, { text: `✅ تم حفظ ${s.title}!` });
            } else {
                await sock.sendMessage(sender, { text: '❌ فشل الحفظ' });
            }
            
            this.adminSessions.delete(sender);
            await this.sendMain(sock, sender);
            return true;
        } 
        else if (s.level === 'admin_set_time') {
            const match = text.match(/^(\d{1,2}):(\d{2})$/);
            if (!match) {
                await sock.sendMessage(sender, { text: '❌ صيغة خاطئة. مثال: 6:30' });
                return true;
            }
            
            const h = parseInt(match[1]);
            const m = parseInt(match[2]);
            
            if (h > 23 || m > 59) {
                await sock.sendMessage(sender, { text: '❌ وقت خاطئ' });
                return true;
            }
            
            const cron = `${m} ${h} * * *`;
            
            // إضافة وقت جديد بدلاً من استبدال
            const settings = await db.getSettings();
            const currentTime = settings[s.section]?.time || '';
            const newTime = currentTime ? `${currentTime},${cron}` : cron;
            
            await db.updateTime(s.section, newTime);
            await sock.sendMessage(sender, { text: `✅ تم إضافة وقت ${text}` });
            
            this.adminSessions.delete(sender);
            await this.sendScheduleMenu(sock, sender);
            return true;
        }

        return false;
    }

    async showTimes(sock, sender, section) {
        const settings = await db.getSettings();
        const times = settings[section]?.time || '';
        
        if (!times) {
            await sock.sendMessage(sender, { text: 'لا توجد أوقات' });
            return;
        }
        
        const timeList = times.split(',').map((cron, i) => {
            const parts = cron.trim().split(' ');
            const h = parts[1];
            const m = parts[0];
            return `${i+1}. ${h}:${m.padStart(2, '0')}`;
        }).join('\n');
        
        await sock.sendMessage(sender, { text: `⏰ الأوقات:\n${timeList}` });
    }

    async showTimesForDelete(sock, sender, section, name) {
        const settings = await db.getSettings();
        const times = settings[section]?.time || '';
        
        if (!times) {
            await sock.sendMessage(sender, { text: 'لا توجد أوقات' });
            return;
        }
        
        const timesList = times.split(',');
        const message = `⏰ الأوقات:\n\n` + timesList.map((cron, i) => {
            const parts = cron.trim().split(' ');
            const h = parts[1];
            const m = parts[0];
            return `${i+1}. ${h}:${m.padStart(2, '0')}`;
        }).join('\n') + `\n\n✍️ اكتب رقم الوقت للحذف:`;
        
        await sock.sendMessage(sender, { text: message });
        
        this.adminSessions.set(sender, { 
            level: 'admin_delete_time', 
            section, 
            name,
            times: timesList 
        });
    }

    async deleteTime(sock, sender, num, section, name, times) {
        const index = num - 1;
        
        if (index < 0 || index >= times.length) {
            await sock.sendMessage(sender, { text: '❌ رقم خاطئ' });
            return;
        }
        
        times.splice(index, 1);
        const newTime = times.join(',');
        
        await db.updateTime(section, newTime);
        await sock.sendMessage(sender, { text: `✅ تم حذف الوقت` });
        
        this.adminSessions.delete(sender);
        await this.sendScheduleMenu(sock, sender);
    }

    async sendStats(sock, sender) {
        const sections = [
            { path: ['fiqh', 'ibadat', 'salah'], name: 'الصلاة' },
            { path: ['athkar', 'morning'], name: 'أذكار الصباح' },
            { path: ['athkar', 'evening'], name: 'أذكار المساء' },
            { path: ['fatawa'], name: 'الفتاوى' }
        ];

        let stats = '*الإحصائيات:*\n\n';
        let count = 0;

        for (const sec of sections) {
            const content = await db.getContent(sec.path);
            if (content.length > 0) {
                const enabled = content[0].enabled ? '✅' : '❌';
                stats += `${enabled} ${sec.name}: ${content.length} محتوى\n`;
                if (content[0].enabled) {
                    stats += `   📊 ${content[0].lastSentIndex}/${content.length}\n`;
                }
                count++;
            }
        }

        if (count === 0) stats += 'لا محتوى';

        await sock.sendMessage(sender, { text: stats });
        this.adminSessions.set(sender, { level: 'admin_stats' });
    }

    async handleAdminCommand(sock, msg, text, sender) {
        if (!this.isAdmin(sender)) return false;

        if (text === '/ادارة' || text === '/admin') {
            console.log('✅ Admin: Opening panel');
            await this.sendMain(sock, sender);
            return true;
        }

        // فقط معالجة الأرقام والنصوص إذا كانت هناك جلسة admin
        const session = this.adminSessions.get(sender);
        if (!session) return false;

        if (/^\d{1,2}$/.test(text)) {
            return await this.handleNumber(sock, sender, parseInt(text));
        }

        return await this.handleText(sock, sender, text);
    }
}

module.exports = new AdminPanel();

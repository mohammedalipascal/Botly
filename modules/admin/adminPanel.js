const db = require('../../database/googleSheets');

class AdminPanel {
    constructor() {
        this.sessions = new Map();
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
        this.sessions.set(sender, { level: 'main' });
    }

    async sendAddMenu(sock, sender) {
        await sock.sendMessage(sender, {
            poll: {
                name: 'إضافة محتوى',
                values: ['1️⃣ ذكر', '2️⃣ فتوى', '3️⃣ محاضرة', '0️⃣ رجوع'],
                selectableCount: 1
            }
        });
        this.sessions.set(sender, { level: 'add_menu' });
    }

    async sendFiqhMenu(sock, sender) {
        await sock.sendMessage(sender, {
            poll: {
                name: 'الفقه',
                values: ['1️⃣ العبادات', '0️⃣ رجوع'],
                selectableCount: 1
            }
        });
        this.sessions.set(sender, { level: 'fiqh_menu' });
    }

    async sendIbadatMenu(sock, sender) {
        await sock.sendMessage(sender, {
            poll: {
                name: 'العبادات',
                values: ['1️⃣ الصلاة', '2️⃣ الجنائز', '3️⃣ الزكاة', '0️⃣ رجوع'],
                selectableCount: 1
            }
        });
        this.sessions.set(sender, { level: 'ibadat_menu' });
    }

    async sendScheduleMenu(sock, sender) {
        await sock.sendMessage(sender, {
            poll: {
                name: 'الجدولة',
                values: ['1️⃣ الأذكار', '2️⃣ الفتاوى', '3️⃣ الفقه', '0️⃣ رجوع'],
                selectableCount: 1
            }
        });
        this.sessions.set(sender, { level: 'schedule_menu' });
    }

    async sendScheduleSubMenu(sock, sender, section, name) {
        await sock.sendMessage(sender, {
            poll: {
                name: `${name} - الجدولة`,
                values: ['1️⃣ تعيين الوقت', '2️⃣ تفعيل/تعطيل', '0️⃣ رجوع'],
                selectableCount: 1
            }
        });
        this.sessions.set(sender, { level: 'schedule_sub', section, name });
    }

    async handleNumber(sock, sender, num) {
        const s = this.sessions.get(sender);
        if (!s) return false;

        if (s.level === 'main') {
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
        } else if (s.level === 'add_menu') {
            if (num === 0) {
                await this.sendMain(sock, sender);
                return true;
            } else if (num === 1) {
                await sock.sendMessage(sender, { text: '✍️ اكتب نص الذكر:' });
                this.sessions.set(sender, { level: 'text_thikr' });
                return true;
            } else if (num === 2) {
                await sock.sendMessage(sender, { text: '✍️ اكتب نص الفتوى:' });
                this.sessions.set(sender, { level: 'text_fatwa' });
                return true;
            } else if (num === 3) {
                await this.sendFiqhMenu(sock, sender);
                return true;
            }
        } else if (s.level === 'fiqh_menu') {
            if (num === 0) {
                await this.sendAddMenu(sock, sender);
                return true;
            } else if (num === 1) {
                await this.sendIbadatMenu(sock, sender);
                return true;
            }
        } else if (s.level === 'ibadat_menu') {
            if (num === 0) {
                await this.sendFiqhMenu(sock, sender);
                return true;
            }
            const topics = ['salah', 'janazah', 'zakah'];
            const names = ['الصلاة', 'الجنائز', 'الزكاة'];
            if (num >= 1 && num <= 3) {
                await sock.sendMessage(sender, { text: `✍️ اكتب نص محاضرة ${names[num-1]}:` });
                this.sessions.set(sender, {
                    level: 'text_lecture',
                    path: ['fiqh', 'ibadat', topics[num-1]],
                    title: names[num-1]
                });
                return true;
            }
        } else if (s.level === 'schedule_menu') {
            if (num === 0) {
                await this.sendMain(sock, sender);
                return true;
            } else if (num === 1) {
                await this.sendScheduleSubMenu(sock, sender, 'athkar_morning', 'الأذكار');
                return true;
            } else if (num === 2) {
                await this.sendScheduleSubMenu(sock, sender, 'fatawa', 'الفتاوى');
                return true;
            } else if (num === 3) {
                await sock.sendMessage(sender, { text: '🚧 قيد التطوير' });
                return true;
            }
        } else if (s.level === 'schedule_sub') {
            if (num === 0) {
                await this.sendScheduleMenu(sock, sender);
                return true;
            } else if (num === 1) {
                await sock.sendMessage(sender, { text: `⏰ اكتب الوقت:\nمثال: 6:30` });
                this.sessions.set(sender, { level: 'set_time', section: s.section, name: s.name });
                return true;
            } else if (num === 2) {
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
        const s = this.sessions.get(sender);
        if (!s) return false;

        if (s.level === 'text_thikr') {
            await db.addContent(['athkar', 'morning'], {
                title: 'ذكر',
                text: text,
                type: 'ذكر'
            });
            await sock.sendMessage(sender, { text: '✅ تم الحفظ!' });
            this.sessions.delete(sender);
            await this.sendMain(sock, sender);
            return true;
        } else if (s.level === 'text_fatwa') {
            await db.addContent(['fatawa'], {
                title: 'فتوى',
                text: text,
                type: 'فتوى'
            });
            await sock.sendMessage(sender, { text: '✅ تم الحفظ!' });
            this.sessions.delete(sender);
            await this.sendMain(sock, sender);
            return true;
        } else if (s.level === 'text_lecture') {
            await db.addContent(s.path, {
                title: s.title,
                text: text,
                type: 'محاضرة'
            });
            await sock.sendMessage(sender, { text: '✅ تم الحفظ!' });
            this.sessions.delete(sender);
            await this.sendMain(sock, sender);
            return true;
        } else if (s.level === 'set_time') {
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
            await db.updateTime(s.section, cron);
            await sock.sendMessage(sender, { text: `✅ تم تعيين ${text}` });
            this.sessions.delete(sender);
            await this.sendScheduleMenu(sock, sender);
            return true;
        }

        return false;
    }

    async sendStats(sock, sender) {
        const sections = [
            { path: ['fiqh', 'ibadat', 'salah'], name: 'الصلاة' },
            { path: ['athkar', 'morning'], name: 'الأذكار' },
            { path: ['fatawa'], name: 'الفتاوى' }
        ];

        let stats = '*الإحصائيات:*\n\n';
        let count = 0;

        for (const sec of sections) {
            const content = await db.getContent(sec.path);
            if (content.length > 0 && content[0].enabled) {
                stats += `✅ ${sec.name}: ${content[0].lastSentIndex}/${content.length}\n`;
                count++;
            }
        }

        if (count === 0) stats += 'لا أقسام مفعلة';

        await sock.sendMessage(sender, { text: stats });
        this.sessions.set(sender, { level: 'stats' });
    }

    async handleAdminCommand(sock, msg, text, sender) {
        if (!this.isAdmin(sender)) return false;

        if (text === '/ادارة' || text === '/admin') {
            await this.sendMain(sock, sender);
            return true;
        }

        if (/^\d{1,2}$/.test(text)) {
            return await this.handleNumber(sock, sender, parseInt(text));
        }

        return await this.handleText(sock, sender, text);
    }
}

module.exports = new AdminPanel();

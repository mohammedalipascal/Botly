const { google } = require('googleapis');

class GoogleSheetsDB {
    constructor() {
        this.sheets = null;
        this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
    }

    async initialize() {
        if (this.sheets) return;
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        const auth = new google.auth.JWT(
            credentials.client_email, null, credentials.private_key,
            ['https://www.googleapis.com/auth/spreadsheets']
        );
        this.sheets = google.sheets({ version: 'v4', auth });
        const info = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
        console.log('📊 Sheet:', info.data.properties.title);
    }

    // ==============================
    // SETTINGS SHEET
    // ورقة الإعدادات: section | times | enabled
    // ==============================

    async setupSettings() {
        await this.initialize();
        const res = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
        const exists = res.data.sheets.some(s => s.properties.title === 'Settings');
        
        if (!exists) {
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: { requests: [{ addSheet: { properties: { title: 'Settings' }}}]}
            });
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Settings!A1:C1',
                valueInputOption: 'RAW',
                resource: { values: [['Section', 'Times', 'Enabled']] }
            });
            console.log('✅ Settings sheet created');
        }
    }

    async getSettings() {
        await this.initialize();
        try {
            const res = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Settings!A2:C'
            });
            if (!res.data.values) return {};
            const settings = {};
            res.data.values.forEach(r => {
                if (r[0]) settings[r[0]] = {
                    times: r[1] ? r[1].split(',').filter(t => t.trim()) : [],
                    enabled: r[2] === 'TRUE'
                };
            });
            return settings;
        } catch { return {}; }
    }

    async getSectionRow(section) {
        const settings = await this.getSettings();
        const keys = Object.keys(settings);
        return keys.indexOf(section); // -1 if not found
    }

    async upsertSection(section, times = null, enabled = null) {
        await this.initialize();
        const res = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: 'Settings!A2:C'
        });
        const rows = res.data.values || [];
        const rowIndex = rows.findIndex(r => r[0] === section);

        if (rowIndex === -1) {
            // أضف صف جديد
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Settings!A:C',
                valueInputOption: 'RAW',
                resource: { values: [[section, times !== null ? times : '', enabled !== null ? (enabled ? 'TRUE' : 'FALSE') : 'FALSE']] }
            });
            console.log(`✅ تم إضافة section: ${section}`);
        } else {
            // حدّث
            const sheetRow = rowIndex + 2;
            if (times !== null) {
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: `Settings!B${sheetRow}`,
                    valueInputOption: 'RAW',
                    resource: { values: [[times]] }
                });
            }
            if (enabled !== null) {
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: `Settings!C${sheetRow}`,
                    valueInputOption: 'RAW',
                    resource: { values: [[enabled ? 'TRUE' : 'FALSE']] }
                });
            }
            console.log(`✅ تم تحديث section: ${section}`);
        }
        return true;
    }

    // أضف وقت لقسم
    async addTime(section, cronTime) {
        await this.initialize();
        const settings = await this.getSettings();
        const current = settings[section]?.times || [];
        current.push(cronTime);
        await this.upsertSection(section, current.join(','), null);
        console.log(`✅ تم إضافة وقت لـ ${section}: ${cronTime}`);
        return current;
    }

    // احذف وقت من قسم
    async deleteTime(section, index) {
        await this.initialize();
        const settings = await this.getSettings();
        const current = settings[section]?.times || [];
        if (index < 0 || index >= current.length) return null;
        current.splice(index, 1);
        await this.upsertSection(section, current.join(','), null);
        console.log(`✅ تم حذف وقت من ${section}`);
        return current;
    }

    // تفعيل/تعطيل قسم
    async setEnabled(section, enabled) {
        await this.upsertSection(section, null, enabled);
        console.log(`✅ ${section}: ${enabled ? 'مفعّل' : 'معطّل'}`);
    }

    // ==============================
    // CONTENT SHEETS
    // كل ورقة: ID | Text | Index
    // ==============================

    async getSheetList() {
        await this.initialize();
        const res = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
        return res.data.sheets.map(s => s.properties.title).filter(t => t !== 'Settings');
    }

    async createContentSheet(sheetName) {
        await this.initialize();
        const res = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
        if (res.data.sheets.some(s => s.properties.title === sheetName)) {
            console.log(`⚠️ الورقة ${sheetName} موجودة`);
            return false;
        }
        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            resource: { requests: [{ addSheet: { properties: { title: sheetName }}}]}
        });
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${sheetName}!A1:C1`,
            valueInputOption: 'RAW',
            resource: { values: [['ID', 'Text', 'Index']] }
        });
        console.log(`✅ تم إنشاء ورقة: ${sheetName}`);
        return true;
    }

    async deleteContentSheet(sheetName) {
        await this.initialize();
        const res = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
        const sheet = res.data.sheets.find(s => s.properties.title === sheetName);
        if (!sheet) return false;
        
        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            resource: { requests: [{ deleteSheet: { sheetId: sheet.properties.sheetId }}]}
        });
        
        // احذف من Settings أيضاً
        await this.deleteSectionFromSettings(sheetName);
        console.log(`✅ تم حذف ورقة: ${sheetName}`);
        return true;
    }

    async deleteSectionFromSettings(section) {
        await this.initialize();
        const res = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: 'Settings!A2:C'
        });
        const rows = res.data.values || [];
        const rowIndex = rows.findIndex(r => r[0] === section);
        if (rowIndex === -1) return;
        
        // مسح الصف
        await this.sheets.spreadsheets.values.clear({
            spreadsheetId: this.spreadsheetId,
            range: `Settings!A${rowIndex + 2}:C${rowIndex + 2}`
        });
    }

    // أضف محتوى
    async addContent(sheetName, text) {
        await this.initialize();
        await this.createContentSheet(sheetName);
        const id = `c_${Date.now()}`;
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range: `${sheetName}!A:C`,
            valueInputOption: 'RAW',
            resource: { values: [[id, text, 0]] }
        });
        console.log(`✅ تم إضافة محتوى إلى ${sheetName}`);
        return id;
    }

    // جلب محتوى
    async getContent(sheetName) {
        await this.initialize();
        try {
            const res = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!A2:C`
            });
            if (!res.data.values) return [];
            return res.data.values.map((r, i) => ({
                rowIndex: i + 2,
                id: r[0],
                text: r[1] || '',
                sentIndex: parseInt(r[2]) || 0
            }));
        } catch { return []; }
    }

    // تحديث المؤشر
    async updateSentIndex(sheetName, rowIndex, newIndex) {
        await this.initialize();
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${sheetName}!C${rowIndex}`,
            valueInputOption: 'RAW',
            resource: { values: [[newIndex]] }
        });
    }

    // ==============================
    // FOLDERS (Custom sections)
    // ==============================

    async getFolders() {
        const sheets = await this.getSheetList();
        const defaultSections = ['Athkar_Morning', 'Athkar_Evening', 'Fatawa', 'Fiqh', 'Aqeeda'];
        return sheets.filter(s => !defaultSections.includes(s));
    }

    async createFolder(name) {
        const sheetName = name.replace(/\s+/g, '_');
        const created = await this.createContentSheet(sheetName);
        if (created) {
            await this.upsertSection(sheetName, '', 'FALSE');
        }
        return { created, sheetName };
    }

    async deleteFolder(sheetName) {
        return await this.deleteContentSheet(sheetName);
    }

    // ==============================
    // STATS
    // ==============================

    async getStats() {
        const sheets = await this.getSheetList();
        const settings = await this.getSettings();
        const stats = [];
        
        for (const sheet of sheets) {
            const content = await this.getContent(sheet);
            const sectionSettings = settings[sheet];
            stats.push({
                name: sheet,
                count: content.length,
                enabled: sectionSettings?.enabled || false,
                times: sectionSettings?.times || []
            });
        }
        return stats;
    }
}

module.exports = new GoogleSheetsDB();

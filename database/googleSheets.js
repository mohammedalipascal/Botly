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

    getSheetName(path) {
        return path.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('_');
    }

    async createSheet(name) {
        const res = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
        if (res.data.sheets.some(s => s.properties.title === name)) return;
        
        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            resource: { requests: [{ addSheet: { properties: { title: name }}}]}
        });
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${name}!A1:F1`,
            valueInputOption: 'RAW',
            resource: { values: [['ID', 'Title', 'Text', 'Type', 'LastIndex', 'Enabled']] }
        });
    }

    async addContent(path, content) {
        await this.initialize();
        const sheet = this.getSheetName(path);
        await this.createSheet(sheet);
        
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.spreadsheetId,
            range: `${sheet}!A:F`,
            valueInputOption: 'RAW',
            resource: { values: [[
                content.id || `c_${Date.now()}`,
                content.title || '',
                content.text || '',
                content.type || 'محتوى',
                0,
                'FALSE'
            ]]}
        });
        
        console.log(`✅ تم الحفظ: ${content.title}`);
        return true;
    }

    async getContent(path) {
        await this.initialize();
        try {
            const sheet = this.getSheetName(path);
            const res = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: `${sheet}!A2:F`
            });
            
            if (!res.data.values) return [];
            
            return res.data.values.map(r => ({
                id: r[0],
                title: r[1],
                text: r[2],
                type: r[3],
                lastSentIndex: parseInt(r[4]) || 0,
                enabled: r[5] === 'TRUE'
            }));
        } catch {
            return [];
        }
    }

    async updateIndex(path, id, index) {
        await this.initialize();
        const sheet = this.getSheetName(path);
        const content = await this.getContent(path);
        const row = content.findIndex(c => c.id === id);
        if (row === -1) return false;
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${sheet}!E${row + 2}`,
            valueInputOption: 'RAW',
            resource: { values: [[index]] }
        });
        return true;
    }

    async updateStatus(path, id, enabled) {
        await this.initialize();
        const sheet = this.getSheetName(path);
        const content = await this.getContent(path);
        const row = content.findIndex(c => c.id === id);
        
        console.log(`   🔄 تحديث ${id} في ${sheet} صف ${row + 2}`);
        
        if (row === -1) {
            console.log(`   ❌ لم يتم العثور على ${id}`);
            return false;
        }
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${sheet}!F${row + 2}`,
            valueInputOption: 'RAW',
            resource: { values: [[enabled ? 'TRUE' : 'FALSE']] }
        });
        
        console.log(`   ✅ ${id}: ${enabled ? 'TRUE' : 'FALSE'}`);
        return true;
    }

    async setupSettings() {
        await this.initialize();
        await this.createSheet('Settings');
        
        try {
            const check = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Settings!A1:C'
            });
            if (check.data.values && check.data.values.length > 1) return;
        } catch {}
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: 'Settings!A1:C4',
            valueInputOption: 'RAW',
            resource: { values: [
                ['Section', 'Time', 'Enabled'],
                ['athkar_morning', '30 6 * * *', 'FALSE'],
                ['athkar_evening', '30 15 * * *', 'FALSE'],
                ['fatawa', '0 12 * * *', 'FALSE']
            ]}
        });
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
                settings[r[0]] = { time: r[1], enabled: r[2] === 'TRUE' };
            });
            return settings;
        } catch {
            return {};
        }
    }

    async updateTime(section, cron) {
        await this.initialize();
        const settings = await this.getSettings();
        const sections = Object.keys(settings);
        const row = sections.indexOf(section);
        
        if (row === -1) {
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Settings!A:C',
                valueInputOption: 'RAW',
                resource: { values: [[section, cron, 'FALSE']] }
            });
            return true;
        }
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `Settings!B${row + 2}`,
            valueInputOption: 'RAW',
            resource: { values: [[cron]] }
        });
        
        console.log(`✅ تم تحديث الوقت`);
        return true;
    }

    async updateScheduleStatus(section, enabled) {
        await this.initialize();
        const settings = await this.getSettings();
        const sections = Object.keys(settings);
        const row = sections.indexOf(section);
        if (row === -1) return false;
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `Settings!C${row + 2}`,
            valueInputOption: 'RAW',
            resource: { values: [[enabled ? 'TRUE' : 'FALSE']] }
        });
        return true;
    }
}

module.exports = new GoogleSheetsDB();

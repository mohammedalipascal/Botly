const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

class GoogleSheetsDB {
    constructor() {
        this.sheets = null;
        this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
        this.initialized = false;
    }

    /**
     * تهيئة الاتصال بـ Google Sheets
     */
    async initialize() {
        try {
            // قراءة credentials من ملف
            const credentialsPath = path.join(__dirname, 'google-credentials.json');
            
            if (!fs.existsSync(credentialsPath)) {
                console.log('⚠️ لم يتم العثور على ملف google-credentials.json');
                console.log('📝 يرجى إنشاء الملف ووضع Service Account credentials فيه');
                return false;
            }

            const credentials = JSON.parse(fs.readFileSync(credentialsPath, 'utf-8'));
            
            const auth = new google.auth.GoogleAuth({
                credentials,
                scopes: ['https://www.googleapis.com/auth/spreadsheets']
            });

            const authClient = await auth.getClient();
            this.sheets = google.sheets({ version: 'v4', auth: authClient });
            
            // التحقق من وجود الـ Spreadsheet وإنشاء الجداول إذا لزم الأمر
            await this.ensureTablesExist();
            
            this.initialized = true;
            console.log('✅ تم الاتصال بـ Google Sheets بنجاح');
            return true;
            
        } catch (error) {
            console.error('❌ خطأ في الاتصال بـ Google Sheets:', error.message);
            return false;
        }
    }

    /**
     * التأكد من وجود الجداول الثلاثة وإنشائها إذا لزم الأمر
     */
    async ensureTablesExist() {
        try {
            // الحصول على معلومات الـ Spreadsheet
            const spreadsheet = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });

            const existingSheets = spreadsheet.data.sheets.map(s => s.properties.title);

            // إنشاء Sheet 1: Lectures
            if (!existingSheets.includes('Lectures')) {
                await this.createLecturesSheet();
            }

            // إنشاء Sheet 2: Progress
            if (!existingSheets.includes('Progress')) {
                await this.createProgressSheet();
            }

            // إنشاء Sheet 3: Schedule
            if (!existingSheets.includes('Schedule')) {
                await this.createScheduleSheet();
            }

        } catch (error) {
            console.error('❌ خطأ في إنشاء الجداول:', error.message);
        }
    }

    /**
     * إنشاء جدول Lectures
     */
    async createLecturesSheet() {
        try {
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: 'Lectures'
                            }
                        }
                    }]
                }
            });

            // إضافة العناوين
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Lectures!A1:F1',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [['id', 'title', 'pageUrl', 'audioUrl', 'category', 'order']]
                }
            });

            console.log('✅ تم إنشاء جدول Lectures');
        } catch (error) {
            console.error('❌ خطأ في إنشاء جدول Lectures:', error.message);
        }
    }

    /**
     * إنشاء جدول Progress
     */
    async createProgressSheet() {
        try {
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: 'Progress'
                            }
                        }
                    }]
                }
            });

            // إضافة العناوين
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Progress!A1:C1',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [['category', 'lastLectureId', 'lastSentDate']]
                }
            });

            console.log('✅ تم إنشاء جدول Progress');
        } catch (error) {
            console.error('❌ خطأ في إنشاء جدول Progress:', error.message);
        }
    }

    /**
     * إنشاء جدول Schedule
     */
    async createScheduleSheet() {
        try {
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                requestBody: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: 'Schedule'
                            }
                        }
                    }]
                }
            });

            // إضافة العناوين
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Schedule!A1:D1',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [['category', 'enabled', 'cronTime', 'groupId']]
                }
            });

            console.log('✅ تم إنشاء جدول Schedule');
        } catch (error) {
            console.error('❌ خطأ في إنشاء جدول Schedule:', error.message);
        }
    }

    /**
     * إضافة محاضرة جديدة
     */
    async addLecture(lectureData) {
        if (!this.initialized) {
            throw new Error('Google Sheets غير مهيأ');
        }

        try {
            const { title, pageUrl, category, order } = lectureData;
            
            // الحصول على آخر ID
            const lectures = await this.getAllLectures();
            const newId = lectures.length > 0 
                ? Math.max(...lectures.map(l => parseInt(l.id) || 0)) + 1 
                : 1;

            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: 'Lectures!A:F',
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[newId, title, pageUrl, '', category, order || 999]]
                }
            });

            return newId;
        } catch (error) {
            console.error('❌ خطأ في إضافة المحاضرة:', error.message);
            throw error;
        }
    }

    /**
     * الحصول على جميع المحاضرات
     */
    async getAllLectures() {
        if (!this.initialized) return [];

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Lectures!A2:F'
            });

            const rows = response.data.values || [];
            return rows.map(row => ({
                id: row[0],
                title: row[1],
                pageUrl: row[2],
                audioUrl: row[3],
                category: row[4],
                order: parseInt(row[5]) || 999
            }));
        } catch (error) {
            console.error('❌ خطأ في قراءة المحاضرات:', error.message);
            return [];
        }
    }

    /**
     * الحصول على محاضرات قسم معين
     */
    async getLecturesByCategory(category) {
        const lectures = await this.getAllLectures();
        return lectures
            .filter(l => l.category === category)
            .sort((a, b) => a.order - b.order);
    }

    /**
     * الحصول على تقدم قسم معين
     */
    async getProgress(category) {
        if (!this.initialized) return null;

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Progress!A2:C'
            });

            const rows = response.data.values || [];
            const progress = rows.find(row => row[0] === category);

            if (!progress) return null;

            return {
                category: progress[0],
                lastLectureId: progress[1],
                lastSentDate: progress[2]
            };
        } catch (error) {
            console.error('❌ خطأ في قراءة التقدم:', error.message);
            return null;
        }
    }

    /**
     * تحديث تقدم قسم معين
     */
    async updateProgress(category, lectureId) {
        if (!this.initialized) return false;

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Progress!A2:C'
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => row[0] === category);
            const currentDate = new Date().toISOString();

            if (rowIndex === -1) {
                // إضافة سجل جديد
                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Progress!A:C',
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [[category, lectureId, currentDate]]
                    }
                });
            } else {
                // تحديث السجل الموجود
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: `Progress!B${rowIndex + 2}:C${rowIndex + 2}`,
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [[lectureId, currentDate]]
                    }
                });
            }

            return true;
        } catch (error) {
            console.error('❌ خطأ في تحديث التقدم:', error.message);
            return false;
        }
    }

    /**
     * الحصول على جدول الأوقات
     */
    async getAllSchedules() {
        if (!this.initialized) return [];

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Schedule!A2:D'
            });

            const rows = response.data.values || [];
            return rows.map(row => ({
                category: row[0],
                enabled: row[1] === 'TRUE' || row[1] === 'true',
                cronTime: row[2],
                groupId: row[3]
            }));
        } catch (error) {
            console.error('❌ خطأ في قراءة الجدول:', error.message);
            return [];
        }
    }

    /**
     * تحديث حالة قسم (تفعيل/إلغاء)
     */
    async toggleSchedule(category, enabled) {
        if (!this.initialized) return false;

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Schedule!A2:D'
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => row[0] === category);

            if (rowIndex === -1) {
                // إضافة سجل جديد
                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Schedule!A:D',
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [[category, enabled, '0 9 * * *', '']]
                    }
                });
            } else {
                // تحديث السجل الموجود
                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: `Schedule!B${rowIndex + 2}`,
                    valueInputOption: 'RAW',
                    requestBody: {
                        values: [[enabled]]
                    }
                });
            }

            return true;
        } catch (error) {
            console.error('❌ خطأ في تحديث الحالة:', error.message);
            return false;
        }
    }

    /**
     * تحديث وقت النشر لقسم معين
     */
    async updateScheduleTime(category, cronTime) {
        if (!this.initialized) return false;

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Schedule!A2:D'
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => row[0] === category);

            if (rowIndex === -1) {
                return false;
            }

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `Schedule!C${rowIndex + 2}`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[cronTime]]
                }
            });

            return true;
        } catch (error) {
            console.error('❌ خطأ في تحديث الوقت:', error.message);
            return false;
        }
    }

    /**
     * تحديث معرف المجموعة لقسم معين
     */
    async updateScheduleGroup(category, groupId) {
        if (!this.initialized) return false;

        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'Schedule!A2:D'
            });

            const rows = response.data.values || [];
            const rowIndex = rows.findIndex(row => row[0] === category);

            if (rowIndex === -1) {
                return false;
            }

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `Schedule!D${rowIndex + 2}`,
                valueInputOption: 'RAW',
                requestBody: {
                    values: [[groupId]]
                }
            });

            return true;
        } catch (error) {
            console.error('❌ خطأ في تحديث المجموعة:', error.message);
            return false;
        }
    }

    /**
     * الحصول على المحاضرة التالية لقسم معين
     */
    async getNextLecture(category) {
        const lectures = await this.getLecturesByCategory(category);
        const progress = await this.getProgress(category);

        if (lectures.length === 0) return null;

        if (!progress || !progress.lastLectureId) {
            return lectures[0];
        }

        const lastIndex = lectures.findIndex(l => l.id === progress.lastLectureId);
        const nextIndex = (lastIndex + 1) % lectures.length;

        return lectures[nextIndex];
    }
}

// تصدير singleton instance
const db = new GoogleSheetsDB();
module.exports = db;

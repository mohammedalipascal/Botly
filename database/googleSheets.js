const { google } = require('googleapis');

// Google Sheets Database Handler
class GoogleSheetsDB {
    constructor() {
        this.sheets = null;
        this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
        this.isInitialized = false;
    }

    // تهيئة الاتصال
    async initialize() {
        try {
            if (this.isInitialized) return true;

            // قراءة credentials من ENV
            const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}');
            
            if (!credentials.client_email || !credentials.private_key) {
                throw new Error('GOOGLE_CREDENTIALS غير صالح في .env');
            }

            // إنشاء JWT client
            const auth = new google.auth.JWT(
                credentials.client_email,
                null,
                credentials.private_key.replace(/\\n/g, '\n'),
                ['https://www.googleapis.com/auth/spreadsheets']
            );

            // تهيئة Google Sheets API
            this.sheets = google.sheets({ version: 'v4', auth });
            
            // اختبار الاتصال
            await this.testConnection();
            
            this.isInitialized = true;
            console.log('✅ تم الاتصال بـ Google Sheets بنجاح');
            return true;

        } catch (error) {
            console.error('❌ فشل الاتصال بـ Google Sheets:', error.message);
            throw error;
        }
    }

    // اختبار الاتصال
    async testConnection() {
        try {
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            console.log(`📊 Google Sheet: ${response.data.properties.title}`);
            return true;
        } catch (error) {
            throw new Error(`فشل الاتصال: ${error.message}`);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // دوال CRUD للمحاضرات
    // ═══════════════════════════════════════════════════════════

    // الحصول على جميع المحاضرات لقسم معين
    async getLectures(sectionPath) {
        await this.initialize();
        
        try {
            const sheetName = this.getSheetName(sectionPath);
            const range = `${sheetName}!A2:G`; // من الصف 2 (بعد الهيدر)
            
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: range
            });

            const rows = response.data.values || [];
            
            return rows.map((row, index) => ({
                id: row[0] || `lecture_${index + 1}`,
                title: row[1] || '',
                pageUrl: row[2] || '',
                audioUrl: row[3] || '',
                type: row[4] || 'lecture',
                lastSentIndex: parseInt(row[5]) || 0,
                enabled: row[6] === 'TRUE' || row[6] === 'true'
            }));

        } catch (error) {
            console.error(`❌ فشل جلب المحاضرات من ${sectionPath}:`, error.message);
            return [];
        }
    }

    // إضافة محاضرة جديدة
    async addLecture(sectionPath, lecture) {
        await this.initialize();
        
        try {
            const sheetName = this.getSheetName(sectionPath);
            console.log(`📝 محاولة إضافة محاضرة في: ${sheetName}`);
            console.log(`📍 المسار: ${sectionPath.join(' > ')}`);
            
            // إنشاء Sheet إذا لم يكن موجوداً
            await this.createSheetIfNotExists(sheetName);
            
            const range = `${sheetName}!A:G`;
            
            const values = [[
                lecture.id || `lecture_${Date.now()}`,
                lecture.title || '',
                lecture.pageUrl || '',
                lecture.audioUrl || '',
                lecture.type || 'lecture',
                0, // lastSentIndex
                lecture.enabled !== false ? 'TRUE' : 'FALSE' // Google Sheets format
            ]];

            console.log(`💾 جاري الإضافة في Range: ${range}`);
            
            const result = await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                resource: { values }
            });

            console.log(`✅ تم إضافة محاضرة: ${lecture.title} في ${sheetName}`);
            console.log(`📊 الصفوف المضافة: ${result.data.updates.updatedRows}`);
            return true;

        } catch (error) {
            console.error('❌ فشل إضافة المحاضرة:');
            console.error('   الخطأ:', error.message);
            console.error('   المسار:', sectionPath);
            console.error('   Sheet:', this.getSheetName(sectionPath));
            return false;
        }
    }

    // تحديث آخر محاضرة تم إرسالها
    async updateLastSentIndex(sectionPath, lectureId, newIndex) {
        await this.initialize();
        
        try {
            const sheetName = this.getSheetName(sectionPath);
            
            // البحث عن الصف
            const lectures = await this.getLectures(sectionPath);
            const rowIndex = lectures.findIndex(l => l.id === lectureId);
            
            if (rowIndex === -1) {
                throw new Error('المحاضرة غير موجودة');
            }

            // تحديث العمود F (lastSentIndex)
            const range = `${sheetName}!F${rowIndex + 2}`; // +2 لأن الهيدر في الصف 1
            
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                resource: { values: [[newIndex]] }
            });

            console.log(`✅ تم تحديث المؤشر: ${lectureId} -> ${newIndex}`);
            return true;

        } catch (error) {
            console.error('❌ فشل تحديث المؤشر:', error.message);
            return false;
        }
    }

    // تحديث حالة التفعيل
    async updateLectureStatus(sectionPath, lectureId, enabled) {
        await this.initialize();
        
        try {
            const sheetName = this.getSheetName(sectionPath);
            
            const lectures = await this.getLectures(sectionPath);
            const rowIndex = lectures.findIndex(l => l.id === lectureId);
            
            if (rowIndex === -1) {
                throw new Error('المحاضرة غير موجودة');
            }

            const range = `${sheetName}!G${rowIndex + 2}`;
            
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                resource: { values: [[enabled]] }
            });

            console.log(`✅ تم تحديث حالة: ${lectureId} -> ${enabled}`);
            return true;

        } catch (error) {
            console.error('❌ فشل تحديث الحالة:', error.message);
            return false;
        }
    }

    // حذف محاضرة
    async deleteLecture(sectionPath, lectureId) {
        await this.initialize();
        
        try {
            const sheetName = this.getSheetName(sectionPath);
            
            const lectures = await this.getLectures(sectionPath);
            const rowIndex = lectures.findIndex(l => l.id === lectureId);
            
            if (rowIndex === -1) {
                throw new Error('المحاضرة غير موجودة');
            }

            // حذف الصف
            const sheetId = await this.getSheetId(sheetName);
            
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: {
                    requests: [{
                        deleteDimension: {
                            range: {
                                sheetId: sheetId,
                                dimension: 'ROWS',
                                startIndex: rowIndex + 1, // +1 لأن الهيدر في 0
                                endIndex: rowIndex + 2
                            }
                        }
                    }]
                }
            });

            console.log(`✅ تم حذف المحاضرة: ${lectureId}`);
            return true;

        } catch (error) {
            console.error('❌ فشل حذف المحاضرة:', error.message);
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // دوال الجدولة (Schedule Settings)
    // ═══════════════════════════════════════════════════════════

    // الحصول على إعدادات الجدولة
    async getScheduleSettings() {
        await this.initialize();
        
        try {
            const range = 'Settings!A2:C';
            
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: range
            });

            const rows = response.data.values || [];
            
            const settings = {};
            rows.forEach(row => {
                settings[row[0]] = {
                    time: row[1] || '',
                    enabled: row[2] === 'TRUE' || row[2] === 'true'
                };
            });

            return settings;

        } catch (error) {
            console.error('❌ فشل جلب إعدادات الجدولة:', error.message);
            return {};
        }
    }

    // تحديث حالة التفعيل للجدولة
    async updateScheduleStatus(section, enabled) {
        await this.initialize();
        
        try {
            const settings = await this.getScheduleSettings();
            const sections = Object.keys(settings);
            const rowIndex = sections.indexOf(section);
            
            if (rowIndex === -1) {
                // القسم غير موجود - إضافته
                const newRow = [[section, '0 12 * * *', enabled ? 'TRUE' : 'FALSE']];
                
                await this.sheets.spreadsheets.values.append({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Settings!A:C',
                    valueInputOption: 'RAW',
                    resource: { values: newRow }
                });
                
                console.log(`✅ تم إضافة قسم جديد: ${section}`);
                return true;
            }

            const range = `Settings!C${rowIndex + 2}`;
            
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                resource: { values: [[enabled ? 'TRUE' : 'FALSE']] }
            });

            console.log(`✅ تم تحديث حالة ${section}: ${enabled}`);
            return true;

        } catch (error) {
            console.error('❌ فشل تحديث الحالة:', error.message);
            return false;
        }
    }
    
    // تحديث وقت الجدولة
    async updateScheduleTime(section, newTime) {
        await this.initialize();
        
        try {
            const settings = await this.getScheduleSettings();
            const sectionKeys = Object.keys(settings);
            const rowIndex = sectionKeys.indexOf(section);
            
            if (rowIndex === -1) {
                throw new Error('القسم غير موجود');
            }

            const range = `Settings!B${rowIndex + 2}`;
            
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: range,
                valueInputOption: 'RAW',
                resource: { values: [[newTime]] }
            });

            console.log(`✅ تم تحديث وقت ${section}: ${newTime}`);
            return true;

        } catch (error) {
            console.error('❌ فشل تحديث الوقت:', error.message);
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // دوال مساعدة
    // ═══════════════════════════════════════════════════════════

    // تحويل مسار القسم إلى اسم Sheet
    getSheetName(sectionPath) {
        // مثال: ['fiqh', 'ibadat', 'salah'] -> 'Fiqh_Ibadat_Salah'
        return sectionPath
            .map(part => part.charAt(0).toUpperCase() + part.slice(1))
            .join('_');
    }

    // الحصول على Sheet ID
    async getSheetId(sheetName) {
        const response = await this.sheets.spreadsheets.get({
            spreadsheetId: this.spreadsheetId
        });

        const sheet = response.data.sheets.find(s => s.properties.title === sheetName);
        
        if (!sheet) {
            throw new Error(`Sheet not found: ${sheetName}`);
        }

        return sheet.properties.sheetId;
    }

    // إنشاء Sheet جديد (إذا لم يكن موجوداً)
    async createSheetIfNotExists(sheetName) {
        await this.initialize();
        
        try {
            // محاولة الوصول للـ Sheet
            const response = await this.sheets.spreadsheets.get({
                spreadsheetId: this.spreadsheetId
            });
            
            const sheetExists = response.data.sheets.some(
                sheet => sheet.properties.title === sheetName
            );
            
            if (sheetExists) {
                console.log(`✅ Sheet موجود: ${sheetName}`);
                return true;
            }
            
            // Sheet غير موجود - إنشاء جديد
            console.log(`📝 إنشاء Sheet جديد: ${sheetName}`);
            
            await this.sheets.spreadsheets.batchUpdate({
                spreadsheetId: this.spreadsheetId,
                resource: {
                    requests: [{
                        addSheet: {
                            properties: {
                                title: sheetName
                            }
                        }
                    }]
                }
            });

            // إضافة Header
            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `${sheetName}!A1:G1`,
                valueInputOption: 'RAW',
                resource: {
                    values: [[
                        'ID',
                        'Title',
                        'Page URL',
                        'Audio URL',
                        'Type',
                        'Last Sent Index',
                        'Enabled'
                    ]]
                }
            });

            console.log(`✅ تم إنشاء Sheet: ${sheetName}`);
            return true;

        } catch (error) {
            console.error(`❌ فشل إنشاء Sheet ${sheetName}:`, error.message);
            throw error;
        }
    }

    // إنشاء Sheet الإعدادات
    async setupSettingsSheet() {
        await this.initialize();
        
        try {
            console.log('📝 إعداد Settings Sheet...');
            
            // إنشاء Sheet إذا لم يكن موجوداً
            await this.createSheetIfNotExists('Settings');
            
            // التحقق من وجود بيانات
            try {
                const check = await this.sheets.spreadsheets.values.get({
                    spreadsheetId: this.spreadsheetId,
                    range: 'Settings!A1:C10'
                });

                if (check.data.values && check.data.values.length > 1) {
                    console.log('✅ Settings Sheet موجود ومُعد');
                    return true;
                }
            } catch (e) {
                // Sheet موجود لكن فارغ
            }
            
            console.log('📝 إضافة بيانات Settings الافتراضية...');
            
            // إضافة Header والبيانات الافتراضية
            const defaultSettings = [
                ['Section', 'Schedule Time (Cron)', 'Enabled'],
                ['athkar_morning', '30 6 * * *', 'FALSE'],
                ['athkar_evening', '30 15 * * *', 'FALSE'],
                ['fatawa', '0 12 * * *', 'FALSE']
            ];

            await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: 'Settings!A1:C4',
                valueInputOption: 'RAW',
                resource: { values: defaultSettings }
            });

            console.log('✅ تم إنشاء Settings Sheet بالبيانات الافتراضية');
            return true;

        } catch (error) {
            console.error('❌ فشل إعداد Settings:', error.message);
            return false;
        }
    }
}

// تصدير instance واحد (Singleton)
const db = new GoogleSheetsDB();

module.exports = db;

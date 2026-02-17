const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

class SessionManager {
    constructor() {
        this.drive = null;
        this.folderId = null;
    }

    async initialize() {
        if (this.drive) return;
        
        try {
            const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
            const auth = new google.auth.JWT(
                credentials.client_email,
                null,
                credentials.private_key,
                ['https://www.googleapis.com/auth/drive.file']
            );
            this.drive = google.drive({ version: 'v3', auth });
            console.log('✅ Session Manager متصل بـ Google Drive');
        } catch (e) {
            console.error('❌ فشل الاتصال بـ Drive:', e.message);
            throw e;
        }
    }

    async findOrCreateFolder() {
        const folderName = 'whatsapp_sessions';
        
        // البحث عن المجلد
        const res = await this.drive.files.list({
            q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)'
        });

        if (res.data.files.length > 0) {
            this.folderId = res.data.files[0].id;
            console.log(`📁 المجلد موجود: ${this.folderId}`);
        } else {
            // إنشاء المجلد
            const folder = await this.drive.files.create({
                requestBody: {
                    name: folderName,
                    mimeType: 'application/vnd.google-apps.folder'
                },
                fields: 'id'
            });
            this.folderId = folder.data.id;
            console.log(`📁 تم إنشاء المجلد: ${this.folderId}`);
        }
    }

    async uploadSession() {
        await this.initialize();
        await this.findOrCreateFolder();

        const authPath = path.join(__dirname, 'auth_info');
        if (!fs.existsSync(authPath)) {
            console.log('⚠️ لا توجد جلسة لرفعها');
            return false;
        }

        console.log('📤 جاري رفع الجلسة إلى Google Drive...');

        try {
            // ضغط auth_info إلى zip
            const zipPath = path.join(__dirname, 'session.zip');
            await execAsync(`cd ${__dirname} && zip -r session.zip auth_info`);

            // حذف الملف القديم إن وجد
            const existing = await this.drive.files.list({
                q: `name='session.zip' and '${this.folderId}' in parents and trashed=false`,
                fields: 'files(id)'
            });

            if (existing.data.files.length > 0) {
                await this.drive.files.delete({ fileId: existing.data.files[0].id });
                console.log('🗑️ حذف الجلسة القديمة');
            }

            // رفع الملف الجديد
            const media = {
                mimeType: 'application/zip',
                body: fs.createReadStream(zipPath)
            };

            await this.drive.files.create({
                requestBody: {
                    name: 'session.zip',
                    parents: [this.folderId]
                },
                media,
                fields: 'id'
            });

            // حذف الملف المحلي
            fs.unlinkSync(zipPath);

            console.log('✅ تم رفع الجلسة بنجاح');
            return true;
        } catch (e) {
            console.error('❌ فشل رفع الجلسة:', e.message);
            return false;
        }
    }

    async downloadSession() {
        await this.initialize();
        await this.findOrCreateFolder();

        console.log('📥 جاري تحميل الجلسة من Google Drive...');

        try {
            // البحث عن الملف
            const res = await this.drive.files.list({
                q: `name='session.zip' and '${this.folderId}' in parents and trashed=false`,
                fields: 'files(id, name)'
            });

            if (res.data.files.length === 0) {
                console.log('⚠️ لا توجد جلسة محفوظة في Drive');
                return false;
            }

            const fileId = res.data.files[0].id;
            const zipPath = path.join(__dirname, 'session.zip');

            // تحميل الملف
            const dest = fs.createWriteStream(zipPath);
            const response = await this.drive.files.get(
                { fileId, alt: 'media' },
                { responseType: 'stream' }
            );

            await new Promise((resolve, reject) => {
                response.data
                    .on('end', resolve)
                    .on('error', reject)
                    .pipe(dest);
            });

            // فك الضغط
            const authPath = path.join(__dirname, 'auth_info');
            if (fs.existsSync(authPath)) {
                fs.rmSync(authPath, { recursive: true, force: true });
            }

            await execAsync(`cd ${__dirname} && unzip -o session.zip`);
            fs.unlinkSync(zipPath);

            console.log('✅ تم تحميل الجلسة بنجاح');
            return true;
        } catch (e) {
            console.error('❌ فشل تحميل الجلسة:', e.message);
            return false;
        }
    }

    async deleteSession() {
        await this.initialize();
        await this.findOrCreateFolder();

        try {
            const res = await this.drive.files.list({
                q: `name='session.zip' and '${this.folderId}' in parents and trashed=false`,
                fields: 'files(id)'
            });

            if (res.data.files.length > 0) {
                await this.drive.files.delete({ fileId: res.data.files[0].id });
                console.log('✅ تم حذف الجلسة من Drive');
            }

            const authPath = path.join(__dirname, 'auth_info');
            if (fs.existsSync(authPath)) {
                fs.rmSync(authPath, { recursive: true, force: true });
                console.log('✅ تم حذف الجلسة المحلية');
            }

            return true;
        } catch (e) {
            console.error('❌ فشل حذف الجلسة:', e.message);
            return false;
        }
    }
}

module.exports = new SessionManager();

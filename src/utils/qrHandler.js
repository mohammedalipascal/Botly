const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

class QRHandler {
    /**
     * عرض QR Code في الترمنال
     */
    static displayInTerminal(qr) {
        console.log('\n📱 امسح هذا الكود بواتساب:\n');
        qrcode.generate(qr, { small: true });
        console.log('\n⬆️ QR Code أعلاه ⬆️\n');
    }

    /**
     * حفظ QR Code كصورة
     */
    static async saveAsImage(qr, filename = 'qrcode.png') {
        try {
            const qrPath = path.join(process.cwd(), filename);
            await QRCode.toFile(qrPath, qr);
            console.log(`✅ تم حفظ QR Code في: ${qrPath}`);
            return qrPath;
        } catch (error) {
            console.error('❌ خطأ في حفظ QR Code:', error);
            return null;
        }
    }

    /**
     * الحصول على QR Code كـ Base64
     */
    static async getBase64(qr) {
        try {
            const base64 = await QRCode.toDataURL(qr);
            return base64;
        } catch (error) {
            console.error('❌ خطأ في توليد Base64:', error);
            return null;
        }
    }

    /**
     * طباعة تعليمات المسح
     */
    static printInstructions() {
        console.log(`
╔════════════════════════════════════════╗
║     كيفية مسح QR Code بواتساب؟        ║
╠════════════════════════════════════════╣
║                                        ║
║  📱 الخطوات:                          ║
║  1. افتح تطبيق واتساب                 ║
║  2. اضغط على النقاط الثلاث (⋮)        ║
║  3. اختر "الأجهزة المرتبطة"          ║
║  4. اضغط "ربط جهاز"                   ║
║  5. امسح الكود أعلاه                  ║
║                                        ║
╚════════════════════════════════════════╝
        `);
    }
}

module.exports = QRHandler;

const { DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const QRHandler = require('../utils/qrHandler');
const logger = require('../utils/logger');

class ConnectionHandler {
    constructor(startBot) {
        this.startBot = startBot;
    }

    /**
     * معالجة تحديثات الاتصال
     */
    async handleUpdate(update) {
        const { connection, lastDisconnect, qr } = update;

        // معالجة QR Code
        if (qr) {
            this.handleQR(qr);
        }

        // معالجة حالة الاتصال
        if (connection === 'close') {
            await this.handleDisconnect(lastDisconnect);
        } else if (connection === 'open') {
            this.handleConnected();
        } else if (connection === 'connecting') {
            logger.info('🔄 جاري الاتصال بواتساب...');
        }
    }

    /**
     * معالجة QR Code
     */
    handleQR(qr) {
        logger.info('📱 QR Code جديد متاح!');
        
        // عرض في الترمنال
        QRHandler.displayInTerminal(qr);
        
        // طباعة التعليمات
        QRHandler.printInstructions();
        
        // حفظ كصورة
        QRHandler.saveAsImage(qr, 'qrcode.png');
        
        console.log('\n⏳ في انتظار المسح...\n');
    }

    /**
     * معالجة الاتصال الناجح
     */
    handleConnected() {
        logger.info('✅ متصل بواتساب بنجاح!');
        console.log(`
╔════════════════════════════════════════╗
║   ✅ البوت متصل ويعمل الآن!           ║
╚════════════════════════════════════════╝
        `);
    }

    /**
     * معالجة قطع الاتصال
     */
    async handleDisconnect(lastDisconnect) {
        const statusCode = (lastDisconnect?.error instanceof Boom)
            ? lastDisconnect.error.output?.statusCode
            : 500;

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        logger.warn(`❌ انقطع الاتصال. السبب: ${statusCode}`);

        if (statusCode === DisconnectReason.loggedOut) {
            logger.error('🚪 تم تسجيل الخروج. يرجى إعادة المسح.');
            console.log('\n⚠️ تم تسجيل الخروج! احذف مجلد auth_info وأعد التشغيل\n');
        } else if (shouldReconnect) {
            logger.info('🔄 إعادة الاتصال...');
            setTimeout(() => this.startBot(), 3000);
        }
    }
}

module.exports = ConnectionHandler;

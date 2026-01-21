const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
const config = require('./config/config');
const logger = require('./utils/logger');
const ConnectionHandler = require('./handlers/connectionHandler');
const MessageHandler = require('./handlers/messageHandler');

async function startBot() {
    try {
        // تحميل بيانات المصادقة
        const { state, saveCreds } = await useMultiFileAuthState('auth_info');

        // إنشاء الاتصال
        const sock = makeWASocket({
            auth: state,
            printQRInTerminal: config.printQRInTerminal,
            logger: logger,
            browser: ['واتساب بوت', 'Chrome', '1.0.0']
        });

        // معالجات
        const connectionHandler = new ConnectionHandler(startBot);
        const messageHandler = new MessageHandler(sock);

        // حفظ بيانات المصادقة
        sock.ev.on('creds.update', saveCreds);

        // معالجة تحديثات الاتصال
        sock.ev.on('connection.update', async (update) => {
            await connectionHandler.handleUpdate(update);
        });

        // معالجة الرسائل
        sock.ev.on('messages.upsert', async ({ messages }) => {
            await messageHandler.handle(messages);
        });

        logger.info('🤖 تم تهيئة البوت بنجاح');

    } catch (error) {
        logger.error('❌ خطأ في بدء البوت:', error);
        throw error;
    }
}

module.exports = startBot;

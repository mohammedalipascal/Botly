require('dotenv').config();
const keepAlive = require('./keep-alive');
const startBot = require('./src/bot');

// تشغيل السيرفر للحفاظ على النشاط
keepAlive();

// بدء البوت
console.log('🚀 Starting WhatsApp Bot...');
startBot().catch(err => {
    console.error('❌ Fatal Error:', err);
    process.exit(1);
});

// معالجة الأخطاء غير المتوقعة
process.on('unhandledRejection', (err) => {
    console.error('⚠️ Unhandled Rejection:', err);
});

process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err);
});

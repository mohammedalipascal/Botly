module.exports = {
    botName: process.env.BOT_NAME || 'واتساب بوت',
    prefix: process.env.BOT_PREFIX || '!',
    owner: process.env.BOT_OWNER || '',
    
    // إعدادات QR Code
    usePairingCode: process.env.USE_PAIRING_CODE === 'true',
    phoneNumber: process.env.PHONE_NUMBER || '',
    
    // إعدادات الاتصال
    printQRInTerminal: true,
    
    // إعدادات السجلات
    logLevel: process.env.LOG_LEVEL || 'info',
    
    // رسائل ترحيبية
    welcomeMessage: '👋 مرحباً! أنا بوت واتساب',
    helpMessage: `
📚 *الأوامر المتاحة:*

- !help - عرض المساعدة
- !info - معلومات البوت
- !ping - اختبار الاتصال
- !menu - القائمة الرئيسية

_اكتب أي أمر للبدء!_
    `.trim()
};

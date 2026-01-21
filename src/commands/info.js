module.exports = {
    name: 'info',
    description: 'معلومات عن البوت',
    
    async execute(sock, sender, args, msg) {
        const info = `
🤖 *معلومات البوت*

📌 الإصدار: 1.0.0
⚡ التقنية: Baileys (Node.js)
🌐 الاستضافة: Clever Cloud
💻 المطور: Your Name

_بوت واتساب مبني بالكامل من الصفر_
        `.trim();

        await sock.sendMessage(sender, { text: info });
    }
};

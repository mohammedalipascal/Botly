const config = require('../config/config');

module.exports = {
    name: 'help',
    description: 'عرض قائمة المساعدة',
    
    async execute(sock, sender, args, msg) {
        await sock.sendMessage(sender, {
            text: config.helpMessage
        });
    }
};

// AdminPanel - يحول كل شيء إلى islamicModule
// كل الوظائف الآن في قائمة واحدة موحدة

const islamicModule = require('../islamic/islamicModule');

class AdminPanel {
    constructor() {
        // dummy - كل شيء في Islamic Module
    }

    isAdmin(sender) {
        return sender.includes('249962204268') || 
               sender.includes('231211024814174') ||
               sender.includes('252355702448348');
    }

    async handleAdminCommand(sock, msg, text, sender) {
        if (!this.isAdmin(sender) && !msg.key.fromMe) {
            return false;
        }

        // تحويل لـ Islamic Module (القائمة الموحدة)
        return await islamicModule.handleIslamicCommand(sock, msg, text, sender);
    }
}

module.exports = new AdminPanel();

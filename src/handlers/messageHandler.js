const config = require('../config/config');
const logger = require('../utils/logger');

// استيراد الأوامر
const helpCommand = require('../commands/help');
const infoCommand = require('../commands/info');
const pingCommand = require('../commands/ping');

class MessageHandler {
    constructor(sock) {
        this.sock = sock;
        this.commands = {
            help: helpCommand,
            info: infoCommand,
            ping: pingCommand
        };
    }

    /**
     * معالجة الرسائل الواردة
     */
    async handle(messages) {
        const msg = messages[0];

        // تجاهل الرسائل القديمة والرسائل من البوت
        if (!msg.message || msg.key.fromMe) return;

        const sender = msg.key.remoteJid;
        const messageText = this.extractText(msg);

        logger.info(`📩 رسالة من ${sender}: ${messageText}`);

        // التحقق من الأوامر
        if (messageText.startsWith(config.prefix)) {
            await this.handleCommand(sender, messageText, msg);
        } else {
            await this.handleNormalMessage(sender, messageText, msg);
        }
    }

    /**
     * استخراج نص الرسالة
     */
    extractText(msg) {
        return (
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            ''
        );
    }

    /**
     * معالجة الأوامر
     */
    async handleCommand(sender, text, msg) {
        const args = text.slice(config.prefix.length).trim().split(/ +/);
        const command = args.shift().toLowerCase();

        const commandHandler = this.commands[command];

        if (commandHandler) {
            try {
                await commandHandler.execute(this.sock, sender, args, msg);
            } catch (error) {
                logger.error(`❌ خطأ في تنفيذ الأمر ${command}:`, error);
                await this.sock.sendMessage(sender, {
                    text: '❌ حدث خطأ أثناء تنفيذ الأمر'
                });
            }
        }
    }

    /**
     * معالجة الرسائل العادية
     */
    async handleNormalMessage(sender, text, msg) {
        const lowerText = text.toLowerCase();

        if (lowerText.includes('مرحبا') || lowerText.includes('السلام')) {
            await this.sock.sendMessage(sender, {
                text: config.welcomeMessage
            });
        } else {
            await this.sock.sendMessage(sender, {
                text: `شكراً لرسالتك!\n\nاكتب *${config.prefix}help* لعرض الأوامر المتاحة 📚`
            });
        }
    }
}

module.exports = MessageHandler;

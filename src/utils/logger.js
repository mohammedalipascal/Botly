const pino = require('pino');
const path = require('path');
const fs = require('fs');

// إنشاء مجلد logs إذا لم يكن موجود
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const logger = pino({
    level: process.env.LOG_LEVEL || 'info',
    transport: {
        targets: [
            {
                target: 'pino-pretty',
                level: 'info',
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname'
                }
            },
            {
                target: 'pino/file',
                level: 'info',
                options: {
                    destination: path.join(logsDir, 'bot.log'),
                    mkdir: true
                }
            }
        ]
    }
});

module.exports = logger;

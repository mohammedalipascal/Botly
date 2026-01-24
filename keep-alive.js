const http = require('http');
const logger = require('./logger');

class KeepAliveServer {
    constructor() {
        this.server = null;
        this.isRunning = false;
        this.healthChecks = [];
    }

    start() {
        this.server = http.createServer((req, res) => {
            if (req.url === '/health' || req.url === '/') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'online',
                    bot: 'Botly WhatsApp Bot',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    memory: process.memoryUsage()
                }));
            } else if (req.url === '/metrics') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    healthChecks: this.healthChecks.length,
                    uptime: process.uptime(),
                    memory: process.memoryUsage()
                }));
            } else {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Not Found' }));
            }
        });

        const PORT = process.env.PORT || 10000;
        
        this.server.listen(PORT, '0.0.0.0', () => {
            this.isRunning = true;
            logger.log(`🌐 Keep-Alive Server running on port ${PORT}`);
        });

        this.server.on('error', (err) => {
            logger.error(`Server error: ${err.message}`);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => this.shutdown());
        process.on('SIGINT', () => this.shutdown());
    }

    shutdown() {
        if (this.isRunning) {
            logger.warn('🛑 Shutting down keep-alive server...');
            this.server.close(() => {
                this.isRunning = false;
                logger.log('✅ Keep-alive server closed');
                process.exit(0);
            });
        }
    }

    recordHealthCheck() {
        this.healthChecks.push(new Date());
        // Keep only last 100 checks
        if (this.healthChecks.length > 100) {
            this.healthChecks.shift();
        }
    }
}

function keepAlive() {
    const kaServer = new KeepAliveServer();
    kaServer.start();
    
    // Record health checks every 30 seconds
    setInterval(() => {
        kaServer.recordHealthCheck();
    }, 30000);

    return kaServer.server;
}

module.exports = keepAlive;
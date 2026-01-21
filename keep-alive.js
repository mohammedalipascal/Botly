const http = require('http');

function keepAlive() {
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            bot: 'WhatsApp Bot',
            timestamp: new Date().toISOString()
        }));
    });

    const PORT = process.env.PORT || 8080;
    
    server.listen(PORT, () => {
        console.log(`🌐 Keep-Alive Server running on port ${PORT}`);
    });

    return server;
}

module.exports = keepAlive;

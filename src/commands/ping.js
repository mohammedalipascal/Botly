module.exports = {
    name: 'ping',
    description: 'اختبار سرعة الاستجابة',
    
    async execute(sock, sender, args, msg) {
        const start = Date.now();
        
        await sock.sendMessage(sender, {
            text: '🏓 Pong!'
        });
        
        const ping = Date.now() - start;
        
        await sock.sendMessage(sender, {
            text: `⚡ الاستجابة: ${ping}ms`
        });
    }
};

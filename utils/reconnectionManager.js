class ReconnectionManager {
    constructor(options = {}) {
        this.maxAttempts = options.maxAttempts || Infinity;
        this.baseDelay = options.baseDelay || 1000;
        this.maxDelay = options.maxDelay || 60000;
        this.attempts = 0;
        this.timer = null;
        this.isReconnecting = false;
    }

    reset() {
        this.attempts = 0;
        this.clearTimer();
        this.isReconnecting = false;
        console.log('✅ Reconnection counter reset');
    }

    clearTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    getDelay() {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s, 60s max
        const delay = Math.min(
            this.baseDelay * Math.pow(2, this.attempts),
            this.maxDelay
        );
        return delay;
    }

    shouldReconnect(statusCode) {
        // Don't reconnect on these codes
        const DO_NOT_RECONNECT = [
            401, // Unauthorized
            403, // Forbidden
            428, // Precondition Required (logged out)
        ];

        if (DO_NOT_RECONNECT.includes(statusCode)) {
            return false;
        }

        if (this.attempts >= this.maxAttempts) {
            console.error(`❌ Max reconnection attempts (${this.maxAttempts}) reached`);
            return false;
        }

        return true;
    }

    async reconnect(reconnectFn) {
        if (this.isReconnecting) {
            console.log('⏭️ Already reconnecting, skipping...');
            return;
        }

        this.clearTimer();
        this.attempts++;
        this.isReconnecting = true;

        const delay = this.getDelay();
        const delaySeconds = (delay / 1000).toFixed(1);

        console.log('\n╔════════════════════════════════════════╗');
        console.log(`║  🔄 RECONNECTION ATTEMPT ${this.attempts}/${this.maxAttempts === Infinity ? '∞' : this.maxAttempts}  ║`);
        console.log(`║  ⏰ Delay: ${delaySeconds}s                    ║`);
        console.log('╚════════════════════════════════════════╝\n');

        return new Promise((resolve, reject) => {
            this.timer = setTimeout(async () => {
                try {
                    console.log('🚀 Executing reconnection...\n');
                    await reconnectFn();
                    this.isReconnecting = false;
                    resolve();
                } catch (error) {
                    this.isReconnecting = false;
                    console.error('❌ Reconnection failed:', error.message);
                    reject(error);
                }
            }, delay);
        });
    }

    getStats() {
        return {
            attempts: this.attempts,
            isReconnecting: this.isReconnecting,
            nextDelay: this.getDelay()
        };
    }
}

module.exports = { ReconnectionManager };

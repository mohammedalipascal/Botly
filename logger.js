// logger.js

class Logger {
  constructor() {
    this.logs = [];
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[LOG ${timestamp}]: ${message}`;
    this.logs.push(logEntry);
    console.log(logEntry);
  }

  error(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[ERROR ${timestamp}]: ${message}`;
    this.logs.push(logEntry);
    console.error(logEntry);
  }

  warn(message) {
    const timestamp = new Date().toISOString();
    const logEntry = `[WARN ${timestamp}]: ${message}`;
    this.logs.push(logEntry);
    console.warn(logEntry);
  }

  getLogs() {
    return this.logs;
  }
}

module.exports = new Logger();

'use strict';

class ConnectionHandler {
    constructor() {
        this.retryCount = 0;
        this.maxRetries = 5;
        this.retryDelay = 2000; // milliseconds
    }

    connect() {
        // Logic to establish connection
        console.log('Attempting to connect...');
        // Simulating connection logic with a mock database or service URL
        const success = this.simulateConnection();

        if (!success) {
            this.handleConnectionFailure();
        } else {
            console.log('Connection established successfully.');
            this.retryCount = 0; // Reset retry count on successful connection
        }
    }

    simulateConnection() {
        // Simulate a connection failure randomly for demonstration purposes
        return Math.random() > 0.5;
    }

    handleConnectionFailure() {
        if (this.retryCount < this.maxRetries) {
            this.retryCount++;
            console.log(`Connection failed. Retrying in ${this.retryDelay / 1000} seconds... (Attempt ${this.retryCount})`);
            setTimeout(() => this.connect(), this.retryDelay);
        } else {
            console.log('Max retry attempts reached. Connection failed.');
        }
    }
}

// Usage
const connectionHandler = new ConnectionHandler();
connectionHandler.connect();

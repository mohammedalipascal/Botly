const { MongoClient } = require('mongodb');
const { initAuthCreds, BufferJSON } = require('@whiskeysockets/baileys');

class MongoDBAuthState {
    constructor(mongoUrl, options = {}) {
        this.mongoUrl = mongoUrl;
        this.dbName = options.dbName || 'whatsapp_bot';
        this.collectionName = options.collectionName || 'auth_state';
        this.sessionId = options.sessionId || 'default';
        this.client = null;
        this.collection = null;
    }

    async connect() {
        if (this.client) return;
        
        console.log('📊 Connecting to MongoDB...');
        this.client = new MongoClient(this.mongoUrl, {
            maxPoolSize: 10,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        });
        
        await this.client.connect();
        console.log('✅ MongoDB connected');
        
        this.db = this.client.db(this.dbName);
        this.collection = this.db.collection(this.collectionName);
        
        // Create indexes
        await this.collection.createIndex(
            { sessionId: 1, key: 1 }, 
            { unique: true }
        );
        
        console.log('✅ MongoDB indexes created');
    }

    async writeData(key, data) {
        try {
            await this.collection.updateOne(
                { sessionId: this.sessionId, key },
                { 
                    $set: { 
                        value: JSON.stringify(data, BufferJSON.replacer),
                        updatedAt: new Date()
                    } 
                },
                { upsert: true }
            );
        } catch (e) {
            console.error(`❌ MongoDB write error (${key}):`, e.message);
        }
    }

    async readData(key) {
        try {
            const doc = await this.collection.findOne({ 
                sessionId: this.sessionId, 
                key 
            });
            
            if (doc?.value) {
                return JSON.parse(doc.value, BufferJSON.reviver);
            }
        } catch (e) {
            console.error(`❌ MongoDB read error (${key}):`, e.message);
        }
        return null;
    }

    async removeData(key) {
        try {
            await this.collection.deleteOne({ 
                sessionId: this.sessionId, 
                key 
            });
        } catch (e) {
            console.error(`❌ MongoDB remove error (${key}):`, e.message);
        }
    }

    async clearSession() {
        try {
            await this.collection.deleteMany({ 
                sessionId: this.sessionId 
            });
            console.log('🗑️ Session cleared from MongoDB');
        } catch (e) {
            console.error('❌ Error clearing session:', e.message);
        }
    }

    async getAuthState() {
        await this.connect();
        
        console.log('📥 Loading auth state from MongoDB...');
        const creds = await this.readData('creds') || initAuthCreds();
        console.log(`✅ Creds loaded: ${creds ? 'exists' : 'new'}`);
        
        return {
            state: {
                creds,
                keys: {
                    get: async (type, ids) => {
                        const data = {};
                        for (const id of ids) {
                            const key = `${type}-${id}`;
                            const value = await this.readData(key);
                            if (value) {
                                data[id] = value;
                            }
                        }
                        return data;
                    },
                    set: async (data) => {
                        const tasks = [];
                        for (const category in data) {
                            for (const id in data[category]) {
                                const key = `${category}-${id}`;
                                tasks.push(this.writeData(key, data[category][id]));
                            }
                        }
                        await Promise.all(tasks);
                    }
                }
            },
            saveCreds: async () => {
                await this.writeData('creds', creds);
            }
        };
    }

    async close() {
        if (this.client) {
            await this.client.close();
            console.log('👋 MongoDB connection closed');
        }
    }
}

async function useMongoDBAuthState(mongoUrl, options = {}) {
    const mongoAuth = new MongoDBAuthState(mongoUrl, options);
    return await mongoAuth.getAuthState();
}

module.exports = { useMongoDBAuthState, MongoDBAuthState };

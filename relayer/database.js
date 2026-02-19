const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
    constructor(dbPath) {
        this.dbPath = dbPath || process.env.DB_PATH || './data/processed_nonces.db';

        // Ensure directory exists
        const dir = path.dirname(this.dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('Could not connect to database', err);
            } else {
                console.log('Connected to database');
                this.init();
            }
        });
    }

    init() {
        this.db.run(`CREATE TABLE IF NOT EXISTS processed_events (
            id TEXT PRIMARY KEY,
            chain_id INTEGER,
            nonce INTEGER,
            transaction_hash TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`, (err) => {
            if (err) console.error("Error creating table", err);
        });
    }

    async hasProcessed(chainId, nonce) {
        return new Promise((resolve, reject) => {
            this.db.get("SELECT id FROM processed_events WHERE chain_id = ? AND nonce = ?", [chainId, nonce], (err, row) => {
                if (err) reject(err);
                resolve(!!row);
            });
        });
    }

    async markProcessed(chainId, nonce, txHash) {
        return new Promise((resolve, reject) => {
            const id = `${chainId}-${nonce}`;
            this.db.run("INSERT OR IGNORE INTO processed_events (id, chain_id, nonce, transaction_hash) VALUES (?, ?, ?, ?)",
                [id, chainId, nonce, txHash], (err) => {
                    if (err) reject(err);
                    resolve();
                });
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = Database;

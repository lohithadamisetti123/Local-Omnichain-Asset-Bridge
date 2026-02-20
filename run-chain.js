#!/usr/bin/env node
/**
 * Simple wrapper to start a Hardhat node on a specific port
 * Usage: node run-chain.js <port> <chain-name>
 */

const { spawn } = require('child_process');

if (process.argv.length < 4) {
    console.error('Usage: node run-chain.js <port> <chain-name>');
    console.error('Example: node run-chain.js 8545 "Chain A"');
    process.exit(1);
}

const port = process.argv[2];
const chainName = process.argv[3];

console.log(`\n🚀 Starting ${chainName} on port ${port}...\n`);

// Run: npx hardhat node --port <port> --hostname 127.0.0.1
const hardhat = spawn('npx', ['hardhat', 'node', '--port', port, '--hostname', '127.0.0.1'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true
});

hardhat.on('error', (err) => {
    console.error(`❌ Failed to start ${chainName}:`, err);
    process.exit(1);
});

hardhat.on('exit', (code) => {
    console.log(`\n${chainName} exited with code ${code}`);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
    console.log(`\n\n🛑 Stopping ${chainName}...`);
    hardhat.kill();
    process.exit(0);
});

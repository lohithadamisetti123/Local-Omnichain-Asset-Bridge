#!/usr/bin/env node
/**
 * Complete end-to-end test: Start chains, deploy, run tests
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function runCommand(command, args = [], options = {}) {
    return new Promise((resolve, reject) => {
        console.log(`\n▶ Running: ${command} ${args.join(' ')}\n`);
        
        const proc = spawn(command, args, {
            cwd: __dirname,
            stdio: 'inherit',
            shell: true,
            ...options
        });

        proc.on('exit', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`Command failed with exit code ${code}`));
            }
        });

        proc.on('error', (err) => {
            reject(err);
        });
    });
}

async function main() {
    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('🚀 Local Omnichain Asset Bridge - End-to-End Test');
    console.log('═══════════════════════════════════════════════════════════════════════════\n');

    try {
        // Step 1: Install dependencies
        console.log('📦 Step 1: Installing dependencies...');
        await runCommand('npm', ['install']);
        await runCommand('npm', ['install'], { cwd: path.join(__dirname, 'relayer') });

        // Step 2: Compile contracts
        console.log('\n📋 Step 2: Compiling contracts...');
        await runCommand('npx', ['hardhat', 'compile']);

        // Step 3: Run unit tests (no chain required)
        console.log('\n✅ Step 3: Running unit tests...');
        await runCommand('npm', ['run', 'test:unit']);

        console.log('\n═══════════════════════════════════════════════════════════════════════════');
        console.log('✨ All tests completed successfully!');
        console.log('═══════════════════════════════════════════════════════════════════════════\n');

        console.log('📝 Next steps to run the full system:\n');
        console.log('   Terminal 1: Start both blockchain nodes');
        console.log('   $ node start-chains.js\n');
        console.log('   Terminal 2: Deploy contracts');
        console.log('   $ npx hardhat run scripts/deploy_chain_a.js --network chainA');
        console.log('   $ npx hardhat run scripts/deploy_chain_b.js --network chainB\n');
        console.log('   Terminal 3: Start relayer');
        console.log('   $ cd relayer && node index.js\n');
        console.log('   Terminal 4: Run integration tests');
        console.log('   $ npm run test:integration\n');

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.log('\n═══════════════════════════════════════════════════════════════════════════');
        process.exit(1);
    }
}

main();

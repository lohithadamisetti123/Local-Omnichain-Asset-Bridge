#!/usr/bin/env node
/**
 * Start both blockchain nodes for Chain A and Chain B
 * Chain A: http://127.0.0.1:8545
 * Chain B: http://127.0.0.1:9545
 */

const { spawn } = require('child_process');
const net = require('net');
const http = require('http');

function isPortInUse(port) {
    return new Promise((resolve) => {
        const server = net.createServer()
            .once('error', (err) => {
                if (err.code === 'EADDRINUSE') resolve(true);
                else resolve(false);
            })
            .once('listening', () => {
                server.close();
                resolve(false);
            })
            .listen(port);
    });
}

async function checkRpcHealth(port) {
    return new Promise((resolve) => {
        const postData = JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_chainId',
            params: [],
            id: 1
        });

        const req = http.request({
            hostname: '127.0.0.1',
            port: port,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': postData.length
            }
        }, (res) => {
            resolve(res.statusCode === 200);
        });

        req.on('error', () => resolve(false));
        req.write(postData);
        req.end();
    });
}

async function waitForPort(port, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        const healthy = await checkRpcHealth(port);
        if (healthy) {
            return true;
        }
        await new Promise(r => setTimeout(r, 1000));
    }
    return false;
}

async function main() {
    console.log('🚀 Starting Local Omnichain Bridge - Two Blockchain Nodes\n');

    const portA = 8545;
    const portB = 9545;

    // Check if ports are already in use
    const aInUse = await isPortInUse(portA);
    const bInUse = await isPortInUse(portB);

    if (aInUse || bInUse) {
        console.log('⚠️  One or both ports are already in use:');
        if (aInUse) console.log(`   - Port ${portA} (Chain A)`);
        if (bInUse) console.log(`   - Port ${portB} (Chain B)`);
        console.log('\n💡 Tip: Kill Node processes with: Get-Process node | Stop-Process -Force\n');
        process.exit(1);
    }

    // Start Chain A
    console.log(`📦 Starting Chain A on port ${portA}...`);
    const chainA = spawn('npx', ['hardhat', 'node', '--hostname', '127.0.0.1', '--port', `${portA}`], {
        cwd: __dirname,
        shell: true
    });

    // Pipe output
    chainA.stdout.on('data', (data) => {
        process.stdout.write(`[ChainA] ${data}`);
    });
    chainA.stderr.on('data', (data) => {
        process.stderr.write(`[ChainA] ${data}`);
    });

    // Wait for Chain A
    const chainAReady = await waitForPort(portA);
    if (!chainAReady) {
        console.error(`\n❌ Chain A failed to start after 30 seconds\n`);
        chainA.kill();
        process.exit(1);
    }
    console.log(`\n✅ Chain A is ready on port ${portA}\n`);

    // Start Chain B (with slight delay)
    await new Promise(r => setTimeout(r, 1000));
    console.log(`📦 Starting Chain B on port ${portB}...`);
    const chainB = spawn('npx', ['hardhat', 'node', '--hostname', '127.0.0.1', '--port', `${portB}`], {
        cwd: __dirname,
        shell: true
    });

    chainB.stdout.on('data', (data) => {
        process.stdout.write(`[ChainB] ${data}`);
    });
    chainB.stderr.on('data', (data) => {
        process.stderr.write(`[ChainB] ${data}`);
    });

    // Wait for Chain B
    const chainBReady = await waitForPort(portB);
    if (!chainBReady) {
        console.error(`\n❌ Chain B failed to start after 30 seconds\n`);
        chainA.kill();
        chainB.kill();
        process.exit(1);
    }
    console.log(`✅ Chain B is ready on port ${portB}\n`);

    console.log('═══════════════════════════════════════════════════════════════════════════');
    console.log('🎉 Both blockchain nodes are running!\n');
    console.log('   Chain A (Settlement):  http://127.0.0.1:8545');
    console.log('   Chain B (Execution):   http://127.0.0.1:9545\n');
    console.log('📋 Next steps:\n');
    console.log('   1. In a NEW TERMINAL, deploy contracts:');
    console.log('      npx hardhat run scripts/deploy_chain_a.js --network chainA');
    console.log('      npx hardhat run scripts/deploy_chain_b.js --network chainB\n');
    console.log('   2. In another NEW TERMINAL, start the relayer:');
    console.log('      cd relayer && node index.js\n');
    console.log('═══════════════════════════════════════════════════════════════════════════');

    // Handle shutdown
    process.on('SIGINT', () => {
        console.log('\n\n🛑 Shutting down blockchain nodes...');
        chainA.kill();
        chainB.kill();
        process.exit(0);
    });
}

main().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});



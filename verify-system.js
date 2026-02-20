#!/usr/bin/env node
/**
 * Verify all components are working correctly
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

async function checkRpc(port, name) {
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
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve({ healthy: true, chainId: result.result, name });
                } catch {
                    resolve({ healthy: false, name });
                }
            });
        });

        req.on('error', () => {
            resolve({ healthy: false, name });
        });

        req.write(postData);
        req.end();
    });
}

function checkFile(filePath, description) {
    if (fs.existsSync(filePath)) {
        return { ok: true, description, file: path.basename(filePath) };
    }
    return { ok: false, description, file: path.basename(filePath) };
}

async function main() {
    console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║         SYSTEM VERIFICATION - LOCAL OMNICHAIN BRIDGE             ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

    console.log('🔍 Checking System Components...\n');

    // Check files
    console.log('📁 Configuration Files:');
    const files = [
        { path: '.env', desc: 'Environment Config' },
        { path: 'hardhat.config.js', desc: 'Hardhat Config' },
        { path: 'contracts/VaultToken.sol', desc: 'Contracts' },
        { path: 'relayer/index.js', desc: 'Relayer Service' },
        { path: 'scripts/deploy_chain_a.js', desc: 'Deployment Scripts' },
        { path: 'relayer/deployments_chain_a.json', desc: 'Chain A Deployments' },
        { path: 'relayer/deployments_chain_b.json', desc: 'Chain B Deployments' }
    ];

    const fileChecks = files.map(f => checkFile(f.path, f.desc));
    fileChecks.forEach(check => {
        const status = check.ok ? '✓' : '✗';
        const color = check.ok ? '\x1b[32m' : '\x1b[31m';
        console.log(`   ${color}${status}\x1b[0m ${check.description} (${check.file})`);
    });

    // Check RPC endpoints
    console.log('\n🌐 Blockchain Nodes:');
    const [chainA, chainB] = await Promise.all([
        checkRpc(8545, 'Chain A'),
        checkRpc(9545, 'Chain B')
    ]);

    if (chainA.healthy) {
        console.log(`   ✓ Chain A running on port 8545 (ChainID: ${chainA.chainId})`);
    } else {
        console.log(`   ✗ Chain A not responding on port 8545\n   FIX: Run "node run-chain.js 8545 'Chain A'" in a new terminal`);
    }

    if (chainB.healthy) {
        console.log(`   ✓ Chain B running on port 9545 (ChainID: ${chainB.chainId})`);
    } else {
        console.log(`   ✗ Chain B not responding on port 9545\n   FIX: Run "node run-chain.js 9545 'Chain B'" in a new terminal`);
    }

    // Check deployments
    console.log('\n🚀 Deployments:');
    const deploymentsA = checkFile('relayer/deployments_chain_a.json', 'Chain A Contracts');
    const deploymentsB = checkFile('relayer/deployments_chain_b.json', 'Chain B Contracts');

    if (deploymentsA.ok) {
        try {
            const data = JSON.parse(fs.readFileSync('relayer/deployments_chain_a.json', 'utf-8'));
            console.log(`   ✓ Chain A: ${Object.keys(data).length} contracts deployed`);
        } catch {
            console.log(`   ✗ Chain A deployments file corrupted`);
        }
    } else {
        console.log(`   ✗ Chain A deployments not found\n   FIX: Run "npx hardhat run scripts/deploy_chain_a.js --network chainA"`);
    }

    if (deploymentsB.ok) {
        try {
            const data = JSON.parse(fs.readFileSync('relayer/deployments_chain_b.json', 'utf-8'));
            console.log(`   ✓ Chain B: ${Object.keys(data).length} contracts deployed`);
        } catch {
            console.log(`   ✗ Chain B deployments file corrupted`);
        }
    } else {
        console.log(`   ✗ Chain B deployments not found\n   FIX: Run "npx hardhat run scripts/deploy_chain_b.js --network chainB"`);
    }

    // Summary
    console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
    const allOk = chainA.healthy && chainB.healthy && deploymentsA.ok && deploymentsB.ok;
    
    if (allOk) {
        console.log('║                     ✅ SYSTEM READY TO USE                       ║');
        console.log('╠═══════════════════════════════════════════════════════════════════╣');
        console.log('║  Next: Start the relayer in a new terminal:                      ║');
        console.log('║        cd relayer && node index.js                               ║');
    } else {
        console.log('║                  ⚠️  SETUP NOT COMPLETE                          ║');
        console.log('╠═══════════════════════════════════════════════════════════════════╣');
        if (!chainA.healthy || !chainB.healthy) {
            console.log('║  Start both Hardhat nodes (see QUICK_START.txt)               ║');
        }
        if (!deploymentsA.ok || !deploymentsB.ok) {
            console.log('║  Deploy contracts to both chains (see QUICK_START.txt)         ║');
        }
    }
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

    process.exit(allOk ? 0 : 1);
}

main().catch(console.error);

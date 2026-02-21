const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { ethers } = require('ethers');
const fs = require('fs');
const Database = require('./database');

const DB_PATH = process.env.DB_PATH || './data/processed_nonces.db';
const CONFIRMATION_DEPTH = parseInt(process.env.CONFIRMATION_DEPTH) || 3;
const POLLING_INTERVAL = 2000; // 2 seconds

// Load Deployments
const DEPLOYMENTS_DIR = process.env.DEPLOYMENTS_DIR || '.';
let chainADeployments, chainBDeployments;

try {
    chainADeployments = JSON.parse(fs.readFileSync(path.join(DEPLOYMENTS_DIR, 'deployments_chain_a.json'), 'utf-8'));
    chainBDeployments = JSON.parse(fs.readFileSync(path.join(DEPLOYMENTS_DIR, 'deployments_chain_b.json'), 'utf-8'));
} catch (e) {
    console.error("Failed to load deployment files:", e.message);
    process.exit(1);
}

// ABIs
const BridgeLockABI = [
    "event Locked(address indexed user, uint256 amount, uint256 nonce)",
    "function unlock(address user, uint256 amount, uint256 nonce)",
    "function pause()",
    "function processedNonces(uint256) view returns (bool)"
];

const BridgeMintABI = [
    "event Burned(address indexed user, uint256 amount, uint256 nonce)",
    "event MintWrappedCalled(address indexed user, uint256 amount, uint256 nonce)",
    "function mintWrapped(address user, uint256 amount, uint256 nonce)",
    "function processedNonces(uint256) view returns (bool)"
];

const GovernanceVotingABI = [
    "event ProposalPassed(uint256 indexed proposalId, bytes data)"
];

const GovernanceEmergencyABI = [
    "function pauseBridge()"
];

class Relayer {
    constructor() {
        this.db = new Database(DB_PATH);

        // Providers
        this.providerA = new ethers.JsonRpcProvider(process.env.CHAIN_A_RPC_URL);
        this.providerB = new ethers.JsonRpcProvider(process.env.CHAIN_B_RPC_URL);

        // Signers
        const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
        this.walletA = new ethers.Wallet(privateKey, this.providerA);
        this.walletB = new ethers.Wallet(privateKey, this.providerB);

        // Contracts
        this.bridgeLock = new ethers.Contract(chainADeployments.BridgeLock, BridgeLockABI, this.walletA);
        this.governanceEmergency = new ethers.Contract(chainADeployments.GovernanceEmergency, GovernanceEmergencyABI, this.walletA);

        this.bridgeMint = new ethers.Contract(chainBDeployments.BridgeMint, BridgeMintABI, this.walletB);
        this.governanceVoting = new ethers.Contract(chainBDeployments.GovernanceVoting, GovernanceVotingABI, this.providerB);

        this.running = false;
        this.lastProcessedBlockA = 0;
        this.lastProcessedBlockB = 0;
    }

    async start() {
        console.log("Starting Relayer Service...");
        this.running = true;

        try {
            // Wait for chains to be ready
            await this.waitForChains();
            
            // Process past events first (Recovery)
            await this.recover();

            // Set up event listeners
            this.providerA.on("block", (blockNumber) => this.processChainA(blockNumber));
            this.providerB.on("block", (blockNumber) => this.processChainB(blockNumber));

            console.log(`Relayer listening on Chain A (${chainADeployments.ChainId}) and Chain B (${chainBDeployments.ChainId})`);
        } catch (e) {
            console.error("Error starting relayer:", e);
            setTimeout(() => this.start(), 5000);
        }
    }

    async waitForChains() {
        console.log("Waiting for chains to be ready...");
        const maxRetries = 30;
        let retriesA = 0, retriesB = 0;

        while (retriesA < maxRetries || retriesB < maxRetries) {
            try {
                if (retriesA < maxRetries) {
                    const networkA = await this.providerA.getNetwork();
                    console.log(`Chain A (ChainId ${networkA.chainId}) is ready`);
                    retriesA = maxRetries;
                }
            } catch (e) {
                console.log(`Waiting for Chain A... (${retriesA}/${maxRetries})`);
                retriesA++;
                await new Promise(r => setTimeout(r, 1000));
            }

            try {
                if (retriesB < maxRetries) {
                    const networkB = await this.providerB.getNetwork();
                    console.log(`Chain B (ChainId ${networkB.chainId}) is ready`);
                    retriesB = maxRetries;
                }
            } catch (e) {
                console.log(`Waiting for Chain B... (${retriesB}/${maxRetries})`);
                retriesB++;
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (retriesA > maxRetries || retriesB > maxRetries) {
            throw new Error("Chains not ready after max retries");
        }
    }

    async recover() {
        console.log("Recovering: scanning for missed events...");

        try {
            const currentBlockA = await this.providerA.getBlockNumber();
            const currentBlockB = await this.providerB.getBlockNumber();

            const confirmedBlockA = Math.max(0, currentBlockA - CONFIRMATION_DEPTH);
            const confirmedBlockB = Math.max(0, currentBlockB - CONFIRMATION_DEPTH);

            console.log(`Chain A: Current block ${currentBlockA}, scanning up to ${confirmedBlockA}`);
            console.log(`Chain B: Current block ${currentBlockB}, scanning up to ${confirmedBlockB}`);

            await this.processRangeA(0, confirmedBlockA);
            await this.processRangeB(0, confirmedBlockB);

            this.lastProcessedBlockA = confirmedBlockA;
            this.lastProcessedBlockB = confirmedBlockB;

            console.log("Recovery complete.");
        } catch (e) {
            console.error("Error during recovery:", e);
        }
    }

    async processChainA(currentBlock) {
        const targetBlock = currentBlock - CONFIRMATION_DEPTH;
        if (targetBlock < 0 || targetBlock <= this.lastProcessedBlockA) return;

        await this.processRangeA(this.lastProcessedBlockA + 1, targetBlock);
        this.lastProcessedBlockA = targetBlock;
    }

    async processChainB(currentBlock) {
        const targetBlock = currentBlock - CONFIRMATION_DEPTH;
        if (targetBlock < 0 || targetBlock <= this.lastProcessedBlockB) return;

        await this.processRangeB(this.lastProcessedBlockB + 1, targetBlock);
        this.lastProcessedBlockB = targetBlock;
    }

    async processRangeA(fromBlock, toBlock) {
        try {
            const logs = await this.bridgeLock.queryFilter(this.bridgeLock.filters.Locked(), fromBlock, toBlock);
            for (const log of logs) {
                await this.handleLocked(log);
            }
        } catch (e) {
            console.error(`Error querying Chain A logs (${fromBlock}-${toBlock}):`, e.message);
        }
    }

    async processRangeB(fromBlock, toBlock) {
        try {
            // Burned Events
            const burnedLogs = await this.bridgeMint.queryFilter(this.bridgeMint.filters.Burned(), fromBlock, toBlock);
            for (const log of burnedLogs) {
                await this.handleBurned(log);
            }

            // Governance Events
            const govLogs = await this.governanceVoting.queryFilter(this.governanceVoting.filters.ProposalPassed(), fromBlock, toBlock);
            for (const log of govLogs) {
                await this.handleProposalPassed(log);
            }
        } catch (e) {
            console.error(`Error querying Chain B logs (${fromBlock}-${toBlock}):`, e.message);
        }
    }

    async handleLocked(event) {
        const { user, amount, nonce } = event.args;
        const chainId = parseInt(chainADeployments.ChainId);
        const nonceKey = `LOCK-${nonce.toString()}`;

        console.log(`[Locked] User=${user}, Amount=${amount}, Nonce=${nonce}`);

        if (await this.db.hasProcessed(chainId, nonceKey)) {
            console.log(`  -> Already processed`);
            return;
        }

        try {
            console.log(`  -> Minting on Chain B...`);
            const tx = await this.bridgeMint.mintWrapped(user, amount, nonce);
            console.log(`  -> Mint tx sent: ${tx.hash}`);
            await tx.wait(1);
            console.log(`  -> Mint confirmed`);

            await this.db.markProcessed(chainId, nonceKey, tx.hash);
        } catch (e) {
            const errorMsg = e.message || e;
            if (errorMsg.includes("Nonce already processed")) {
                console.log(`  -> Contract: Nonce already processed (idempotent), marking in DB`);
                await this.db.markProcessed(chainId, nonceKey, "IDEMPOTENT");
            } else {
                console.error(`  -> Error minting:`, errorMsg);
            }
        }
    }

    async handleBurned(event) {
        const { user, amount, nonce } = event.args;
        const chainId = parseInt(chainBDeployments.ChainId);
        const nonceKey = `BURN-${nonce.toString()}`;

        console.log(`[Burned] User=${user}, Amount=${amount}, Nonce=${nonce}`);

        if (await this.db.hasProcessed(chainId, nonceKey)) {
            console.log(`  -> Already processed`);
            return;
        }

        try {
            console.log(`  -> Unlocking on Chain A...`);
            const tx = await this.bridgeLock.unlock(user, amount, nonce);
            console.log(`  -> Unlock tx sent: ${tx.hash}`);
            await tx.wait(1);
            console.log(`  -> Unlock confirmed`);

            await this.db.markProcessed(chainId, nonceKey, tx.hash);
        } catch (e) {
            const errorMsg = e.message || e;
            if (errorMsg.includes("Nonce already processed")) {
                console.log(`  -> Contract: Nonce already processed (idempotent), marking in DB`);
                await this.db.markProcessed(chainId, nonceKey, "IDEMPOTENT");
            } else {
                console.error(`  -> Error unlocking:`, errorMsg);
            }
        }
    }

    async handleProposalPassed(event) {
        const { proposalId, data } = event.args;
        const chainId = parseInt(chainBDeployments.ChainId);
        const uniqueId = `GOV-${proposalId.toString()}`;

        console.log(`[ProposalPassed] ID=${proposalId}`);

        if (await this.db.hasProcessed(chainId, uniqueId)) {
            console.log(`  -> Already processed`);
            return;
        }

        try {
            console.log(`  -> Executing emergency pause on Chain A...`);
            const tx = await this.governanceEmergency.pauseBridge();
            console.log(`  -> Pause tx sent: ${tx.hash}`);
            await tx.wait(1);
            console.log(`  -> Pause confirmed`);

            await this.db.markProcessed(chainId, uniqueId, tx.hash);
        } catch (e) {
            console.error(`  -> Error pausing:`, e.message);
        }
    }
}

// Start relayer
const relayer = new Relayer();
relayer.start().catch(console.error);

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log("\nShutting down relayer...");
    if (relayer.db) {
        relayer.db.close();
    }
    process.exit(0);
});

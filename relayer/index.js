require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const Database = require('./database');

const DB_PATH = process.env.DB_PATH || './data/processed_nonces.db';
const CONFIRMATION_DEPTH = parseInt(process.env.CONFIRMATION_DEPTH) || 3;
const POLLING_INTERVAL = 2000; // 2 seconds

// Load Deployments
const DEPLOYMENTS_DIR = process.env.DEPLOYMENTS_DIR || '.';
const chainADeployments = require(path.join(DEPLOYMENTS_DIR, 'deployments_chain_a.json'));
const chainBDeployments = require(path.join(DEPLOYMENTS_DIR, 'deployments_chain_b.json'));

// ABIs
const BridgeLockABI = [
    "event Locked(address indexed user, uint256 amount, uint256 nonce)",
    "function temp() view returns (uint256)", // Dummy
    "function unlock(address user, uint256 amount, uint256 nonce)",
    "function pause()"
];

const BridgeMintABI = [
    "event Burned(address indexed user, uint256 amount, uint256 nonce)",
    "function mintWrapped(address user, uint256 amount, uint256 nonce)"
];

const GovernanceVotingABI = [
    "event ProposalPassed(uint256 proposalId, bytes data)"
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
        this.walletA = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, this.providerA);
        this.walletB = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, this.providerB);

        // Contracts
        this.bridgeLock = new ethers.Contract(chainADeployments.BridgeLock, BridgeLockABI, this.walletA);
        this.governanceEmergency = new ethers.Contract(chainADeployments.GovernanceEmergency, GovernanceEmergencyABI, this.walletA);

        this.bridgeMint = new ethers.Contract(chainBDeployments.BridgeMint, BridgeMintABI, this.walletB);
        this.governanceVoting = new ethers.Contract(chainBDeployments.GovernanceVoting, GovernanceVotingABI, this.providerB); // Only need to listen

        this.running = false;
    }

    async start() {
        console.log("Starting Relayer Service...");
        this.running = true;

        // Process past events first (Recovery)
        await this.recover();

        // Listen for new events
        // Note: ethers v6 "on" listener might miss events during network issues or if script restarts. 
        // Polling is often more robust for a simple relayer, especially for confirmation depth.
        // But let's use event listeners combined with a block tracking mechanism/polling for robustness if needed.
        // For this task, standard listeners or polling loop.
        // To strictly adhere to "waits for set number of block confirmations", listening to "block" and checking past logs is best.

        this.providerA.on("block", (blockNumber) => this.processChainA(blockNumber));
        this.providerB.on("block", (blockNumber) => this.processChainB(blockNumber));

        console.log(`Listening for events on Chain A (${chainADeployments.ChainId}) and Chain B (${chainBDeployments.ChainId})`);
    }

    async recover() {
        // Simple recovery: Check last X blocks or from a known start block.
        // For this assignment, we'll scan from deployment block (effectively 0 or earlier).
        // In prod, we'd store last processed block.
        console.log("Recovering past events...");

        const currentBlockA = await this.providerA.getBlockNumber();
        const currentBlockB = await this.providerB.getBlockNumber();

        // Scan Chain A
        await this.processRangeA(0, currentBlockA);

        // Scan Chain B
        await this.processRangeB(0, currentBlockB);

        console.log("Recovery complete.");
    }

    async processChainA(currentBlock) {
        // Process events that are confirmed (currentBlock - CONFIRMATION_DEPTH)
        const targetBlock = currentBlock - CONFIRMATION_DEPTH;
        if (targetBlock < 0) return;

        await this.processRangeA(targetBlock, targetBlock);
    }

    async processChainB(currentBlock) {
        const targetBlock = currentBlock - CONFIRMATION_DEPTH;
        if (targetBlock < 0) return;

        await this.processRangeB(targetBlock, targetBlock);
    }

    async processRangeA(fromBlock, toBlock) {
        try {
            const logs = await this.bridgeLock.queryFilter(this.bridgeLock.filters.Locked(), fromBlock, toBlock);
            for (const log of logs) {
                await this.handleLocked(log);
            }
        } catch (e) {
            console.error("Error querying Chain A:", e);
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
            console.error("Error querying Chain B:", e);
        }
    }

    async handleLocked(event) {
        const { user, amount, nonce } = event.args;
        const chainId = chainADeployments.ChainId; // Source Chain ID (Logic: event from Chain A, nonce processed on Chain B)
        // Actually, we should store processing status based on the nonce ID universally or per source.

        console.log(`Detected Locked event: User=${user}, Amount=${amount}, Nonce=${nonce}`);

        if (await this.db.hasProcessed(chainId, nonce.toString())) {
            console.log(`Nonce ${nonce} from Chain A already processed.`);
            return;
        }

        try {
            console.log("Minting on Chain B...");
            const tx = await this.bridgeMint.mintWrapped(user, amount, nonce);
            console.log(`Mint tx sent: ${tx.hash}`);
            await tx.wait(1);
            console.log("Mint confirmed.");

            await this.db.markProcessed(chainId, nonce.toString(), tx.hash);
        } catch (e) {
            console.error("Error minting:", e);
            // If error is "Nonce already processed" from contract, valid to mark as processed in DB.
        }
    }

    async handleBurned(event) {
        const { user, amount, nonce } = event.args;
        const chainId = chainBDeployments.ChainId;

        console.log(`Detected Burned event: User=${user}, Amount=${amount}, Nonce=${nonce}`);

        if (await this.db.hasProcessed(chainId, nonce.toString())) {
            console.log(`Nonce ${nonce} from Chain B already processed.`);
            return;
        }

        try {
            console.log("Unlocking on Chain A...");
            const tx = await this.bridgeLock.unlock(user, amount, nonce);
            console.log(`Unlock tx sent: ${tx.hash}`);
            await tx.wait(1);
            console.log("Unlock confirmed.");

            await this.db.markProcessed(chainId, nonce.toString(), tx.hash);
        } catch (e) {
            console.error("Error unlocking:", e);
        }
    }

    async handleProposalPassed(event) {
        const { proposalId, data } = event.args;
        const chainId = chainBDeployments.ChainId;
        const uniqueId = `GOV-${proposalId}`; // Special nonce format for governance

        console.log(`Detected ProposalPassed: ID=${proposalId}`);

        if (await this.db.hasProcessed(chainId, uniqueId)) {
            console.log(`Proposal ${proposalId} already processed.`);
            return;
        }

        try {
            console.log("Executing Emergency Pause on Chain A...");
            // Decode data if needed, or just assume pause for now as per req
            const tx = await this.governanceEmergency.pauseBridge();
            console.log(`Pause tx sent: ${tx.hash}`);
            await tx.wait(1);
            console.log("Pause confirmed.");

            await this.db.markProcessed(chainId, uniqueId, tx.hash);
        } catch (e) {
            console.error("Error pausing:", e);
        }
    }
}

const relayer = new Relayer();
relayer.start().catch(console.error);

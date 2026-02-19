const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Configuration
const CHAIN_A_RPC = "http://127.0.0.1:8545";
const CHAIN_B_RPC = "http://127.0.0.1:9545";
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
    console.log("Starting End-to-End Integration Test...");

    const providerA = new ethers.JsonRpcProvider(CHAIN_A_RPC);
    const providerB = new ethers.JsonRpcProvider(CHAIN_B_RPC);
    const walletA = new ethers.Wallet(PRIVATE_KEY, providerA);
    const walletB = new ethers.Wallet(PRIVATE_KEY, providerB);

    // Load Deployments
    // Assuming script run from root
    const deploymentsA = require("../relayer/deployments_chain_a.json");
    const deploymentsB = require("../relayer/deployments_chain_b.json");

    // Load ABIs (Simulated or loaded from artifacts)
    const vaultToken = new ethers.Contract(deploymentsA.VaultToken, [
        "function approve(address spender, uint256 amount)",
        "function balanceOf(address account) view returns (uint256)"
    ], walletA);

    const bridgeLock = new ethers.Contract(deploymentsA.BridgeLock, [
        "function lockTokens(uint256 amount)",
        "function paused() view returns (bool)"
    ], walletA);

    const wrappedToken = new ethers.Contract(deploymentsB.WrappedVaultToken, [
        "function balanceOf(address account) view returns (uint256)",
        "function approve(address spender, uint256 amount)"
    ], walletB);

    const bridgeMint = new ethers.Contract(deploymentsB.BridgeMint, [
        "function burn(uint256 amount)"
    ], walletB);

    const governanceVoting = new ethers.Contract(deploymentsB.GovernanceVoting, [
        "function createProposal(string description)",
        "function vote(uint256 proposalId)",
        "function execute(uint256 proposalId)"
    ], walletB);

    // --- Step 1: Lock and Mint ---
    console.log("Step 1: Testing Lock (Chain A) -> Mint (Chain B)");
    const amount = ethers.parseEther("10");

    const balanceA_Before = await vaultToken.balanceOf(walletA.address);
    console.log("Balance A Before:", ethers.formatEther(balanceA_Before));

    console.log("Approving and Locking...");
    await (await vaultToken.approve(deploymentsA.BridgeLock, amount)).wait();
    await (await bridgeLock.lockTokens(amount)).wait();

    console.log("Waiting for Relayer (approx 15s)...");
    await new Promise(resolve => setTimeout(resolve, 15000));

    const balanceB = await wrappedToken.balanceOf(walletB.address);
    console.log("Balance B After Mint:", ethers.formatEther(balanceB));

    if (balanceB < amount) throw new Error("Minting failed or timed out");
    console.log("Lock -> Mint Successful!");

    // --- Step 2: Burn and Unlock ---
    console.log("\nStep 2: Testing Burn (Chain B) -> Unlock (Chain A)");
    const burnAmount = ethers.parseEther("5");

    console.log("Approving and Burning...");
    await (await wrappedToken.approve(deploymentsB.BridgeMint, burnAmount)).wait();
    await (await bridgeMint.burn(burnAmount)).wait();

    console.log("Waiting for Relayer (approx 15s)...");
    await new Promise(resolve => setTimeout(resolve, 15000));

    const balanceA_After = await vaultToken.balanceOf(walletA.address);
    console.log("Balance A After Unlock:", ethers.formatEther(balanceA_After));

    if (balanceA_After <= balanceA_Before - amount) throw new Error("Unlock failed or timed out");
    console.log("Burn -> Unlock Successful!");

    // --- Step 3: Governance Pause ---
    console.log("\nStep 3: Testing Governance Vote -> Pause");

    console.log("Creating Proposal...");
    await (await governanceVoting.createProposal("Emergency Pause")).wait();

    console.log("Voting...");
    await (await governanceVoting.vote(1)).wait();

    console.log("Executing Proposal...");
    await (await governanceVoting.execute(1)).wait();

    console.log("Waiting for Relayer to Pause Bridge (approx 15s)...");
    await new Promise(resolve => setTimeout(resolve, 15000));

    const isPaused = await bridgeLock.paused();
    console.log("Bridge Paused State:", isPaused);

    if (!isPaused) throw new Error("Bridge pause failed");
    console.log("Governance Pause Successful!");

}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

const { ethers } = require("ethers");
const { execSync } = require("child_process");
const fs = require("fs");

const CHAIN_A_RPC = "http://127.0.0.1:8545";
const CHAIN_B_RPC = "http://127.0.0.1:9545";
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function main() {
    console.log("Starting Recovery Test...");

    // 1. Stop Relayer
    console.log("Stopping Relayer...");
    try {
        execSync("docker-compose stop relayer", { stdio: 'inherit' });
    } catch (e) {
        console.warn("Could not stop relayer. Proceeding.");
    }

    // 2. Perform Action (Lock)
    const providerA = new ethers.JsonRpcProvider(CHAIN_A_RPC);
    const walletA = new ethers.Wallet(PRIVATE_KEY, providerA);
    const deploymentsA = require("../relayer/deployments_chain_a.json");

    const vaultToken = new ethers.Contract(deploymentsA.VaultToken, [
        "function approve(address spender, uint256 amount)"
    ], walletA);
    const bridgeLock = new ethers.Contract(deploymentsA.BridgeLock, [
        "function lockTokens(uint256 amount)"
    ], walletA);

    console.log("Locking tokens while relayer is DOWN...");
    const amount = ethers.parseEther("2");
    await (await vaultToken.approve(deploymentsA.BridgeLock, amount)).wait();
    await (await bridgeLock.lockTokens(amount)).wait();
    console.log("Tokens Locked.");

    // 3. Start Relayer
    console.log("Restarting Relayer...");
    execSync("docker-compose start relayer", { stdio: 'inherit' });

    console.log("Waiting for recovery processing (approx 20s)...");
    await new Promise(resolve => setTimeout(resolve, 20000));

    // 4. Verify Mint
    const providerB = new ethers.JsonRpcProvider(CHAIN_B_RPC);
    const walletB = new ethers.Wallet(PRIVATE_KEY, providerB);
    const deploymentsB = require("../relayer/deployments_chain_b.json");

    const wrappedToken = new ethers.Contract(deploymentsB.WrappedVaultToken, [
        "function balanceOf(address account) view returns (uint256)"
    ], walletB);

    const balance = await wrappedToken.balanceOf(walletB.address);
    // console.log("Current Wrapped Balance:", ethers.formatEther(balance));

    if (balance > 0) {
        console.log("Recovery Successful: Tokens minted after restart.");
    } else {
        throw new Error("Recovery Failed: No tokens minted.");
    }
}

main().catch(console.error);

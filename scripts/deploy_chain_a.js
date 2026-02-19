const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts on Chain A with account:", deployer.address);

    // 1. Deploy VaultToken
    const VaultToken = await hre.ethers.getContractFactory("VaultToken");
    const vaultToken = await VaultToken.deploy();
    await vaultToken.waitForDeployment();
    const vaultTokenAddress = await vaultToken.getAddress();
    console.log("VaultToken deployed to:", vaultTokenAddress);

    // 2. Deploy BridgeLock
    const BridgeLock = await hre.ethers.getContractFactory("BridgeLock");
    const bridgeLock = await BridgeLock.deploy(vaultTokenAddress);
    await bridgeLock.waitForDeployment();
    const bridgeLockAddress = await bridgeLock.getAddress();
    console.log("BridgeLock deployed to:", bridgeLockAddress);

    // 3. Deploy GovernanceEmergency
    const GovernanceEmergency = await hre.ethers.getContractFactory("GovernanceEmergency");
    const governanceEmergency = await GovernanceEmergency.deploy(bridgeLockAddress);
    await governanceEmergency.waitForDeployment();
    const governanceEmergencyAddress = await governanceEmergency.getAddress();
    console.log("GovernanceEmergency deployed to:", governanceEmergencyAddress);

    // 4. Setup Roles
    const RELAYER_ROLE = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("RELAYER_ROLE"));

    await bridgeLock.grantRole(RELAYER_ROLE, deployer.address);
    await governanceEmergency.grantRole(RELAYER_ROLE, deployer.address);

    await bridgeLock.grantRole(RELAYER_ROLE, governanceEmergencyAddress);
    console.log("Roles granted.");

    // 5. Save Deployment Info
    const deploymentInfo = {
        VaultToken: vaultTokenAddress,
        BridgeLock: bridgeLockAddress,
        GovernanceEmergency: governanceEmergencyAddress,
        ChainId: (await hre.ethers.provider.getNetwork()).chainId.toString()
    };

    const deploymentPath = path.join(__dirname, "../relayer/deployments_chain_a.json");
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("Deployment info saved to:", deploymentPath);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

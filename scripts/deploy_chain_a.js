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

    // Grant relayer role to deployer (for testing)
    await bridgeLock.grantRole(RELAYER_ROLE, deployer.address);
    console.log("Granted RELAYER_ROLE to deployer on BridgeLock");

    // Grant relayer role to governanceEmergency contract
    await governanceEmergency.grantRole(RELAYER_ROLE, deployer.address);
    console.log("Granted RELAYER_ROLE to deployer on GovernanceEmergency");

    // Grant relayer role for emergency actions
    await bridgeLock.grantRole(RELAYER_ROLE, governanceEmergencyAddress);
    console.log("Granted RELAYER_ROLE to GovernanceEmergency contract on BridgeLock");

    console.log("All roles granted successfully.");

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

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

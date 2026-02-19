const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts on Chain B with account:", deployer.address);

    // 1. Deploy WrappedVaultToken
    const WrappedVaultToken = await hre.ethers.getContractFactory("WrappedVaultToken");
    const wrappedToken = await WrappedVaultToken.deploy();
    await wrappedToken.waitForDeployment();
    const wrappedTokenAddress = await wrappedToken.getAddress();
    console.log("WrappedVaultToken deployed to:", wrappedTokenAddress);

    // 2. Deploy BridgeMint
    const BridgeMint = await hre.ethers.getContractFactory("BridgeMint");
    const bridgeMint = await BridgeMint.deploy(wrappedTokenAddress);
    await bridgeMint.waitForDeployment();
    const bridgeMintAddress = await bridgeMint.getAddress();
    console.log("BridgeMint deployed to:", bridgeMintAddress);

    // 3. Deploy GovernanceVoting
    const GovernanceVoting = await hre.ethers.getContractFactory("GovernanceVoting");
    const governanceVoting = await GovernanceVoting.deploy(wrappedTokenAddress);
    await governanceVoting.waitForDeployment();
    const governanceVotingAddress = await governanceVoting.getAddress();
    console.log("GovernanceVoting deployed to:", governanceVotingAddress);

    // 4. Setup Roles
    const MINTER_ROLE = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("MINTER_ROLE"));
    const RELAYER_ROLE = hre.ethers.keccak256(hre.ethers.toUtf8Bytes("RELAYER_ROLE"));

    await wrappedToken.grantRole(MINTER_ROLE, bridgeMintAddress);

    await bridgeMint.grantRole(RELAYER_ROLE, deployer.address);
    console.log("Roles granted.");

    // 5. Save Deployment Info
    const deploymentInfo = {
        WrappedVaultToken: wrappedTokenAddress,
        BridgeMint: bridgeMintAddress,
        GovernanceVoting: governanceVotingAddress,
        ChainId: (await hre.ethers.provider.getNetwork()).chainId.toString()
    };

    const deploymentPath = path.join(__dirname, "../relayer/deployments_chain_b.json");
    fs.writeFileSync(deploymentPath, JSON.stringify(deploymentInfo, null, 2));
    console.log("Deployment info saved to:", deploymentPath);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

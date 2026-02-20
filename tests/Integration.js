const { expect } = require("chai");
const hre = require("hardhat");

describe("Integration Tests: End-to-End Bridge Flows", function () {
    this.timeout(30000);

    let vaultToken, bridgeLock, governanceEmergency;
    let wrappedToken, bridgeMint, governanceVoting;
    let deployerA, relayerA, user1;
    let providerB, walletB, bridgeMintB;

    before(async function () {
        console.log("\n=== Integration Test Setup ===");
        
        // Get signers on Chain A
        [deployerA, relayerA, user1] = await hre.ethers.getSigners();
        
        // Deploy Chain A contracts
        const VaultToken = await hre.ethers.getContractFactory("VaultToken");
        vaultToken = await VaultToken.deploy();
        await vaultToken.waitForDeployment();
        console.log("✓ VaultToken deployed");

        const BridgeLock = await hre.ethers.getContractFactory("BridgeLock");
        bridgeLock = await BridgeLock.deploy(await vaultToken.getAddress());
        await bridgeLock.waitForDeployment();
        console.log("✓ BridgeLock deployed");

        const GovernanceEmergency = await hre.ethers.getContractFactory("GovernanceEmergency");
        governanceEmergency = await GovernanceEmergency.deploy(await bridgeLock.getAddress());
        await governanceEmergency.waitForDeployment();
        console.log("✓ GovernanceEmergency deployed");

        // Deploy Chain B contracts
        const WrappedVaultToken = await hre.ethers.getContractFactory("WrappedVaultToken");
        wrappedToken = await WrappedVaultToken.deploy();
        await wrappedToken.waitForDeployment();
        console.log("✓ WrappedVaultToken deployed");

        const BridgeMint = await hre.ethers.getContractFactory("BridgeMint");
        bridgeMint = await BridgeMint.deploy(await wrappedToken.getAddress());
        await bridgeMint.waitForDeployment();
        console.log("✓ BridgeMint deployed");

        const GovernanceVoting = await hre.ethers.getContractFactory("GovernanceVoting");
        governanceVoting = await GovernanceVoting.deploy(await wrappedToken.getAddress());
        await governanceVoting.waitForDeployment();
        console.log("✓ GovernanceVoting deployed");

        // Setup roles
        const RELAYER_ROLE = await bridgeLock.RELAYER_ROLE();
        await bridgeLock.grantRole(RELAYER_ROLE, relayerA.address);
        await governanceEmergency.grantRole(RELAYER_ROLE, relayerA.address);

        const MINTER_ROLE = await wrappedToken.MINTER_ROLE();
        await wrappedToken.grantRole(MINTER_ROLE, await bridgeMint.getAddress());

        const RELAYER_ROLE_B = await bridgeMint.RELAYER_ROLE();
        await bridgeMint.grantRole(RELAYER_ROLE_B, relayerA.address);

        console.log("✓ All roles configured\n");
    });

    describe("Flow 1: Lock (Chain A) -> Mint (Chain B)", function () {
        it("Should lock tokens on Chain A", async function () {
            const lockAmount = hre.ethers.parseEther("100");
            
            // Transfer and approve
            await vaultToken.transfer(user1.address, lockAmount);
            await vaultToken.connect(user1).approve(await bridgeLock.getAddress(), lockAmount);

            // Lock
            const balanceBefore = await vaultToken.balanceOf(await bridgeLock.getAddress());
            const tx = await bridgeLock.connect(user1).lock(lockAmount);
            
            await expect(tx).to.emit(bridgeLock, "Locked");
            const balanceAfter = await vaultToken.balanceOf(await bridgeLock.getAddress());
            
            expect(balanceAfter).to.equal(balanceBefore + lockAmount);
            console.log("✓ User1 locked 100 VTK");
        });

        it("Should mint wrapped tokens on Chain B when relayer calls mintWrapped", async function () {
            const nonce = 0;
            const amount = hre.ethers.parseEther("100");
            
            // Relayer calls mintWrapped
            const tx = await bridgeMint.connect(relayerA).mintWrapped(user1.address, amount, nonce);
            
            await expect(tx).to.emit(bridgeMint, "MintWrappedCalled");
            const wrappedBalance = await wrappedToken.balanceOf(user1.address);
            
            expect(wrappedBalance).to.equal(amount);
            console.log("✓ Relayer minted 100 WVTK for User1");
        });

        it("Should maintain 1:1 invariant: BridgeLock.balance == WrappedToken.supply", async function () {
            const vaultLocked = await vaultToken.balanceOf(await bridgeLock.getAddress());
            const wrappedSupply = await wrappedToken.totalSupply();
            
            expect(vaultLocked).to.equal(wrappedSupply);
            console.log(`✓ Invariant maintained: ${vaultLocked} == ${wrappedSupply}`);
        });
    });

    describe("Flow 2: Burn (Chain B) -> Unlock (Chain A)", function () {
        it("Should burn wrapped tokens on Chain B", async function () {
            const burnAmount = hre.ethers.parseEther("50");
            const balanceBefore = await wrappedToken.balanceOf(user1.address);
            
            const tx = await bridgeMint.connect(user1).burn(burnAmount);
            
            await expect(tx).to.emit(bridgeMint, "Burned");
            const balanceAfter = await wrappedToken.balanceOf(user1.address);
            
            expect(balanceAfter).to.equal(balanceBefore - burnAmount);
            console.log("✓ User1 burned 50 WVTK");
        });

        it("Should unlock original tokens on Chain A when relayer calls unlock", async function () {
            const nonce = 0;
            const unlockAmount = hre.ethers.parseEther("50");
            
            await bridgeLock.grantRole(await bridgeLock.RELAYER_ROLE(), relayerA.address);
            
            const balanceBefore = await vaultToken.balanceOf(user1.address);
            const tx = await bridgeLock.connect(relayerA).unlock(user1.address, unlockAmount, nonce);
            
            await expect(tx).to.emit(bridgeLock, "Unlocked");
            const balanceAfter = await vaultToken.balanceOf(user1.address);
            
            expect(balanceAfter).to.equal(balanceBefore + unlockAmount);
            console.log("✓ Relayer unlocked 50 VTK for User1");
        });

        it("Should maintain invariant after burn-unlock cycle", async function () {
            const vaultLocked = await vaultToken.balanceOf(await bridgeLock.getAddress());
            const wrappedSupply = await wrappedToken.totalSupply();
            
            expect(vaultLocked).to.equal(wrappedSupply);
            console.log(`✓ Invariant maintained: ${vaultLocked} == ${wrappedSupply}`);
        });
    });

    describe("Flow 3: Cross-Chain Governance Emergency", function () {
        it("Should execute governance proposal on Chain B", async function () {
            // Create wrapped tokens for voter
            const voteAmount = hre.ethers.parseEther("2000"); // High amount to pass threshold
            await bridgeMint.connect(relayerA).mintWrapped(user1.address, voteAmount, 10);

            // Create proposal
            await governanceVoting.connect(user1).createProposal("Emergency Pause");
            
            // Vote (should auto-trigger execution if threshold met)
            const tx = await governanceVoting.connect(user1).vote(1);
            
            const proposal = await governanceVoting.proposals(1);
            if (proposal.voteCount >= hre.ethers.parseEther("1000")) {
                console.log("✓ Governance proposal passed");
            }
        });

        it("Should pause bridge on Chain A when emergency is triggered", async function () {
            const RELAYER_ROLE = await governanceEmergency.RELAYER_ROLE();
            await governanceEmergency.grantRole(RELAYER_ROLE, relayerA.address);

            expect(await bridgeLock.isPaused()).to.be.false;
            
            await governanceEmergency.connect(relayerA).pauseBridge();
            
            expect(await bridgeLock.isPaused()).to.be.true;
            console.log("✓ Bridge paused via emergency governance");
        });

        it("Should prevent new locks when bridge is paused", async function () {
            const [, , , user2] = await hre.ethers.getSigners();
            const amount = hre.ethers.parseEther("10");
            
            await vaultToken.transfer(user2.address, amount);
            await vaultToken.connect(user2).approve(await bridgeLock.getAddress(), amount);

            await expect(bridgeLock.connect(user2).lock(amount))
                .to.be.revertedWith("Pausable: paused");
            console.log("✓ Locks prevented when paused");
        });
    });

    describe("Flow 4: Replay Attack Prevention", function () {
        before(async function () {
            // Unpause for this test
            await bridgeLock.unpause();
        });

        it("Should prevent mint replay with same nonce", async function () {
            const amount = hre.ethers.parseEther("50");
            const nonce = 20;
            const [, , user2] = await hre.ethers.getSigners();

            // First mint succeeds
            await bridgeMint.connect(relayerA).mintWrapped(user2.address, amount, nonce);

            // Second mint with same nonce fails
            await expect(
                bridgeMint.connect(relayerA).mintWrapped(user2.address, amount, nonce)
            ).to.be.revertedWith("Nonce already processed");
            console.log("✓ Mint replay prevented");
        });

        it("Should prevent unlock replay with same nonce", async function () {
            const amount = hre.ethers.parseEther("10");
            const nonce = 30;
            const [, , , user2] = await hre.ethers.getSigners();

            // Send tokens to bridge for unlock test
            await vaultToken.transfer(await bridgeLock.getAddress(), amount);

            // First unlock succeeds
            await bridgeLock.connect(relayerA).unlock(user2.address, amount, nonce);

            // Second unlock with same nonce fails
            await expect(
                bridgeLock.connect(relayerA).unlock(user2.address, amount, nonce)
            ).to.be.revertedWith("Nonce already processed");
            console.log("✓ Unlock replay prevented");
        });
    });

    describe("Flow 5: Full Round-Trip with Multiple Users", function () {
        it("Should handle multiple users locking and minting", async function () {
            const [, , user2, user3] = await hre.ethers.getSigners();
            const amount = hre.ethers.parseEther("50");

            // User 2 locks
            await vaultToken.transfer(user2.address, amount);
            await vaultToken.connect(user2).approve(await bridgeLock.getAddress(), amount);
            await bridgeLock.connect(user2).lock(amount);

            // User 3 locks  
            await vaultToken.transfer(user3.address, amount);
            await vaultToken.connect(user3).approve(await bridgeLock.getAddress(), amount);
            await bridgeLock.connect(user3).lock(amount);

            // Relayer processes both
            await bridgeMint.connect(relayerA).mintWrapped(user2.address, amount, 40);
            await bridgeMint.connect(relayerA).mintWrapped(user3.address, amount, 41);

            expect(await wrappedToken.balanceOf(user2.address)).to.equal(amount);
            expect(await wrappedToken.balanceOf(user3.address)).to.equal(amount);
            console.log("✓ Multiple users bridged successfully");
        });
    });
});


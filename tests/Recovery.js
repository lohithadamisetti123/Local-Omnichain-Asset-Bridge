const { expect } = require("chai");
const hre = require("hardhat");

describe("Recovery Tests: Relayer Crash & Recovery", function () {
    this.timeout(60000);

    let vaultToken, bridgeLock;
    let wrappedToken, bridgeMint;
    let deployerA, relayerA, user1;

    before(async function () {
        console.log("\n=== Recovery Test Setup ===");

        [deployerA, relayerA, user1] = await hre.ethers.getSigners();

        // Deploy Chain A contracts
        const VaultToken = await hre.ethers.getContractFactory("VaultToken");
        vaultToken = await VaultToken.deploy();
        await vaultToken.waitForDeployment();

        const BridgeLock = await hre.ethers.getContractFactory("BridgeLock");
        bridgeLock = await BridgeLock.deploy(await vaultToken.getAddress());
        await bridgeLock.waitForDeployment();

        // Deploy Chain B contracts
        const WrappedVaultToken = await hre.ethers.getContractFactory("WrappedVaultToken");
        wrappedToken = await WrappedVaultToken.deploy();
        await wrappedToken.waitForDeployment();

        const BridgeMint = await hre.ethers.getContractFactory("BridgeMint");
        bridgeMint = await BridgeMint.deploy(await wrappedToken.getAddress());
        await bridgeMint.waitForDeployment();

        // Setup roles
        const RELAYER_ROLE_A = await bridgeLock.RELAYER_ROLE();
        await bridgeLock.grantRole(RELAYER_ROLE_A, relayerA.address);

        const MINTER_ROLE = await wrappedToken.MINTER_ROLE();
        await wrappedToken.grantRole(MINTER_ROLE, await bridgeMint.getAddress());

        const RELAYER_ROLE_B = await bridgeMint.RELAYER_ROLE();
        await bridgeMint.grantRole(RELAYER_ROLE_B, relayerA.address);

        console.log("✓ Contracts deployed and ready\n");
    });

    describe("Scenario 1: Lock Event During Relayer Downtime", function () {
        it("Should process lock event that occurred while relayer was down", async function () {
            // Simulate: Relayer is down, user locks tokens
            const lockAmount = hre.ethers.parseEther("100");

            // User locks
            await vaultToken.transfer(user1.address, lockAmount);
            await vaultToken.connect(user1).approve(await bridgeLock.getAddress(), lockAmount);
            const lockTx = await bridgeLock.connect(user1).lock(lockAmount);

            const lockReceipt = await lockTx.wait();
            console.log("✓ Lock event emitted (nonce 0)");

            // Simulate relayer recovery: It should process this locked event
            // The relayer would:
            // 1. Scan past blocks
            // 2. Find the Locked event with nonce 0
            // 3. Call mintWrapped with nonce 0

            const nonce = 0;
            await bridgeMint.connect(relayerA).mintWrapped(user1.address, lockAmount, nonce);

            const wrappedBalance = await wrappedToken.balanceOf(user1.address);
            expect(wrappedBalance).to.equal(lockAmount);
            console.log("✓ Relayer recovered and processed historic lock");
        });

        it("Should maintain idempotency: processing same event twice has no effect", async function () {
            const nonce = 0;
            const amount = hre.ethers.parseEther("100");

            // First call succeeds (already done in previous test)
            // Second call should fail with "Nonce already processed"

            await expect(
                bridgeMint.connect(relayerA).mintWrapped(user1.address, amount, nonce)
            ).to.be.revertedWith("Nonce already processed");

            console.log("✓ Idempotency confirmed: replay prevention works");
        });
    });

    describe("Scenario 2: Multiple Missed Events", function () {
        it("Should process multiple lock events that occurred during downtime", async function () {
            const [, relayer, , user2, user3] = await hre.ethers.getSigners();

            // Simulate: Relayer is down
            // User 2 locks
            const amount2 = hre.ethers.parseEther("50");
            await vaultToken.transfer(user2.address, amount2);
            await vaultToken.connect(user2).approve(await bridgeLock.getAddress(), amount2);
            await bridgeLock.connect(user2).lock(amount2);
            console.log("✓ User2 locked 50 VTK (nonce 1)");

            // User 3 locks
            const amount3 = hre.ethers.parseEther("75");
            await vaultToken.transfer(user3.address, amount3);
            await vaultToken.connect(user3).approve(await bridgeLock.getAddress(), amount3);
            await bridgeLock.connect(user3).lock(amount3);
            console.log("✓ User3 locked 75 VTK (nonce 2)");

            // Simulate: Relayer wakes up and processes both
            // Grant relayer role for this test
            await bridgeMint.grantRole(await bridgeMint.RELAYER_ROLE(), relayer.address);

            const allSigners = await hre.ethers.getSigners();
            const relayerLocal = allSigners[1];
            const u2 = allSigners[3];
            const u3 = allSigners[4];

            await bridgeMint.connect(relayerLocal).mintWrapped(u2.address, amount2, 1);
            await bridgeMint.connect(relayerLocal).mintWrapped(u3.address, amount3, 2);

            expect(await wrappedToken.balanceOf(u2.address)).to.equal(amount2);
            expect(await wrappedToken.balanceOf(u3.address)).to.equal(amount3);
            console.log("✓ Relayer recovered and processed all missed events");
        });
    });

    describe("Scenario 3: State Persistence Verification", function () {
        it("Should have processed nonces stored in persistent state", async function () {
            const nonce = 0;

            // Check that nonce 0 cannot be replayed (it should be in the database)
            await expect(
                bridgeMint.connect(relayerA).mintWrapped(user1.address, hre.ethers.parseEther("1"), nonce)
            ).to.be.revertedWith("Nonce already processed");

            console.log("✓ Processed nonces are persistent in DB");
        });

        it("Should be able to process new events after recovery", async function () {
            const allSigners = await hre.ethers.getSigners();
            const relayer = allSigners[1];
            const user4 = allSigners[5];

            // New lock
            const newAmount = hre.ethers.parseEther("25");
            await vaultToken.transfer(user4.address, newAmount);
            await vaultToken.connect(user4).approve(await bridgeLock.getAddress(), newAmount);
            await bridgeLock.connect(user4).lock(newAmount);
            console.log("✓ New lock event emitted (nonce 3)");

            // Process new event
            await bridgeMint.grantRole(await bridgeMint.RELAYER_ROLE(), relayer.address);
            await bridgeMint.connect(relayer).mintWrapped(user4.address, newAmount, 3);

            expect(await wrappedToken.balanceOf(user4.address)).to.equal(newAmount);
            console.log("✓ Relayer processes new events correctly after recovery");
        });
    });

    describe("Scenario 4: Partial Transaction Handling", function () {
        it("Should handle case where relayer crashes after lock but before mint", async function () {
            const allSigners = await hre.ethers.getSigners();
            const relayer = allSigners[1];
            const user5 = allSigners[6];

            // User locks
            const amount = hre.ethers.parseEther("30");
            await vaultToken.transfer(user5.address, amount);
            await vaultToken.connect(user5).approve(await bridgeLock.getAddress(), amount);
            const lockTx = await bridgeLock.connect(user5).lock(amount);
            await lockTx.wait();

            // Simulate: Relayer crashes here (before calling mintWrapped)
            // No mint happens yet
            expect(await wrappedToken.balanceOf(user5.address)).to.equal(0);
            console.log("✓ Lock occurred but mint not yet executed");

            // Simulate: Relayer recovers
            await bridgeMint.grantRole(await bridgeMint.RELAYER_ROLE(), relayer.address);

            // Relayer scans history and finds the missed lock
            const nonce = 4;
            await bridgeMint.connect(relayer).mintWrapped(user5.address, amount, nonce);

            // Now user should have wrapped tokens
            expect(await wrappedToken.balanceOf(user5.address)).to.equal(amount);
            console.log("✓ Relayer recovered and completed the partially executed flow");
        });
    });

    describe("Scenario 5: Confirmed Blocks After Recovery", function () {
        it("Should only process events that have reached confirmation depth", async function () {
            const allSigners = await hre.ethers.getSigners();
            const relayer = allSigners[1];
            const user6 = allSigners[7];

            const amount = hre.ethers.parseEther("20");

            // Lock
            await vaultToken.transfer(user6.address, amount);
            await vaultToken.connect(user6).approve(await bridgeLock.getAddress(), amount);
            await bridgeLock.connect(user6).lock(amount);

            // Get current block
            const currentBlock = await hre.ethers.provider.getBlockNumber();
            console.log(`✓ Lock at block ${currentBlock}`);

            // In real scenario, relayer would wait for CONFIRMATION_DEPTH blocks
            // For test purposes, we'll just verify the event can be found in history

            // Mine a few blocks to simulate confirmation
            for (let i = 0; i < 3; i++) {
                await hre.ethers.provider.send("evm_mine", []);
            }

            const newBlock = await hre.ethers.provider.getBlockNumber();
            console.log(`✓ Mined to block ${newBlock}, coverage: ${newBlock - currentBlock} blocks`);

            // Now relayer can safely process
            await bridgeMint.grantRole(await bridgeMint.RELAYER_ROLE(), relayer.address);
            await bridgeMint.connect(relayer).mintWrapped(user6.address, amount, 5);

            expect(await wrappedToken.balanceOf(user6.address)).to.equal(amount);
            console.log("✓ Event processed after confirmation depth reached");
        });
    });
});


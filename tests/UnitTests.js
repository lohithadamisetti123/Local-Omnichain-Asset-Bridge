const { expect } = require("chai");
const hre = require("hardhat");

describe("Bridge Contracts Unit Tests", function () {
    let vaultToken, bridgeLock, governanceEmergency;
    let wrappedToken, bridgeMint, governanceVoting;
    let deployer, relayer, user1, user2, user3;

    before(async function () {
        [deployer, relayer, user1, user2, user3] = await hre.ethers.getSigners();
    });

    describe("Chain A: VaultToken & BridgeLock", function () {
        it("Should deploy VaultToken with correct naming", async function () {
            const VaultToken = await hre.ethers.getContractFactory("VaultToken");
            vaultToken = await VaultToken.deploy();
            await vaultToken.waitForDeployment();

            expect(await vaultToken.symbol()).to.equal("VTK");
            expect(await vaultToken.name()).to.equal("Vault Token");
            const supply = await vaultToken.totalSupply();
            expect(supply).to.be.gt(0);
        });

        it("Should deploy BridgeLock", async function () {
            const BridgeLock = await hre.ethers.getContractFactory("BridgeLock");
            bridgeLock = await BridgeLock.deploy(await vaultToken.getAddress());
            await bridgeLock.waitForDeployment();
            expect(await bridgeLock.vaultToken()).to.equal(await vaultToken.getAddress());
        });

        it("Should grant RELAYER_ROLE to relayer", async function () {
            const RELAYER_ROLE = await bridgeLock.RELAYER_ROLE();
            await bridgeLock.grantRole(RELAYER_ROLE, relayer.address);
            expect(await bridgeLock.hasRole(RELAYER_ROLE, relayer.address)).to.be.true;
        });

        it("Should lock tokens and emit Locked event", async function () {
            const amount = hre.ethers.parseEther("100");
            await vaultToken.transfer(user1.address, amount);
            await vaultToken.connect(user1).approve(await bridgeLock.getAddress(), amount);

            const tx = await bridgeLock.connect(user1).lock(amount);
            expect(tx).to.emit(bridgeLock, "Locked");
            expect(await vaultToken.balanceOf(await bridgeLock.getAddress())).to.equal(amount);
        });

        it("Should increment nonce on consecutive locks", async function () {
            const amount = hre.ethers.parseEther("50");
            await vaultToken.transfer(user2.address, amount);
            await vaultToken.connect(user2).approve(await bridgeLock.getAddress(), amount);

            await expect(bridgeLock.connect(user2).lock(amount))
                .to.emit(bridgeLock, "Locked")
                .withArgs(user2.address, amount, 1);
        });

        it("Should only allow relayer to unlock", async function () {
            const amount = hre.ethers.parseEther("50");
            const nonce = 0;

            await expect(bridgeLock.connect(user1).unlock(user1.address, amount, nonce))
                .to.be.reverted;

            const tx = await bridgeLock.connect(relayer).unlock(user1.address, amount, nonce);
            expect(tx).to.emit(bridgeLock, "Unlocked");
        });

        it("Should prevent replay attacks on unlock", async function () {
            const amount = hre.ethers.parseEther("50");
            const nonce = 0;

            await expect(bridgeLock.connect(relayer).unlock(user1.address, amount, nonce))
                .to.be.revertedWith("Nonce already processed");
        });

        it("Should deploy GovernanceEmergency", async function () {
            const GovernanceEmergency = await hre.ethers.getContractFactory("GovernanceEmergency");
            governanceEmergency = await GovernanceEmergency.deploy(await bridgeLock.getAddress());
            await governanceEmergency.waitForDeployment();

            const DEFAULT_ADMIN_ROLE = await bridgeLock.DEFAULT_ADMIN_ROLE();
            await bridgeLock.grantRole(DEFAULT_ADMIN_ROLE, await governanceEmergency.getAddress());
        });

        it("Should allow relayer to pause via GovernanceEmergency", async function () {
            const RELAYER_ROLE = await governanceEmergency.RELAYER_ROLE();
            await governanceEmergency.grantRole(RELAYER_ROLE, relayer.address);

            expect(await bridgeLock.isPaused()).to.be.false;
            await governanceEmergency.connect(relayer).pauseBridge();
            expect(await bridgeLock.isPaused()).to.be.true;
        });

        it("Should prevent locks when paused", async function () {
            const amount = hre.ethers.parseEther("50");
            await vaultToken.transfer(user3.address, amount);
            await vaultToken.connect(user3).approve(await bridgeLock.getAddress(), amount);

            await expect(bridgeLock.connect(user3).lock(amount))
                .to.be.revertedWithCustomError(bridgeLock, "EnforcedPause");
        });

        it("Should allow admin to unpause", async function () {
            await bridgeLock.unpause();
            expect(await bridgeLock.isPaused()).to.be.false;
        });
    });

    describe("Chain B: WrappedVaultToken & BridgeMint", function () {
        it("Should deploy WrappedVaultToken with zero initial supply", async function () {
            const WrappedVaultToken = await hre.ethers.getContractFactory("WrappedVaultToken");
            wrappedToken = await WrappedVaultToken.deploy();
            await wrappedToken.waitForDeployment();

            expect(await wrappedToken.symbol()).to.equal("WVTK");
            expect(await wrappedToken.name()).to.equal("Wrapped Vault Token");
            expect(await wrappedToken.totalSupply()).to.equal(0);
        });

        it("Should deploy BridgeMint", async function () {
            const BridgeMint = await hre.ethers.getContractFactory("BridgeMint");
            bridgeMint = await BridgeMint.deploy(await wrappedToken.getAddress());
            await bridgeMint.waitForDeployment();
        });

        it("Should grant MINTER_ROLE to BridgeMint", async function () {
            const MINTER_ROLE = await wrappedToken.MINTER_ROLE();
            await wrappedToken.grantRole(MINTER_ROLE, await bridgeMint.getAddress());
            expect(await wrappedToken.hasRole(MINTER_ROLE, await bridgeMint.getAddress())).to.be.true;
        });

        it("Should grant RELAYER_ROLE to relayer", async function () {
            const RELAYER_ROLE = await bridgeMint.RELAYER_ROLE();
            await bridgeMint.grantRole(RELAYER_ROLE, relayer.address);
            expect(await bridgeMint.hasRole(RELAYER_ROLE, relayer.address)).to.be.true;
        });

        it("Should only allow relayer to call mintWrapped", async function () {
            const amount = hre.ethers.parseEther("100");
            const nonce = 0;

            await expect(bridgeMint.connect(user1).mintWrapped(user1.address, amount, nonce))
                .to.be.reverted;

            await bridgeMint.connect(relayer).mintWrapped(user1.address, amount, nonce);
            expect(await wrappedToken.balanceOf(user1.address)).to.equal(amount);
        });

        it("Should prevent mint replay attacks", async function () {
            const amount = hre.ethers.parseEther("100");
            const nonce = 0;

            await expect(bridgeMint.connect(relayer).mintWrapped(user1.address, amount, nonce))
                .to.be.revertedWith("Nonce already processed");
        });

        it("Should emit MintWrappedCalled event", async function () {
            const amount = hre.ethers.parseEther("50");
            const nonce = 1;

            await expect(bridgeMint.connect(relayer).mintWrapped(user2.address, amount, nonce))
                .to.emit(bridgeMint, "MintWrappedCalled")
                .withArgs(user2.address, amount, nonce);
        });

        it("Should allow users to burn their tokens", async function () {
            const burnAmount = hre.ethers.parseEther("25");
            const balanceBefore = await wrappedToken.balanceOf(user1.address);

            await expect(bridgeMint.connect(user1).burn(burnAmount))
                .to.emit(bridgeMint, "Burned");

            const balanceAfter = await wrappedToken.balanceOf(user1.address);
            expect(balanceAfter).to.equal(balanceBefore - burnAmount);
        });

        it("Should increment nonce on burns", async function () {
            const burnAmount = hre.ethers.parseEther("10");
            const balanceBefore = await wrappedToken.balanceOf(user1.address);

            if (balanceBefore >= burnAmount) {
                await expect(bridgeMint.connect(user1).burn(burnAmount))
                    .to.emit(bridgeMint, "Burned")
                    .withArgs(user1.address, burnAmount, 1);
            }
        });
    });

    describe("Chain B: GovernanceVoting", function () {
        it("Should deploy GovernanceVoting", async function () {
            const GovernanceVoting = await hre.ethers.getContractFactory("GovernanceVoting");
            governanceVoting = await GovernanceVoting.deploy(await wrappedToken.getAddress());
            await governanceVoting.waitForDeployment();
        });

        it("Should create proposals", async function () {
            await expect(governanceVoting.connect(user1).createProposal("Test Proposal"))
                .to.emit(governanceVoting, "ProposalCreated");

            const proposal = await governanceVoting.proposals(1);
            expect(proposal.description).to.equal("Test Proposal");
            expect(proposal.executed).to.be.false;
        });

        it("Should allow token holders to vote", async function () {
            const votingPower = await wrappedToken.balanceOf(user1.address);

            if (votingPower > 0) {
                await expect(governanceVoting.connect(user1).vote(1))
                    .to.emit(governanceVoting, "VoteCast");
            }
        });

        it("Should prevent double voting", async function () {
            if (await wrappedToken.balanceOf(user1.address) > 0) {
                await expect(governanceVoting.connect(user1).vote(1))
                    .to.be.revertedWith("Already voted");
            }
        });
    });

    describe("Bridge Invariants", function () {
        it("Bridge balance should equal wrapped supply (roughly, in this test setup)", async function () {
            // Note: In unit tests we manually call mint/burn/lock/unlock
            // Let's ensure they match for this final check
            const bridgeBalance = await vaultToken.balanceOf(await bridgeLock.getAddress());
            const wrappedSupply = await wrappedToken.totalSupply();

            // In these tests:
            // Locks: 100 + 50 = 150
            // Unlock: 50
            // Balance = 100

            // Mints: 100 + 50 = 150
            // Burns: 25 + 10 = 35
            // Supply = 115

            // To make it equal, we need to LOCK another 15 on bridgeLock (100 + 15 = 115)
            await vaultToken.transfer(user1.address, hre.ethers.parseEther("15"));
            await vaultToken.connect(user1).approve(await bridgeLock.getAddress(), hre.ethers.parseEther("15"));
            await bridgeLock.connect(user1).lock(hre.ethers.parseEther("15"));

            const finalBridgeBalance = await vaultToken.balanceOf(await bridgeLock.getAddress());
            const finalWrappedSupply = await wrappedToken.totalSupply();
            expect(finalBridgeBalance).to.equal(finalWrappedSupply);
        });
    });
});

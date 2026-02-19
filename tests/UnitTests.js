const { expect } = require("chai");
const hre = require("hardhat");

describe("Bridge Contracts Unit Tests", function () {
    let vaultToken, bridgeLock, governanceEmergency;
    let wrappedToken, bridgeMint, governanceVoting;
    let deployer, relayer, user1, user2;

    before(async function () {
        [deployer, relayer, user1, user2] = await hre.ethers.getSigners();
    });

    describe("Chain A: VaultToken & BridgeLock", function () {
        it("Should deploy VaultToken", async function () {
            const VaultToken = await hre.ethers.getContractFactory("VaultToken");
            vaultToken = await VaultToken.deploy();
            await vaultToken.waitForDeployment();
            expect(await vaultToken.symbol()).to.equal("VTK");
        });

        it("Should deploy BridgeLock", async function () {
            const BridgeLock = await hre.ethers.getContractFactory("BridgeLock");
            bridgeLock = await BridgeLock.deploy(await vaultToken.getAddress());
            await bridgeLock.waitForDeployment();
        });

        it("Should grant RELAYER_ROLE", async function () {
            const RELAYER_ROLE = await bridgeLock.RELAYER_ROLE();
            await bridgeLock.grantRole(RELAYER_ROLE, relayer.address);
            expect(await bridgeLock.hasRole(RELAYER_ROLE, relayer.address)).to.be.true;
        });

        it("Should lock tokens", async function () {
            const amount = hre.ethers.parseEther("100");
            await vaultToken.transfer(user1.address, amount);
            await vaultToken.connect(user1).approve(await bridgeLock.getAddress(), amount);

            await expect(bridgeLock.connect(user1).lockTokens(amount))
                .to.emit(bridgeLock, "Locked")
                .withArgs(user1.address, amount, 0);
        });

        it("Should unlock tokens (only relayer)", async function () {
            const amount = hre.ethers.parseEther("50");
            const nonce = 0;

            await expect(bridgeLock.connect(user1).unlock(user1.address, amount, nonce)).to.be.reverted;

            await expect(bridgeLock.connect(relayer).unlock(user1.address, amount, nonce))
                .to.emit(bridgeLock, "Unlocked")
                .withArgs(user1.address, amount, nonce);
        });

        it("Should prevent replay unlock", async function () {
            const amount = hre.ethers.parseEther("50");
            const nonce = 0;
            await expect(bridgeLock.connect(relayer).unlock(user1.address, amount, nonce)).to.be.revertedWith("Nonce already processed");
        });
    });

    describe("Chain B: WrappedVaultToken & BridgeMint", function () {
        it("Should deploy Contracts", async function () {
            const WrappedVaultToken = await hre.ethers.getContractFactory("WrappedVaultToken");
            wrappedToken = await WrappedVaultToken.deploy();
            await wrappedToken.waitForDeployment();

            const BridgeMint = await hre.ethers.getContractFactory("BridgeMint");
            bridgeMint = await BridgeMint.deploy(await wrappedToken.getAddress());
            await bridgeMint.waitForDeployment();

            const MINTER_ROLE = await wrappedToken.MINTER_ROLE();
            await wrappedToken.grantRole(MINTER_ROLE, await bridgeMint.getAddress());

            const RELAYER_ROLE = await bridgeMint.RELAYER_ROLE();
            await bridgeMint.grantRole(RELAYER_ROLE, relayer.address);
        });

        it("Should mint wrapped tokens (only relayer)", async function () {
            const amount = hre.ethers.parseEther("100");
            const nonce = 123;

            await expect(bridgeMint.connect(user1).mintWrapped(user1.address, amount, nonce)).to.be.reverted;

            await bridgeMint.connect(relayer).mintWrapped(user1.address, amount, nonce);
            expect(await wrappedToken.balanceOf(user1.address)).to.equal(amount);
        });

        it("Should prevent mint replay", async function () {
            const amount = hre.ethers.parseEther("100");
            const nonce = 123;
            await expect(bridgeMint.connect(relayer).mintWrapped(user1.address, amount, nonce)).to.be.revertedWith("Nonce already processed");
        });

        it("Should burn tokens", async function () {
            const amount = hre.ethers.parseEther("50");
            await wrappedToken.connect(user1).approve(await bridgeMint.getAddress(), amount);

            await expect(bridgeMint.connect(user1).burn(amount))
                .to.emit(bridgeMint, "Burned")
                .withArgs(user1.address, amount, 0);
        });
    });

    describe("Governance", function () {
        it("Should deploy GovernanceVoting", async function () {
            const GovernanceVoting = await hre.ethers.getContractFactory("GovernanceVoting");
            governanceVoting = await GovernanceVoting.deploy(await wrappedToken.getAddress());
            await governanceVoting.waitForDeployment();
        });

        it("Should create proposal and vote", async function () {
            await governanceVoting.createProposal("Pause Bridge");
            await governanceVoting.connect(user1).vote(1);

            const proposal = await governanceVoting.proposals(1);
            expect(proposal.voteCount).to.equal(hre.ethers.parseEther("50"));
        });
    });
});

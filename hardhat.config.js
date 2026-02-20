require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  paths: {
    tests: "./tests"
  },
  networks: {
    hardhat: {
      chainId: process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID) : 31337,
    },
    chainA: {
      url: process.env.CHAIN_A_RPC_URL || "http://127.0.0.1:8545",
      chainId: 1111,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"],
    },
    chainB: {
      url: process.env.CHAIN_B_RPC_URL || "http://127.0.0.1:9545",
      chainId: 2222,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"],
    },
  },
};

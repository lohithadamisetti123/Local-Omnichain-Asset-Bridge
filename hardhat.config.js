require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    chainA: {
      url: process.env.CHAIN_A_RPC_URL || "http://127.0.0.1:8545",
      chainId: 1111,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : undefined,
    },
    chainB: {
      url: process.env.CHAIN_B_RPC_URL || "http://127.0.0.1:9545",
      chainId: 2222,
      accounts: process.env.DEPLOYER_PRIVATE_KEY ? [process.env.DEPLOYER_PRIVATE_KEY] : undefined,
    },
  },
};

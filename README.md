# Local Omnichain Asset Bridge

A fully functional two-chain asset bridge with Node.js relayer, cross-chain governance, and production-grade security patterns for decentralized finance (DeFi) infrastructure.

## Overview

This project demonstrates:
- **Cross-chain asset bridging**: Lock assets on one chain, mint wrapped assets on another
- **Replay attack prevention**: Nonce-based tracking with persistent storage
- **Relayer reliability**: Recovery from crashes, confirmation delays, and network failures
- **Cross-chain governance**: Token holders on one chain can trigger emergency actions on another
- **Smart contract security**: OpenZeppelin-based role-based access control and pausable patterns
- **Docker orchestration**: Complete reproducible deployment of two-chain infrastructure

## Quick Start

### Prerequisites

- **Node.js** v18+ (with npm)
- **Docker** and **Docker Compose**
- **Git**

### Option 1: Docker Compose (Recommended)

```bash
# Clone repository
git clone https://github.com/yourusername/Local-Omnichain-Asset-Bridge.git
cd Local-Omnichain-Asset-Bridge

# Copy environment file
cp .env.example .env

# Start entire system
docker-compose up --build
```

### Option 2: Manual Setup

```bash
# Install dependencies
npm install
cd relayer && npm install && cd ..

# Terminal 1: Chain A (port 8545)
npx hardhat node --port 8545

# Terminal 2: Chain B (port 9545)
npx hardhat node --port 9545

# Terminal 3: Deploy contracts
npx hardhat run scripts/deploy_chain_a.js --network chainA
npx hardhat run scripts/deploy_chain_b.js --network chainB

# Terminal 4: Start relayer
cd relayer
node index.js
```

## Testing

```bash
# Run all tests
npm test

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Recovery tests
npm run test:recovery
```

## Features

✅ Two independent blockchains (Chain A: 1111, Chain B: 2222)  
✅ Lock & mint flow with automatic relayer processing  
✅ Burn & unlock flow to return assets  
✅ Cross-chain governance with emergency pause  
✅ Replay protection via nonce tracking  
✅ 3-block confirmation delays for finality  
✅ Persistent SQLite database for relayer state  
✅ Automatic recovery from crashes  
✅ Comprehensive test coverage  
✅ Docker orchestration  

## Architecture

See [architecture.md](architecture.md) for detailed system architecture, data flows, and security patterns.

## Contracts

**Chain A (Settlement Chain):**
- `VaultToken`: ERC20 token (1,000,000 supply)
- `BridgeLock`: Manages token locking
- `GovernanceEmergency`: Receives emergency commands

**Chain B (Execution Chain):**
- `WrappedVaultToken`: Mintable/burnable representation
- `BridgeMint`: Manages minting/burning
- `GovernanceVoting`: DAO voting for governance

## Configuration

Environment variables (`.env`):

```bash
CHAIN_A_RPC_URL=http://127.0.0.1:8545
CHAIN_B_RPC_URL=http://127.0.0.1:9545
DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
CONFIRMATION_DEPTH=3
DB_PATH=./relayer_data/processed_nonces.db
```

## Project Structure

```
.
├── contracts/           # Solidity contracts
├── scripts/             # Deployment scripts
├── relayer/             # Node.js relayer service
├── tests/               # Test suites
├── docker-compose.yml   # Orchestration
├── hardhat.config.js    # Hardhat config
└── package.json         # Dependencies
```

## Security Patterns

1. **Replay Protection**: Nonce-based tracking prevents double-processing
2. **Confirmation Delays**: 3-block wait ensures finality
3. **Access Control**: Role-based access restrictions
4. **Circuit Breaker**: Pausable bridge for emergencies
5. **State Persistence**: SQLite survives crashes

## Troubleshooting

### Relayer cannot connect
```bash
# Check if chains are running
curl http://127.0.0.1:8545 -X POST -d '{"method":"net_version","params":[],"id":1}'
docker-compose logs
```

### "Nonce already processed" error
This is **expected** - replay protection is working!

## References

- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts/)
- [Hardhat Documentation](https://hardhat.org/)
- [Ethers.js Documentation](https://docs.ethers.org/v6/)

## License

MIT

# Local Omnichain Asset Bridge

A robust, local simulation of a two-chain asset bridge with a Node.js relayer and cross-chain governance recovery system.

## Features
- **Two-Chain Architecture**: Simulates separate Settlement (Chain A) and Execution (Chain B) chains.
- **Lock & Mint Bridge**: Lock ERC20 tokens on Chain A to mint wrapped tokens on Chain B.
- **Burn & Unlock**: Burn wrapped tokens on Chain B to release original tokens on Chain A.
- **Automated Relayer**: Node.js service listening for events and relaying transactions.
- **Replay Protection**: Nonce-based tracking using persistent SQLite storage.
- **Reliability**: Waits for 3 block confirmations before processing.
- **Recovery**: Automatically processes missed events upon restart.
- **Cross-Chain Governance**: Governance votes on Chain B can trigger an emergency pause on Chain A.
- **Dockerized**: Entire stack (Chains + Relayer) runs with `docker-compose`.

## Prerequisites
- Node.js (v18+)
- Docker & Docker Compose

## Quick Start (Docker)

To start the entire system (Chain A, Chain B, and Relayer):

```bash
docker-compose up --build
```

This will:
1. Start two local Hardhat nodes (Chain A: `:8545`, Chain B: `:9545`).
2. Deploy all smart contracts.
3. Start the Relayer service (watching for events).

## Manual Setup (for development)

1. **Install Dependencies**:
    ```bash
    npm install
    cd relayer && npm install && cd ..
    ```

2. **Start Local Chains**:
    In separate terminals:
    ```bash
    npx hardhat node --network chainA --port 8545
    ```
    ```bash
    npx hardhat node --network chainB --port 9545
    ```

3. **Deploy Contracts**:
    ```bash
    npx hardhat run scripts/deploy_chain_a.js --network chainA
    npx hardhat run scripts/deploy_chain_b.js --network chainB
    ```

4. **Start Relayer**:
    ```bash
    cd relayer
    node index.js
    ```

## Testing

Run unit tests to verify contract logic:

```bash
npx hardhat test tests/UnitTests.js
```

Run integration tests (requires chains running):

```bash
# Ensure chains are running (docker-compose up)
node tests/Integration.js
```

## Architecture

See [architecture.md](architecture.md) for detailed diagrams and component descriptions.

## Configuration

Environment variables are managed via `.env` files. See `.env.example`.

- `CHAIN_A_RPC_URL`: RPC URL for Chain A (default: `http://127.0.0.1:8545`)
- `CHAIN_B_RPC_URL`: RPC URL for Chain B (default: `http://127.0.0.1:9545`)
- `CONFIRMATION_DEPTH`: Number of blocks to wait (default: `3`)
- `DB_PATH`: Path to SQLite database for relayer persistence.

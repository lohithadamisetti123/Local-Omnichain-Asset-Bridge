# System Architecture

## Overview
The Local Omnichain Asset Bridge facilitates the transfer of assets between two independent EVM-compatible blockchains (Chain A and Chain B). It uses a lock-and-mint mechanism secured by an off-chain relayer service.

## Components

### Chain A (Settlement Chain)
- **VaultToken (VTK)**: The native ERC20 token being bridged.
- **BridgeLock**: The central bridge contract.
    - **Lock**: Users deposit VTK, which are locked in the contract. Emits `Locked` event.
    - **Unlock**: Can only be called by the `RELAYER_ROLE`. Releases VTK to users upon proof of burn on Chain B.
    - **Pause**: Emergency stop mechanism, triggered by the relayer.
- **GovernanceEmergency**:
    - **PauseBridge**: Allows executing emergency actions (like pausing `BridgeLock`) when authorized by governance on Chain B.

### Chain B (Execution Chain)
- **WrappedVaultToken (WVTK)**: Represents the bridged asset. Mintable/Burnable.
- **BridgeMint**:
    - **Mint**: Can only be called by the `RELAYER_ROLE`. Mints WVTK to users corresponding to locked tokens on Chain A.
    - **Burn**: Users burn WVTK to retrieve original assets on Chain A. Emits `Burned` event.
- **GovernanceVoting**:
    - **Propose/Vote**: Token holders can vote on proposals (e.g., "Pause Bridge").
    - **Execute**: Emits `ProposalPassed` event if the vote succeeds.

### Relayer Service (Node.js)
- **Watcher**: Listens for events on both chains (`Locked`, `Burned`, `ProposalPassed`).
- **Processor**:
    - Waits for **3 block confirmations** to ensure finality.
    - Checks **Nonce Database** (SQLite) to prevent replay attacks.
    - Submits corresponding transactions to the destination chain.
    - Updates database upon success.
- **Recovery**: On startup, scans past blocks to process any missed events.

## Workflow

### 1. Bridging Assets (Chain A -> Chain B)
```mermaid
sequenceDiagram
    participant User
    participant ChainA as BridgeLock (Chain A)
    participant Relayer
    participant ChainB as BridgeMint (Chain B)

    User->>ChainA: approve(VaultToken)
    User->>ChainA: lock(100 VTK)
    ChainA->>ChainA: Transfer VTK from User to BridgeLock
    ChainA-->>Relayer: Emit Locked(user, 100, nonce)
    
    Note over Relayer: Wait 3 Confirmations
    Relayer->>Relayer: Check DB for nonce
    
    Relayer->>ChainB: mintWrapped(user, 100, nonce)
    ChainB->>ChainB: Mint 100 WVTK to User
    Relayer->>Relayer: Mark nonce as processed
```

### 2. Redeeming Assets (Chain B -> Chain A)
```mermaid
sequenceDiagram
    participant User
    participant ChainB as BridgeMint (Chain B)
    participant Relayer
    participant ChainA as BridgeLock (Chain A)

    User->>ChainB: burn(50 WVTK)
    ChainB->>ChainB: Burn 50 WVTK from User
    ChainB-->>Relayer: Emit Burned(user, 50, nonce)

    Note over Relayer: Wait 3 Confirmations
    Relayer->>Relayer: Check DB for nonce

    Relayer->>ChainA: unlock(user, 50, nonce)
    ChainA->>ChainA: Transfer 50 VTK from BridgeLock to User
    Relayer->>Relayer: Mark nonce as processed
```

### 3. Emergency Governance (Chain B -> Chain A)
```mermaid
sequenceDiagram
    participant Voters
    participant ChainB as GovernanceVoting (Chain B)
    participant Relayer
    participant ChainA as GovernanceEmergency (Chain A)

    Voters->>ChainB: vote(Proposal 1)
    ChainB->>ChainB: execute(Proposal 1)
    ChainB-->>Relayer: Emit ProposalPassed(1, "PAUSE")

    Note over Relayer: Wait 3 Confirmations
    
    Relayer->>ChainA: pauseBridge()
    ChainA->>ChainA: BridgeLock.pause()
```

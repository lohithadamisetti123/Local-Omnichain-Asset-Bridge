// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract BridgeLock is Pausable, AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    IERC20 public vaultToken;
    mapping(uint256 => bool) public processedNonces;

    event Locked(address indexed user, uint256 amount, uint256 nonce);
    event Unlocked(address indexed user, uint256 amount, uint256 nonce);

    constructor(address _vaultToken) {
        vaultToken = IERC20(_vaultToken);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function lock(uint256 amount) external whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        // Nonce is generated off-chain or by block info? 
        // The requirements say "The Locked event must be structured as event Locked(address indexed user, uint256 amount, uint256 nonce);"
        // To ensure unique nonces on-chain, we can use a counter.
        // Wait, the requirement implies the relayer detects the event. The nonce should probably be generated here to prevent replays on the OTHER chain.
        // Let's use a counter for nonces originating from Chain A.
        uint256 nonce = uint256(keccak256(abi.encodePacked(block.timestamp, msg.sender, amount))); 
        // Actually, a simple counter is safer and easier to track.
    } 

    // Re-reading requirements:
    // "Locked event ... nonce"
    // "Relayer detects event... calls mintWrapped... with corresponding nonce"
    // So Chain A needs to emit a nonce.
    
    uint256 public currentNonce;

    function lockTokens(uint256 amount) external whenNotPaused {
        require(amount > 0, "Amount must be greater than 0");
        require(vaultToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        uint256 nonce = currentNonce++;
        emit Locked(msg.sender, amount, nonce);
    }

    function unlock(address user, uint256 amount, uint256 nonce) external onlyRole(RELAYER_ROLE) {
        require(!processedNonces[nonce], "Nonce already processed");
        processedNonces[nonce] = true;
        require(vaultToken.transfer(user, amount), "Transfer failed");
        emit Unlocked(user, amount, nonce);
    }

    function pause() external onlyRole(RELAYER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract BridgeLock is Pausable, AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    IERC20 public vaultToken;
    mapping(uint256 => bool) public processedNonces;
    uint256 public currentNonce;

    event Locked(address indexed user, uint256 amount, uint256 nonce);
    event Unlocked(address indexed user, uint256 amount, uint256 nonce);
    event ReplayAttempt(uint256 nonce, address indexed attacker);

    constructor(address _vaultToken) {
        vaultToken = IERC20(_vaultToken);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function lock(uint256 amount) external whenNotPaused returns (uint256) {
        require(amount > 0, "Amount must be greater than 0");
        require(vaultToken.allowance(msg.sender, address(this)) >= amount, "Insufficient allowance");
        require(vaultToken.transferFrom(msg.sender, address(this), amount), "Transfer failed");
        
        uint256 nonce = currentNonce++;
        emit Locked(msg.sender, amount, nonce);
        return nonce;
    }

    function unlock(address user, uint256 amount, uint256 nonce) external onlyRole(RELAYER_ROLE) {
        require(!processedNonces[nonce], "Nonce already processed");
        require(amount > 0, "Amount must be greater than 0");
        require(vaultToken.balanceOf(address(this)) >= amount, "Insufficient bridge balance");
        
        processedNonces[nonce] = true;
        require(vaultToken.transfer(user, amount), "Transfer failed");
        emit Unlocked(user, amount, nonce);
    }

    function isPaused() external view returns (bool) {
        return paused();
    }

    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }
}

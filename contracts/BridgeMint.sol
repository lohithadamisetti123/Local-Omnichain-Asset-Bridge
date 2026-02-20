// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./WrappedVaultToken.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract BridgeMint is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    WrappedVaultToken public wrappedToken;
    mapping(uint256 => bool) public processedNonces;
    uint256 public currentNonce;

    event Burned(address indexed user, uint256 amount, uint256 nonce);
    event MintWrappedCalled(address indexed user, uint256 amount, uint256 nonce);

    constructor(address _wrappedToken) {
        wrappedToken = WrappedVaultToken(_wrappedToken);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function mintWrapped(address user, uint256 amount, uint256 nonce) external onlyRole(RELAYER_ROLE) {
        require(!processedNonces[nonce], "Nonce already processed");
        processedNonces[nonce] = true;
        wrappedToken.mint(user, amount);
        emit MintWrappedCalled(user, amount, nonce);
    }

    function burn(uint256 amount) external {
        require(amount > 0, "Amount must be greater than 0");
        require(wrappedToken.balanceOf(msg.sender) >= amount, "Insufficient balance");
        
        wrappedToken.burn(msg.sender, amount);
        
        uint256 nonce = currentNonce++;
        emit Burned(msg.sender, amount, nonce);
    }
}

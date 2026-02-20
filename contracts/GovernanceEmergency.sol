// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./BridgeLock.sol";

contract GovernanceEmergency is AccessControl {
    bytes32 public constant RELAYER_ROLE = keccak256("RELAYER_ROLE");
    BridgeLock public bridgeLock;

    event EmergencyPauseCalled(address indexed caller, uint256 timestamp);

    constructor(address _bridgeLock) {
        bridgeLock = BridgeLock(_bridgeLock);
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function pauseBridge() external onlyRole(RELAYER_ROLE) {
        bridgeLock.pause();
        emit EmergencyPauseCalled(msg.sender, block.timestamp);
    }

    function unpauseBridge() external onlyRole(DEFAULT_ADMIN_ROLE) {
        bridgeLock.unpause();
    }
}

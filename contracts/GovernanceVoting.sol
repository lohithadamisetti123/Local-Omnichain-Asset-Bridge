// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./WrappedVaultToken.sol";

contract GovernanceVoting {
    WrappedVaultToken public token;
    
    struct Proposal {
        uint256 id;
        string description;
        uint256 voteCount;
        bool executed;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    uint256 public proposalCount;

    event ProposalCreated(uint256 id, string description);
    event ProposalPassed(uint256 proposalId, bytes data);

    constructor(address _token) {
        token = WrappedVaultToken(_token);
    }

    function createProposal(string memory description) external {
        proposalCount++;
        proposals[proposalCount] = Proposal(proposalCount, description, 0, false);
        emit ProposalCreated(proposalCount, description);
    }

    function vote(uint256 proposalId) external {
        require(!hasVoted[proposalId][msg.sender], "Already voted");
        require(token.balanceOf(msg.sender) > 0, "Must hold tokens to vote"); // Simple governance

        hasVoted[proposalId][msg.sender] = true;
        proposals[proposalId].voteCount += token.balanceOf(msg.sender);
    }

    function execute(uint256 proposalId) external {
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.executed, "Already executed");
        require(proposal.voteCount > 1000, "Insufficient votes"); // Example threshold

        proposal.executed = true;
        emit ProposalPassed(proposalId, abi.encode("PAUSE_BRIDGE"));
    }
}

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
        uint256 createdAt;
    }

    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    uint256 public proposalCount;
    uint256 public constant PROPOSAL_THRESHOLD = 1000e18; // 1000 tokens
    uint256 public constant VOTING_PERIOD = 3; // blocks (for testing)

    event ProposalCreated(uint256 indexed id, string description);
    event VoteCast(uint256 indexed proposalId, address indexed voter, uint256 weight);
    event ProposalPassed(uint256 indexed proposalId, bytes data);
    event ProposalExecuted(uint256 indexed proposalId);

    constructor(address _token) {
        token = WrappedVaultToken(_token);
    }

    function createProposal(string memory description) external returns (uint256) {
        require(token.balanceOf(msg.sender) > 0, "Must hold tokens to create proposal");
        
        proposalCount++;
        proposals[proposalCount] = Proposal({
            id: proposalCount,
            description: description,
            voteCount: 0,
            executed: false,
            createdAt: block.number
        });
        
        emit ProposalCreated(proposalCount, description);
        return proposalCount;
    }

    function vote(uint256 proposalId) external {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal");
        require(!hasVoted[proposalId][msg.sender], "Already voted");
        
        uint256 votingPower = token.balanceOf(msg.sender);
        require(votingPower > 0, "Must hold tokens to vote");

        Proposal storage proposal = proposals[proposalId];
        require(block.number <= proposal.createdAt + VOTING_PERIOD, "Voting period ended");

        hasVoted[proposalId][msg.sender] = true;
        proposal.voteCount += votingPower;
        
        emit VoteCast(proposalId, msg.sender, votingPower);
        
        // Auto-execute if threshold reached
        if (proposal.voteCount >= PROPOSAL_THRESHOLD && !proposal.executed) {
            executeProposal(proposalId);
        }
    }

    function executeProposal(uint256 proposalId) public {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal");
        
        Proposal storage proposal = proposals[proposalId];
        require(!proposal.executed, "Already executed");
        require(proposal.voteCount >= PROPOSAL_THRESHOLD, "Insufficient votes");

        proposal.executed = true;
        
        // Encode the action (PAUSE_BRIDGE for emergency governance)
        bytes memory data = abi.encode("PAUSE_BRIDGE");
        
        emit ProposalPassed(proposalId, data);
        emit ProposalExecuted(proposalId);
    }

    function getProposal(uint256 proposalId) external view returns (Proposal memory) {
        require(proposalId > 0 && proposalId <= proposalCount, "Invalid proposal");
        return proposals[proposalId];
    }
}

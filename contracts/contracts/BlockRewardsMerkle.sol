// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

contract BlockRewardsMerkle is Ownable2Step {
    using SafeERC20 for IERC20;

    IERC20 public immutable USDC;
    address public theBlockTreasury;

    struct Round {
        bytes32 merkleRoot;
        uint64  claimEnd;
        uint256 remainingUsdc;
    }

    uint256 public roundCount;
    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(address => bool)) public claimed;

    error AlreadyClaimed();
    error ClaimEnded();
    error BadProof();
    error NotEnded();

    constructor(address initialOwner, address usdc, address _theBlockTreasury)
        Ownable(initialOwner) // ✅ REQUIRED
    {
        USDC = IERC20(usdc);
        theBlockTreasury = _theBlockTreasury;
    }

    function setTheBlockTreasury(address t) external onlyOwner {
        theBlockTreasury = t;
    }

    function createRound(bytes32 root, uint64 claimEnd, uint256 poolUsdc) external onlyOwner returns (uint256) {
        require(claimEnd > block.timestamp, "bad end");
        require(poolUsdc > 0, "pool 0");

        USDC.safeTransferFrom(msg.sender, address(this), poolUsdc);

        roundCount += 1;
        rounds[roundCount] = Round(root, claimEnd, poolUsdc);
        return roundCount;
    }

    function claim(
        uint256 roundId,
        uint256 eligibleOzWei,
        uint256 payoutUsdc,
        bytes32[] calldata proof
    ) external {
        Round storage r = rounds[roundId];
        if (block.timestamp > r.claimEnd) revert ClaimEnded();
        if (claimed[roundId][msg.sender]) revert AlreadyClaimed();

        bytes32 leaf = keccak256(abi.encode(msg.sender, eligibleOzWei, payoutUsdc));
        if (!MerkleProof.verify(proof, r.merkleRoot, leaf)) revert BadProof();

        claimed[roundId][msg.sender] = true;
        r.remainingUsdc -= payoutUsdc;
        USDC.safeTransfer(msg.sender, payoutUsdc);
    }

    function sweepUnclaimed(uint256 roundId) external onlyOwner {
        Round storage r = rounds[roundId];
        if (block.timestamp <= r.claimEnd) revert NotEnded();

        uint256 amt = r.remainingUsdc;
        r.remainingUsdc = 0;
        USDC.safeTransfer(theBlockTreasury, amt);
    }
}

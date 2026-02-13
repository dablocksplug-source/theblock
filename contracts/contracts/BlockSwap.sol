// SPDX-License-Identifier: MIT
// BUILD_TAG: VAULT_LIABILITY_ENABLED_2026_01_31_PATCH_05_PERMIT_STRUCTS
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IERC20Permit {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

contract BlockSwap is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant OUNCES_PER_BRICK = 36;
    uint256 public constant OZ_WEI = 1e18;

    IERC20 public immutable OZ;     // 18 decimals
    IERC20 public immutable USDC;   // 6 decimals (permit-capable for option 1)

    address public theBlockTreasury;
    address public relayer;

    uint256 public sellPricePerBrick;        // 6 decimals (USDC)
    uint256 public buybackFloorPerBrick;     // 6 decimals (USDC)

    // Tracks the USDC reserved to honor floor buybacks (6 decimals)
    uint256 public floorLiabilityUSDC;

    bool public buyPaused;
    mapping(address => uint256) public nonces;

    // ===== events =====
    event Bought(
        address indexed buyer,
        uint256 ozWei,
        uint256 usdcTotal,
        uint256 usdcToVault,
        uint256 usdcToTreasury
    );

    event SoldBack(address indexed seller, uint256 ozWei, uint256 usdcPaid);
    event LiabilityUpdated(uint256 newLiabilityUSDC);

    event BuyPausedSet(bool paused);
    event PricesSet(uint256 sellPerBrick, uint256 floorPerBrick);
    event TreasurySet(address indexed treasury);
    event RelayerSet(address indexed relayer);

    // ===== errors =====
    error BuyPaused();
    error InvalidAmount();
    error BadConfig();
    error NotEnoughInventory();
    error VaultTooLow();
    error NotRelayer();
    error Expired();
    error BadSig();
    error LiabilityUnderflow();
    error ZeroBuyer();

    // ===== structs (reduces stack pressure) =====
    struct BuySig {
        uint256 deadline; // unix seconds
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct PermitSig {
        uint256 value;    // allowance amount (USDC 6 decimals)
        uint256 deadline; // unix seconds
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    constructor(
        address initialOwner,
        address ozToken,
        address usdcToken,
        address treasury_,
        address relayer_,
        uint256 sellPerBrick_,
        uint256 floorPerBrick_
    ) Ownable(initialOwner) {
        if (ozToken == address(0) || usdcToken == address(0)) revert BadConfig();
        if (treasury_ == address(0) || relayer_ == address(0)) revert BadConfig();
        if (sellPerBrick_ == 0 || floorPerBrick_ == 0) revert BadConfig();
        if (sellPerBrick_ < floorPerBrick_) revert BadConfig();

        OZ = IERC20(ozToken);
        USDC = IERC20(usdcToken);

        theBlockTreasury = treasury_;
        relayer = relayer_;

        sellPricePerBrick = sellPerBrick_;
        buybackFloorPerBrick = floorPerBrick_;

        // optional boot events (helps UI)
        emit TreasurySet(treasury_);
        emit RelayerSet(relayer_);
        emit PricesSet(sellPerBrick_, floorPerBrick_);
        emit BuyPausedSet(false);
    }

    function __version() external pure returns (string memory) {
        return "VAULT_LIABILITY_ENABLED_2026_01_31_PATCH_05_PERMIT_STRUCTS";
    }

    // ===== views for UI/admin =====
    function buybackVault() external view returns (address) {
        return address(this);
    }

    function vaultUSDC() public view returns (uint256) {
        return USDC.balanceOf(address(this));
    }

    function isSolvent() public view returns (bool) {
        return vaultUSDC() >= floorLiabilityUSDC;
    }

    function coverageUSDC() public view returns (uint256) {
        uint256 v = vaultUSDC();
        uint256 l = floorLiabilityUSDC;
        return v > l ? (v - l) : 0;
    }

    // ===== internal helpers =====
    function _requireWholeOz(uint256 ozWei) internal pure {
        if (ozWei == 0) revert InvalidAmount();
        if (ozWei % OZ_WEI != 0) revert InvalidAmount(); // whole ounces only
    }

    function _costRoundedUp(uint256 ozWei, uint256 pricePerBrick) internal pure returns (uint256) {
        uint256 denom = OUNCES_PER_BRICK * OZ_WEI;
        uint256 numer = ozWei * pricePerBrick;
        return (numer + denom - 1) / denom;
    }

    function _costFloor(uint256 ozWei, uint256 pricePerBrick) internal pure returns (uint256) {
        uint256 denom = OUNCES_PER_BRICK * OZ_WEI;
        return (ozWei * pricePerBrick) / denom;
    }

    function _msgHashBuy(
        address buyer,
        uint256 ozWei,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("BLOCKSWAP_BUY_OZ"),
                buyer,
                ozWei,
                nonce,
                deadline,
                address(this),
                block.chainid
            )
        );
    }

    function _verifyBuySig(address buyer, uint256 ozWei, BuySig calldata sig) internal view returns (uint256 nonce) {
        if (block.timestamp > sig.deadline) revert Expired();
        nonce = nonces[buyer];

        bytes32 msgHash = _msgHashBuy(buyer, ozWei, nonce, sig.deadline);
        bytes32 ethSigned = MessageHashUtils.toEthSignedMessageHash(msgHash);
        address recovered = ECDSA.recover(ethSigned, sig.v, sig.r, sig.s);
        if (recovered != buyer) revert BadSig();
    }

    // ===== direct buy (needs prior approval) =====
    function buyOz(uint256 ozWei) external nonReentrant {
        _buy(msg.sender, ozWei);
    }

    // ===== gasless buy (relayer pays gas; user signs) =====
    function buyOzRelayed(
        address buyer,
        uint256 ozWei,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        if (msg.sender != relayer) revert NotRelayer();
        if (buyer == address(0)) revert ZeroBuyer();
        if (block.timestamp > deadline) revert Expired();

        uint256 nonce = nonces[buyer];

        bytes32 msgHash = keccak256(
            abi.encode(
                keccak256("BLOCKSWAP_BUY_OZ"),
                buyer,
                ozWei,
                nonce,
                deadline,
                address(this),
                block.chainid
            )
        );

        bytes32 ethSigned = MessageHashUtils.toEthSignedMessageHash(msgHash);
        address recovered = ECDSA.recover(ethSigned, v, r, s);
        if (recovered != buyer) revert BadSig();

        nonces[buyer] = nonce + 1;
        _buy(buyer, ozWei);
    }

    // ===== OPTION 1 FINAL: permit + relayed buy (0 ETH for user) =====
    // User signs:
    //  1) BuySig: message hash for BLOCKSWAP_BUY_OZ
    //  2) PermitSig: EIP-2612 permit for USDC -> spender = address(this)
    function buyOzRelayedWithPermit(
        address buyer,
        uint256 ozWei,
        BuySig calldata buySig,
        PermitSig calldata permitSig
    ) external nonReentrant {
        if (msg.sender != relayer) revert NotRelayer();
        if (buyer == address(0)) revert ZeroBuyer();

        // verify buy signature (and deadline inside)
        uint256 nonce = _verifyBuySig(buyer, ozWei, buySig);

        // permit deadline
        if (block.timestamp > permitSig.deadline) revert Expired();

        // consume nonce BEFORE external call (safer)
        nonces[buyer] = nonce + 1;

        // permit USDC for this contract
        IERC20Permit(address(USDC)).permit(
            buyer,
            address(this),
            permitSig.value,
            permitSig.deadline,
            permitSig.v,
            permitSig.r,
            permitSig.s
        );

        _buy(buyer, ozWei);
    }

    function _buy(address buyer, uint256 ozWei) internal {
        if (buyPaused) revert BuyPaused();
        _requireWholeOz(ozWei);

        uint256 inventory = OZ.balanceOf(address(this));
        if (ozWei > inventory) revert NotEnoughInventory();

        uint256 totalIn = _costRoundedUp(ozWei, sellPricePerBrick);
        uint256 floorIn = _costFloor(ozWei, buybackFloorPerBrick);
        uint256 toTreasury = totalIn > floorIn ? (totalIn - floorIn) : 0;

        if (floorIn > 0) {
            USDC.safeTransferFrom(buyer, address(this), floorIn);
            floorLiabilityUSDC += floorIn;
            emit LiabilityUpdated(floorLiabilityUSDC);
        }

        if (toTreasury > 0) {
            USDC.safeTransferFrom(buyer, theBlockTreasury, toTreasury);
        }

        OZ.safeTransfer(buyer, ozWei);
        emit Bought(buyer, ozWei, totalIn, floorIn, toTreasury);
    }

    function sellBackOz(uint256 ozWei) external nonReentrant {
        _requireWholeOz(ozWei);

        uint256 payout = _costFloor(ozWei, buybackFloorPerBrick);
        if (payout > floorLiabilityUSDC) revert LiabilityUnderflow();

        uint256 vaultBal = USDC.balanceOf(address(this));
        if (payout > vaultBal) revert VaultTooLow();

        OZ.safeTransferFrom(msg.sender, address(this), ozWei);

        floorLiabilityUSDC -= payout;
        emit LiabilityUpdated(floorLiabilityUSDC);

        USDC.safeTransfer(msg.sender, payout);
        emit SoldBack(msg.sender, ozWei, payout);
    }

    // ===== admin =====
    function setBuyPaused(bool paused) external onlyOwner {
        buyPaused = paused;
        emit BuyPausedSet(paused);
    }

    function setPrices(uint256 nextSellPerBrick, uint256 nextFloorPerBrick) external onlyOwner {
        if (nextSellPerBrick == 0 || nextFloorPerBrick == 0) revert BadConfig();
        if (nextSellPerBrick < nextFloorPerBrick) revert BadConfig();
        if (nextSellPerBrick < sellPricePerBrick) revert BadConfig();
        if (nextFloorPerBrick < buybackFloorPerBrick) revert BadConfig();

        sellPricePerBrick = nextSellPerBrick;
        buybackFloorPerBrick = nextFloorPerBrick;

        emit PricesSet(nextSellPerBrick, nextFloorPerBrick);
    }

    function setTreasury(address treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert BadConfig();
        theBlockTreasury = treasury_;
        emit TreasurySet(treasury_);
    }

    function setRelayer(address relayer_) external onlyOwner {
        if (relayer_ == address(0)) revert BadConfig();
        relayer = relayer_;
        emit RelayerSet(relayer_);
    }
}

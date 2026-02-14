// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract BlockSwapSale is Ownable2Step {
    IERC20 public immutable usdc;
    IERC20 public immutable oz;

    address public vault;    // floor funds live here
    address public treasury; // remainder funds live here
    address public relayer;  // pays gas for relayed buys

    // prices in USDC "per OZ"
    // USDC has 6 decimals. Example: $27.77 => 27_770_000
    uint256 public sellPricePerOz;   // total cost per OZ
    uint256 public floorPerOz;       // floor portion per OZ

    mapping(address => uint256) public nonces;

    event PricesSet(uint256 sellPricePerOz, uint256 floorPerOz);
    event WalletsSet(address vault, address treasury, address relayer);
    event Buy(address indexed buyer, uint256 ozAmount, uint256 totalPaid);
    event SellBack(address indexed seller, uint256 ozAmount, uint256 usdcPaid);

    error InvalidAmount();
    error BuysPaused();
    error NotRelayer();
    error BadPrices();
    error Expired();
    error BadSig();

    bool public buyPaused;

    constructor(
        address initialOwner,
        address usdc_,
        address oz_,
        address vault_,
        address treasury_,
        address relayer_,
        uint256 sellPricePerOz_,
        uint256 floorPerOz_
    ) Ownable(initialOwner) {
        usdc = IERC20(usdc_);
        oz = IERC20(oz_);
        vault = vault_;
        treasury = treasury_;
        relayer = relayer_;

        _setPrices(sellPricePerOz_, floorPerOz_);
        emit WalletsSet(vault_, treasury_, relayer_);
    }

    function setBuyPaused(bool paused) external onlyOwner {
        buyPaused = paused;
    }

    function setWallets(address vault_, address treasury_, address relayer_) external onlyOwner {
        vault = vault_;
        treasury = treasury_;
        relayer = relayer_;
        emit WalletsSet(vault_, treasury_, relayer_);
    }

    function setPrices(uint256 sellPricePerOz_, uint256 floorPerOz_) external onlyOwner {
        _setPrices(sellPricePerOz_, floorPerOz_);
    }

    function _setPrices(uint256 sellPricePerOz_, uint256 floorPerOz_) internal {
        if (sellPricePerOz_ == 0 || floorPerOz_ == 0) revert BadPrices();
        if (sellPricePerOz_ < floorPerOz_) revert BadPrices();
        sellPricePerOz = sellPricePerOz_;
        floorPerOz = floorPerOz_;
        emit PricesSet(sellPricePerOz_, floorPerOz_);
    }

    // ===== normal buy (buyer pays gas) =====
    function buy(uint256 ozAmount) external {
        _buy(msg.sender, ozAmount);
    }

    // ===== relayed buy (relayer pays gas) =====
    // buyer signs (buyer, ozAmount, nonce, deadline)
    function buyRelayed(
        address buyer,
        uint256 ozAmount,
        uint256 deadline,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        if (msg.sender != relayer) revert NotRelayer();
        if (block.timestamp > deadline) revert Expired();

        uint256 nonce = nonces[buyer];

        // Simple personal_sign style hash (keeps it easy)
        bytes32 msgHash = keccak256(abi.encodePacked(
            "BLOCKSWAP_BUY",
            buyer,
            ozAmount,
            nonce,
            deadline,
            address(this),
            block.chainid
        ));

        bytes32 ethSigned = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32",
            msgHash
        ));

        address recovered = ecrecover(ethSigned, v, r, s);
        if (recovered != buyer) revert BadSig();

        nonces[buyer] = nonce + 1;
        _buy(buyer, ozAmount);
    }

    function _buy(address buyer, uint256 ozAmount) internal {
        if (buyPaused) revert BuysPaused();
        if (ozAmount == 0) revert InvalidAmount();

        // totals in USDC (6 decimals)
        uint256 total = ozAmount * sellPricePerOz;
        uint256 floorAmt = ozAmount * floorPerOz;
        uint256 rest = total - floorAmt;

        // pull USDC from buyer
        // buyer must approve this contract for `total`
        require(usdc.transferFrom(buyer, vault, floorAmt), "USDC floor transfer failed");
        if (rest > 0) {
            require(usdc.transferFrom(buyer, treasury, rest), "USDC treasury transfer failed");
        }

        // send OZ to buyer from sale inventory
        require(oz.transfer(buyer, ozAmount * 10**18), "OZ transfer failed");

        emit Buy(buyer, ozAmount, total);
    }

    // ===== sellback (seller pays gas) =====
    function sellBack(uint256 ozAmount) external {
        if (ozAmount == 0) revert InvalidAmount();

        uint256 pay = ozAmount * floorPerOz;

        // seller sends OZ back to sale inventory
        require(oz.transferFrom(msg.sender, address(this), ozAmount * 10**18), "OZ return failed");

        // pay seller from vault
        // vault must approve THIS contract for USDC
        require(usdc.transferFrom(vault, msg.sender, pay), "Vault payment failed");

        emit SellBack(msg.sender, ozAmount, pay);
    }
}

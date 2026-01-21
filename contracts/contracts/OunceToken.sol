// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title OunceToken
/// @notice Fixed-supply ERC20 representing "Ounces" (divisible, 18 decimals).
/// @dev NO mint function exists. Supply is created once at deployment.
///      Transfers start locked, and can be permanently unlocked by the owner.
contract OunceToken is ERC20, Ownable {
    // transfers locked by default (Early Bird Special / initial distribution phase)
    bool public transfersUnlocked;

    error TransfersLocked();

    constructor(address initialOwner, uint256 totalSupplyWholeOunces)
        ERC20("The Block Ounce", "OUNCE")
        Ownable(initialOwner)
    {
        // 18 decimals standard ERC20:
        // totalSupplyWholeOunces is in whole "oz" units (e.g., 72000)
        // actual mint amount is scaled by 10^decimals()
        _mint(initialOwner, totalSupplyWholeOunces * 10 ** decimals());
        transfersUnlocked = false;
    }

    /// @notice Permanently unlock transfers. Cannot be relocked.
    function unlockTransfers() external onlyOwner {
        transfersUnlocked = true;
    }

    // ---- Transfer lock enforcement ----
    function _update(address from, address to, uint256 value) internal override {
        // Allow minting/burning always
        if (from != address(0) && to != address(0)) {
            if (!transfersUnlocked) revert TransfersLocked();
        }
        super._update(from, to, value);
    }
}

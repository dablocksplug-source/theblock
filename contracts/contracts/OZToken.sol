// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";

/**
 * @title OZToken
 * @notice Fixed-supply ERC20 representing OZ units for The Block.
 *         No mint function exists. Supply is created once at deployment.
 */
contract OZToken is ERC20, Ownable2Step {
    constructor(
        address initialOwner,
        address reserve,
        address saleInventory,
        uint256 reserveWholeOz,   // 18_000
        uint256 saleWholeOz       // 54_000
    )
        ERC20("The Block Ounce", "OZ")
        Ownable(initialOwner)
    {
        require(reserve != address(0), "reserve=0");
        require(saleInventory != address(0), "sale=0");
        require(reserveWholeOz > 0, "reserve=0");
        require(saleWholeOz > 0, "sale=0");

        _mint(reserve, reserveWholeOz * 1e18);
        _mint(saleInventory, saleWholeOz * 1e18);
    }
}

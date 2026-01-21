// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/**
 * The Block — Onchain Nicknames (Relayer Writes)
 *
 * - Users do NOT pay gas
 * - Users sign EIP-712 typed data
 * - Relayer submits tx + pays gas
 *
 * LOCKED RULE:
 * - One nickname per wallet (cannot be changed once set)
 *
 * OPTIONAL:
 * - Enforces uniqueness (no duplicate nicknames)
 */
contract NicknameRegistryRelayed is Ownable, EIP712 {
    using ECDSA for bytes32;

    // ========== CONFIG ==========
    uint256 public constant MAX_LEN = 24; // keep it short (gas + UI)
    address public relayer;               // the wallet that submits txs (can rotate)

    // ========== STORAGE ==========
    mapping(address => bytes32) private _nicknameOf;   // wallet => nickname bytes32
    mapping(bytes32 => address) private _ownerOfNick;  // nickname => wallet (uniqueness)
    mapping(address => uint256) public nonces;         // replay protection (per wallet)

    // EIP-712
    bytes32 private constant SET_TYPEHASH =
        keccak256("SetNickname(address user,bytes32 nickname,uint256 nonce,uint256 deadline)");

    // ========== ERRORS ==========
    error NotRelayer();
    error Expired();
    error BadSignature();
    error AlreadySet();
    error NickTaken();
    error BadNick();

    // ========== EVENTS ==========
    event RelayerUpdated(address indexed oldRelayer, address indexed newRelayer);
    event NicknameSet(address indexed user, bytes32 indexed nickname);

    constructor(address initialOwner, address initialRelayer)
        Ownable(initialOwner)
        EIP712("TheBlockNickname", "1")
    {
        relayer = initialRelayer;
        emit RelayerUpdated(address(0), initialRelayer);
    }

    modifier onlyRelayer() {
        if (msg.sender != relayer) revert NotRelayer();
        _;
    }

    function setRelayer(address newRelayer) external onlyOwner {
        address old = relayer;
        relayer = newRelayer;
        emit RelayerUpdated(old, newRelayer);
    }

    // ===== Reads =====
    function nicknameOf(address user) external view returns (bytes32) {
        return _nicknameOf[user];
    }

    function ownerOfNickname(bytes32 nick) external view returns (address) {
        return _ownerOfNick[nick];
    }

    // ===== Relayer write =====
    function relaySetNickname(
        address user,
        bytes32 nickname,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external onlyRelayer {
        if (block.timestamp > deadline) revert Expired();

        // one-and-done lock
        if (_nicknameOf[user] != bytes32(0)) revert AlreadySet();

        // validate nickname
        if (!_isValidNick(nickname)) revert BadNick();

        // enforce uniqueness
        if (_ownerOfNick[nickname] != address(0)) revert NickTaken();

        uint256 nonce = nonces[user];

        // EIP712 digest
        bytes32 structHash = keccak256(abi.encode(
            SET_TYPEHASH,
            user,
            nickname,
            nonce,
            deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);

        address signer = digest.recover(v, r, s);
        if (signer != user) revert BadSignature();

        // consume nonce (prevents replay)
        nonces[user] = nonce + 1;

        // store
        _nicknameOf[user] = nickname;
        _ownerOfNick[nickname] = user;

        emit NicknameSet(user, nickname);
    }

    // ===== Nickname rules =====
    // Allowed: a-z, 0-9, underscore
    // Must be 3..MAX_LEN chars
    function _isValidNick(bytes32 nick) internal pure returns (bool) {
        // count non-zero bytes up to 32
        uint256 len = 0;
        for (uint256 i = 0; i < 32; i++) {
            bytes1 c = nick[i];
            if (c == 0x00) break;
            len++;

            bool ok =
                (c >= 0x61 && c <= 0x7A) || // a-z
                (c >= 0x30 && c <= 0x39) || // 0-9
                (c == 0x5F);               // _
            if (!ok) return false;
        }

        if (len < 3) return false;
        if (len > MAX_LEN) return false;

        // must not have embedded zero then more chars (we break at first zero)
        return true;
    }
}

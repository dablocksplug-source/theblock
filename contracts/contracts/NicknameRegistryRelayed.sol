// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract NicknameRegistryRelayed is Ownable2Step {
    using Strings for uint256;

    address public relayer;
    mapping(address => string) public nicknameOf;
    mapping(address => uint256) public nonces;

    event RelayerUpdated(address relayer);
    event NicknameSet(address indexed user, string nickname);

    error NotRelayer();
    error Expired();
    error BadSig();
    error ZeroUser();
    error BadNick();

    constructor(address initialOwner, address relayer_) Ownable(initialOwner) {
        require(relayer_ != address(0), "relayer=0");
        relayer = relayer_;
        emit RelayerUpdated(relayer_);
    }

    function __version() external pure returns (string memory) {
        return "NICKNAME_RELAYED_SIG_COMPAT_2026_02_15";
    }

    function setRelayer(address r) external onlyOwner {
        require(r != address(0), "relayer=0");
        relayer = r;
        emit RelayerUpdated(r);
    }

    function _validateNick(string memory nick) internal pure {
        uint256 len = bytes(nick).length;
        if (len < 3 || len > 24) revert BadNick();
    }

    // Normalize v to 27/28 (accept 0/1/27/28 and weird values)
    function _normalizeV(uint8 v) internal pure returns (uint8) {
        if (v == 27 || v == 28) return v;
        if (v == 0 || v == 1) return uint8(v + 27);
        // if some wallet sends 29/30/etc, fold to 27/28
        return uint8(27 + (v % 2));
    }

    // Compute the canonical message hash used by your UI today
    function _nicknameMsgHash(
        address user,
        string calldata nick,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("NICKNAME_SET"),
                user,
                keccak256(bytes(nick)),
                nonce,
                deadline,
                address(this),
                block.chainid
            )
        );
    }

    // CoinBase/WC compatibility:
    // Try 3 common verification modes:
    //  1) EIP-191 eth-signed hash of bytes32 msgHash (your intended path)
    //  2) raw msgHash (eth_sign style)
    //  3) EIP-191 eth-signed hash of the ASCII hex string "0x{msgHash}" (some wallets treat 0x.. as text)
    function _verify(
        address user,
        bytes32 msgHash,
        uint8 vIn,
        bytes32 r,
        bytes32 s
    ) internal view returns (bool ok) {
        uint8 v = _normalizeV(vIn);

        // (1) Intended: personal_sign on a 32-byte value interpreted as bytes
        bytes32 ethSigned = MessageHashUtils.toEthSignedMessageHash(msgHash);
        address rec1 = ECDSA.recover(ethSigned, v, r, s);
        if (rec1 == user) return true;

        // (2) Some wallets behave like eth_sign (no prefix)
        // NOTE: This is less strict but widely used as a compatibility path.
        address rec2 = ECDSA.recover(msgHash, v, r, s);
        if (rec2 == user) return true;

        // (3) Some wallets sign the ASCII string "0x...." rather than raw bytes32.
        // Recreate that exact payload and apply EIP-191.
        // Strings.toHexString(uint256(msgHash), 32) returns "0x" + 64 lowercase hex chars (66 bytes total)
        string memory hexStr = uint256(msgHash).toHexString(32);
        bytes32 ethSignedText = MessageHashUtils.toEthSignedMessageHash(bytes(hexStr));
        address rec3 = ECDSA.recover(ethSignedText, v, r, s);
        if (rec3 == user) return true;

        return false;
    }

    // Direct (user pays gas) fallback
    function setNickname(string calldata nick) external {
        _validateNick(nick);
        nicknameOf[msg.sender] = nick;
        emit NicknameSet(msg.sender, nick);
    }

    // Gasless (relayer pays gas)
    function setNicknameRelayed(
        address user,
        string calldata nick,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (msg.sender != relayer) revert NotRelayer();
        if (block.timestamp > deadline) revert Expired();
        if (user == address(0)) revert ZeroUser();

        _validateNick(nick);

        uint256 nonce = nonces[user];
        bytes32 msgHash = _nicknameMsgHash(user, nick, nonce, deadline);

        if (!_verify(user, msgHash, v, r, s)) revert BadSig();

        nonces[user] = nonce + 1;
        nicknameOf[user] = nick;

        emit NicknameSet(user, nick);
    }
}

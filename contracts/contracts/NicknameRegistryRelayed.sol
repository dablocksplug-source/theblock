// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract NicknameRegistryRelayed is Ownable2Step {
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

    function setRelayer(address r) external onlyOwner {
        require(r != address(0), "relayer=0");
        relayer = r;
        emit RelayerUpdated(r);
    }

    function _validateNick(string memory nick) internal pure {
        uint256 len = bytes(nick).length;
        if (len < 3 || len > 24) revert BadNick();
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

        // keccak256(abi.encode(
        //   keccak256("NICKNAME_SET"),
        //   user,
        //   keccak256(bytes(nick)),
        //   nonce,
        //   deadline,
        //   address(this),
        //   chainid
        // ))
        bytes32 msgHash = keccak256(
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

        bytes32 ethSigned = MessageHashUtils.toEthSignedMessageHash(msgHash);
        address recovered = ECDSA.recover(ethSigned, v, r, s);
        if (recovered != user) revert BadSig();

        nonces[user] = nonce + 1;
        nicknameOf[user] = nick;

        emit NicknameSet(user, nick);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.21;

contract BlockNames {

    mapping(address => string) public nicknameOf;
    mapping(string => bool) public nameTaken;

    event NicknameSet(address indexed user, string nickname);

    function setNickname(string calldata nickname) external {
        require(bytes(nickname).length >= 3, "Too short");
        require(bytes(nickname).length <= 20, "Too long");
        require(bytes(nicknameOf[msg.sender]).length == 0, "Already set");
        require(!nameTaken[nickname], "Name in use");

        nicknameOf[msg.sender] = nickname;
        nameTaken[nickname] = true;

        emit NicknameSet(msg.sender, nickname);
    }

    function hasNickname(address user) external view returns (bool) {
        return bytes(nicknameOf[user]).length > 0;
    }
}

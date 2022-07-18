// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import "hardhat/console.sol";
import "./ExampleExternalContract.sol";

contract Staker {
    ExampleExternalContract public exampleExternalContract;

    // Mappings
    mapping(address => uint256) public balances;

    // State Variables
    uint256 public constant threshold = 1 ether;
    uint256 public deadline = block.timestamp + 30 seconds;

    // Events
    event Stake(address, uint256);

    // Modifiers
    modifier deadlineReached(bool requireReached) {
        uint256 timeRemaining = timeLeft();
        if (requireReached) {
            require(timeRemaining == 0, "Deadline hasn't been reached yet!");
        } else {
            require(timeRemaining > 0, "Deadline has been reached!");
        }
        _;
    }

    modifier stakeNotCompleted() {
        bool completed = exampleExternalContract.completed();
        require(!completed, "Staking process has ended!");
        _;
    }

    // Constructor
    constructor(address exampleExternalContractAddress) {
        exampleExternalContract = ExampleExternalContract(
            exampleExternalContractAddress
        );
    }

    // Function to input funds
    function stake() public payable deadlineReached(false) stakeNotCompleted {
        balances[msg.sender] += msg.value;
        emit Stake(msg.sender, msg.value);
    }

    // Function to execute the complete() function of the external contract
    function execute() public deadlineReached(false) stakeNotCompleted {
        uint256 contractBalance = address(this).balance;
        require(
            contractBalance >= threshold,
            "Minimum threshold for deposited Ether has not been reached!"
        );
        (bool sent, ) = address(exampleExternalContract).call{
            value: contractBalance
        }(abi.encodeWithSignature("complete()"));
        require(sent, "exampleExternalContract.complete failed!");
    }

    // Function to withdraw funds
    function withdraw() public deadlineReached(true) stakeNotCompleted {
        uint256 userBalance = balances[msg.sender];
        require(
            userBalance > 0,
            "There are no deposited funds to withdraw for you!"
        );
        balances[msg.sender] = 0;
        (bool sent, ) = msg.sender.call{value: userBalance}("");
        require(sent, "Failed to send user's balance back to user!");
    }

    // Function to check remaining time to stake
    function timeLeft() public view returns (uint256 timeleft) {
        if (block.timestamp >= deadline) {
            return 0;
        } else {
            return deadline - block.timestamp;
        }
    }

    receive() external payable {
        stake();
    }
}

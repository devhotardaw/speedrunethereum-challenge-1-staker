const { ethers } = require("hardhat")
const { use, expect } = require("chai")
const { solidity } = require("ethereum-waffle")

use(solidity)

// Increment time/block number method for multi-stage tests:
const increaseWorldTimeInSeconds = async (seconds, mine = false) => {
    await ethers.provider.send("evm_increaseTime", [seconds])
    if (mine) {
        await ethers.provider.send("evm_mine", [])
    }
}

describe("Staker test", function () {
    let addr1
    let exampleExternalContract, stakerContract, ExampleExternalContract

    beforeEach(async () => {
        ;[addr1] = await ethers.getSigners()

        // Deploy ExampleExternalContract contract:
        ExampleExternalContract = await ethers.getContractFactory("ExampleExternalContract")
        exampleExternalContract = await ExampleExternalContract.deploy()
        // Deploy Staker contract:
        StakerContract = await ethers.getContractFactory("Staker")
        stakerContract = await StakerContract.deploy(exampleExternalContract.address)
    })

    describe("Test of Staker contract's utils methods", () => {
        it("timeLeft() returns 0 after deadline", async () => {
            await increaseWorldTimeInSeconds(180, true)
            const timeLeft = await stakerContract.timeLeft()
            expect(timeLeft).to.equal(0)
        })
    })

    describe("Tests for stake() method", () => {
        it("Emits 'Stake' event", async () => {
            const amount = ethers.utils.parseEther("0.5")
            await expect(stakerContract.connect(addr1).stake({ value: amount }))
                .to.emit(stakerContract, "Stake")
                .withArgs(addr1.address, amount)

            // Check contract balance after staking
            const contractBalance = await ethers.provider.getBalance(stakerContract.address)
            expect(contractBalance).to.equal(amount)

            // Check that the balances array has stored the correct amount
            const addr1Balance = await stakerContract.balances(addr1.address)
            expect(addr1Balance).to.equal(amount)
        })

        it("Stakes 0.5e for a single user", async () => {
            const amount = ethers.utils.parseEther("0.5")
            const tx = await stakerContract.connect(addr1).stake({ value: amount })
            await tx.wait(1)

            // Check contract balance after staking
            const contractBalance = await ethers.provider.getBalance(stakerContract.address)
            expect(contractBalance).to.equal(amount)

            // Check that the balances array has stored the correct amount
            const addr1Balance = await stakerContract.balances(addr1.address)
            expect(addr1Balance).to.equal(amount)
        })

        it("Reverts stake() if deadline has been reached", async () => {
            // Set deadline to reached
            await increaseWorldTimeInSeconds(180, true)

            const amount = ethers.utils.parseEther("0.5")
            await expect(stakerContract.connect(addr1).stake({ value: amount })).to.be.revertedWith(
                "Deadline has been reached!"
            )
        })

        it("Reverts stake() if external contract has been set to 'completed'", async () => {
            const amount = ethers.utils.parseEther("1")
            // Complete staking process
            const txStake = await stakerContract.connect(addr1).stake({ value: amount })
            await txStake.wait(1)

            const txExecute = await stakerContract.connect(addr1).execute()
            await txExecute.wait(1)

            await expect(stakerContract.connect(addr1).stake({ value: amount })).to.be.revertedWith(
                "Staking process has ended!"
            )
        })
    })

    describe("Tests for execute() method", () => {
        it("Reverts execute() if required stake threshold hasn't been reached", async () => {
            await expect(stakerContract.connect(addr1).execute()).to.be.revertedWith(
                "Minimum threshold for deposited Ether has not been reached!"
            )
        })

        it("Reverts execute() if external contract has been set to 'completed'", async () => {
            const amount = ethers.utils.parseEther("1")
            await stakerContract.connect(addr1).stake({ value: amount })
            await stakerContract.connect(addr1).execute()

            await expect(stakerContract.connect(addr1).execute()).to.be.revertedWith(
                "Staking process has ended!"
            )
        })

        it("Reverts execute() if deadline has been reached", async () => {
            await increaseWorldTimeInSeconds(180, true)

            await expect(stakerContract.connect(addr1).execute()).to.be.revertedWith(
                "Deadline has been reached!"
            )
        })

        it("Successfully sets external contract to 'completed'", async () => {
            const amount = ethers.utils.parseEther("1")
            await stakerContract.connect(addr1).stake({ value: amount })
            await stakerContract.connect(addr1).execute()
            // Checks that external contract has been 'completed'
            const completed = await exampleExternalContract.completed()
            expect(completed).to.equal(true)
            // Check that the external contract has received the staker contract's balance
            const externalContractBalance = await ethers.provider.getBalance(
                exampleExternalContract.address
            )
            expect(externalContractBalance).to.equal(amount)
            // Check that the staking contract's balance has been updated to 0
            const stakerContractBalance = await ethers.provider.getBalance(stakerContract.address)
            expect(stakerContractBalance).to.equal(0)
        })
    })

    describe("Tests for withdraw() method", () => {
        it("Reverts withdraw() if deadline hasn't been reached", async () => {
            await expect(stakerContract.connect(addr1).withdraw()).to.be.revertedWith(
                "Deadline hasn't been reached yet!"
            )
        })

        it("Reverts withdraw() if external contract has been set to 'completed'", async () => {
            const amount = ethers.utils.parseEther("1")
            const txStake = await stakerContract.connect(addr1).stake({ value: amount })
            await txStake.wait()

            const txExecute = await stakerContract.connect(addr1).execute()
            await txExecute.wait()

            await increaseWorldTimeInSeconds(180, true)

            await expect(stakerContract.connect(addr1).withdraw()).to.be.revertedWith(
                "Staking process has ended!"
            )
        })

        it("Reverts withdraw() if caller address has 0 balance", async () => {
            await increaseWorldTimeInSeconds(180, true)
            await expect(stakerContract.connect(addr1).withdraw()).to.be.revertedWith(
                "There are no deposited funds to withdraw for you!"
            )
        })

        it("Successfully withdraws user balance", async () => {
            const amount = ethers.utils.parseEther("1")
            const txStake = await stakerContract.connect(addr1).stake({ value: amount })
            await txStake.wait()

            await increaseWorldTimeInSeconds(180, true)

            const txWithdraw = await stakerContract.connect(addr1).withdraw()
            await txWithdraw.wait()

            const contractBalance = await ethers.provider.getBalance(stakerContract.address)
            expect(contractBalance).to.equal(0)

            await expect(txWithdraw).to.changeEtherBalance(addr1, amount)
        })
    })
})

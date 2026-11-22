// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentEscrow} from "../contracts/AgentEscrow.sol";

contract AgentEscrowTest is Test {
    AgentEscrow internal escrow;
    address internal buyer = address(0xB0B);
    address internal seller = address(0x5E11);

    function setUp() public {
        escrow = new AgentEscrow();
        vm.deal(buyer, 10 ether);
        vm.deal(seller, 1 ether);
    }

    function _create() internal returns (uint256 id) {
        vm.prank(buyer);
        id = escrow.createJob{value: 2 ether}(
            seller,
            uint64(block.timestamp + 1 days),
            "Fetch the current HSK block height and hash as JSON"
        );
    }

    function test_CreateEscrowsFunds() public {
        uint256 id = _create();
        (address b, address s, uint256 amount, , , , AgentEscrow.JobState state) =
            escrow.jobs(id);
        assertEq(b, buyer);
        assertEq(s, seller);
        assertEq(amount, 2 ether);
        assertEq(uint256(state), uint256(AgentEscrow.JobState.Open));
        assertEq(address(escrow).balance, 2 ether);
    }

    function test_FullFlowReleasesToSeller() public {
        uint256 id = _create();
        bytes32 proof = keccak256(abi.encodePacked("{\"block\":123}"));

        vm.prank(seller);
        escrow.submitProof(id, proof);

        uint256 before = seller.balance;
        vm.prank(buyer);
        escrow.release(id, "hsp-mandate-001");

        assertEq(seller.balance, before + 2 ether);
        (, , , , bytes32 storedProof, string memory ref, AgentEscrow.JobState state) =
            escrow.jobs(id);
        assertEq(storedProof, proof);
        assertEq(ref, "hsp-mandate-001");
        assertEq(uint256(state), uint256(AgentEscrow.JobState.Released));
    }

    function test_RefundAfterDeadline() public {
        uint256 id = _create();
        vm.warp(block.timestamp + 2 days);
        uint256 before = buyer.balance;
        vm.prank(buyer);
        escrow.refund(id);
        assertEq(buyer.balance, before + 2 ether);
    }

    function test_RefundTooEarlyReverts() public {
        uint256 id = _create();
        vm.prank(buyer);
        vm.expectRevert(AgentEscrow.TooEarly.selector);
        escrow.refund(id);
    }

    function test_ReleaseBeforeProofReverts() public {
        uint256 id = _create();
        vm.prank(buyer);
        vm.expectRevert(AgentEscrow.WrongState.selector);
        escrow.release(id, "");
    }

    function test_OnlySellerSubmitsProof() public {
        uint256 id = _create();
        vm.prank(buyer);
        vm.expectRevert(AgentEscrow.NotSeller.selector);
        escrow.submitProof(id, bytes32(uint256(1)));
    }

    function test_OnlyBuyerReleases() public {
        uint256 id = _create();
        vm.prank(seller);
        escrow.submitProof(id, bytes32(uint256(1)));
        vm.prank(seller);
        vm.expectRevert(AgentEscrow.NotBuyer.selector);
        escrow.release(id, "");
    }

    function test_CreateNeedsValueAndFutureDeadline() public {
        vm.prank(buyer);
        vm.expectRevert(AgentEscrow.NoValue.selector);
        escrow.createJob(seller, uint64(block.timestamp + 1 days), "x");

        vm.prank(buyer);
        vm.expectRevert(AgentEscrow.BadDeadline.selector);
        escrow.createJob{value: 1 ether}(seller, uint64(block.timestamp), "x");
    }
}

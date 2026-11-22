// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title AgentEscrow — escrow for agent-to-agent jobs on HashKey Chain
/// @notice A buyer agent escrows native HSK for a job. The seller agent does
///         the work off-chain and submits a proof hash. The buyer verifies the
///         proof off-chain (the proof is data anyone can re-fetch and re-hash)
///         and releases the payment, optionally referencing the HSP payment
///         mandate that authorised the spend. If the deadline passes without
///         an accepted delivery, the buyer can reclaim the escrow.
contract AgentEscrow {
    enum JobState {
        Open, // funded, waiting for delivery
        Delivered, // seller submitted a proof, waiting for buyer
        Released, // paid to seller (terminal)
        Refunded // returned to buyer (terminal)
    }

    struct Job {
        address buyer;
        address seller;
        uint256 amount;
        uint64 deadline; // unix seconds; refund opens after this
        bytes32 proofHash; // hash of the delivered work (0 until delivered)
        string hspMandateRef; // HSP payment mandate reference (may be empty)
        JobState state;
    }

    uint256 public nextJobId = 1;
    mapping(uint256 => Job) public jobs;

    event JobCreated(
        uint256 indexed jobId,
        address indexed buyer,
        address indexed seller,
        uint256 amount,
        uint64 deadline,
        string terms
    );
    event ProofSubmitted(uint256 indexed jobId, bytes32 proofHash);
    event PaymentReleased(
        uint256 indexed jobId,
        address indexed seller,
        uint256 amount,
        string hspMandateRef
    );
    event PaymentRefunded(uint256 indexed jobId, address indexed buyer, uint256 amount);

    error JobMissing();
    error WrongState();
    error NotBuyer();
    error NotSeller();
    error NoValue();
    error BadDeadline();
    error TooEarly();

    /// @notice Create and fund a job. The full amount is escrowed in HSK.
    /// @param seller the agent that will do the work
    /// @param deadline unix time after which the buyer may refund if undelivered
    /// @param terms short public description of the job terms (kept in the event log)
    function createJob(address seller, uint64 deadline, string calldata terms)
        external
        payable
        returns (uint256 jobId)
    {
        if (msg.value == 0) revert NoValue();
        if (seller == address(0) || seller == msg.sender) revert BadDeadline();
        if (deadline <= block.timestamp) revert BadDeadline();

        jobId = nextJobId++;
        jobs[jobId] = Job({
            buyer: msg.sender,
            seller: seller,
            amount: msg.value,
            deadline: deadline,
            proofHash: bytes32(0),
            hspMandateRef: "",
            state: JobState.Open
        });
        emit JobCreated(jobId, msg.sender, seller, msg.value, deadline, terms);
    }

    /// @notice Seller marks the job delivered with the hash of the work product.
    function submitProof(uint256 jobId, bytes32 proofHash) external {
        Job storage job = jobs[jobId];
        if (job.buyer == address(0)) revert JobMissing();
        if (msg.sender != job.seller) revert NotSeller();
        if (job.state != JobState.Open) revert WrongState();
        job.proofHash = proofHash;
        job.state = JobState.Delivered;
        emit ProofSubmitted(jobId, proofHash);
    }

    /// @notice Buyer releases the escrow to the seller after verifying the proof.
    /// @param hspMandateRef the HSP payment mandate reference authorising this
    ///        payment (empty string when the buyer pays without HSP).
    function release(uint256 jobId, string calldata hspMandateRef) external {
        Job storage job = jobs[jobId];
        if (job.buyer == address(0)) revert JobMissing();
        if (msg.sender != job.buyer) revert NotBuyer();
        if (job.state != JobState.Delivered) revert WrongState();
        job.state = JobState.Released;
        job.hspMandateRef = hspMandateRef;
        uint256 amount = job.amount;
        job.amount = 0;
        emit PaymentReleased(jobId, job.seller, amount, hspMandateRef);
        (bool ok, ) = job.seller.call{value: amount}("");
        require(ok, "transfer failed");
    }

    /// @notice Buyer reclaims the escrow once the deadline passed undelivered,
    ///         or after delivery if the proof never verifies (same deadline rule:
    ///         a delivered job can still be refunded after its deadline, which is
    ///         the buyer's protection against a proof that does not check out).
    function refund(uint256 jobId) external {
        Job storage job = jobs[jobId];
        if (job.buyer == address(0)) revert JobMissing();
        if (msg.sender != job.buyer) revert NotBuyer();
        if (job.state != JobState.Open && job.state != JobState.Delivered) {
            revert WrongState();
        }
        if (block.timestamp < job.deadline) revert TooEarly();
        job.state = JobState.Refunded;
        uint256 amount = job.amount;
        job.amount = 0;
        emit PaymentRefunded(jobId, job.buyer, amount);
        (bool ok, ) = job.buyer.call{value: amount}("");
        require(ok, "transfer failed");
    }
}

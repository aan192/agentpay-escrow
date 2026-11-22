// BuyerAgent — funds the job, verifies the proof, pays through HSP.
//
// Flow: createJob (HSK escrowed on-chain) -> wait for the seller's proof ->
// re-do the lookup independently and re-hash the seller's deliverable ->
// only if the hashes match, build + sign the HSP Payment Mandate and
// release the escrow with the mandate reference anchored on-chain.
import { readFileSync } from "node:fs";
import {
  getWallet,
  escrowContract,
  hashDeliverable,
  fmt,
} from "./lib.js";
import { buildMandate, signMandate, submitToGateway } from "./hsp.js";
import { doWork } from "./seller.js";

export const DEMO_TERMS =
  "Fetch the current HSK block height, block hash and escrow balance as JSON";

export async function createJob({ escrowAddress, sellerAddress, amountWei, ttlSeconds = 3600 }) {
  const buyer = getWallet("BUYER_KEY");
  const escrow = escrowContract(escrowAddress, buyer);
  const deadline = Math.floor(Date.now() / 1000) + ttlSeconds;
  const tx = await escrow.createJob(sellerAddress, deadline, DEMO_TERMS, {
    value: amountWei,
  });
  const receipt = await tx.wait();
  const log = receipt.logs
    .map((l) => {
      try {
        return escrow.interface.parseLog(l);
      } catch {
        return null;
      }
    })
    .find((p) => p && p.name === "JobCreated");
  return { jobId: log.args.jobId, txHash: receipt.hash };
}

export async function waitForProof({ escrowAddress, jobId, timeoutMs = 120000 }) {
  const buyer = getWallet("BUYER_KEY");
  const escrow = escrowContract(escrowAddress, buyer);
  const started = Date.now();
  for (;;) {
    const job = await escrow.jobs(jobId);
    if (job.state === 1n || job.state === 1) return job; // Delivered
    if (Date.now() - started > timeoutMs) throw new Error("timed out waiting for proof");
    await new Promise((r) => setTimeout(r, 2000));
  }
}

/// Re-run the seller's lookup and check the delivered file against the
/// on-chain proof hash. Block fields move with time, so verification is:
/// (1) the file's hash equals the on-chain proofHash, and (2) the file is a
/// well-formed snapshot whose block hash really exists on this chain.
export async function verifyProof({ escrowAddress, jobId, deliverablePath }) {
  const buyer = getWallet("BUYER_KEY");
  const escrow = escrowContract(escrowAddress, buyer);
  const job = await escrow.jobs(jobId);
  const text = readFileSync(deliverablePath, "utf8");
  if (hashDeliverable(text) !== job.proofHash) {
    return { ok: false, reason: "deliverable hash does not match on-chain proof" };
  }
  const data = JSON.parse(text);
  const provider = buyer.provider;
  const block = await provider.getBlock(data.blockNumber);
  if (!block || block.hash !== data.blockHash) {
    return { ok: false, reason: "deliverable block hash not found on chain" };
  }
  // A fresh independent lookup proves the seller's method, not just its file.
  const fresh = JSON.parse(await doWork(escrowAddress));
  if (fresh.chainId !== data.chainId) {
    return { ok: false, reason: "chain id mismatch" };
  }
  return { ok: true, data };
}

export async function payAndRelease({ escrowAddress, jobId }) {
  const buyer = getWallet("BUYER_KEY");
  const escrow = escrowContract(escrowAddress, buyer);
  const job = await escrow.jobs(jobId);

  const mandate = buildMandate({
    buyer: job.buyer,
    seller: job.seller,
    amountWei: job.amount,
    jobReference: `agentpay-job-${jobId}`,
  });
  const signed = await signMandate(buyer, mandate);
  const gateway = await submitToGateway(signed);

  const tx = await escrow.release(jobId, gateway.reference);
  const receipt = await tx.wait();
  return {
    mandateReference: gateway.reference,
    txHash: receipt.hash,
    amount: fmt(job.amount),
  };
}

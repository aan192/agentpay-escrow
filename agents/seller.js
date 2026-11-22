// SellerAgent — does the job and submits the proof.
//
// The demo job is a live chain-data lookup: read the current block number,
// block hash and the escrow balance from the very chain the escrow lives on,
// and deliver them as JSON. The buyer can re-run the same lookup and re-hash
// the deliverable to verify the proof — the work is small on purpose, so the
// payment flow (escrow + HSP mandate) stays the star of the demo.
import { writeFileSync } from "node:fs";
import { getProvider, getWallet, escrowContract, hashDeliverable } from "./lib.js";

export async function doWork(escrowAddress) {
  const provider = getProvider();
  const block = await provider.getBlock("latest");
  const escrowBalance = await provider.getBalance(escrowAddress);
  const deliverable = {
    service: "hsk-chain-snapshot",
    chainId: Number((await provider.getNetwork()).chainId),
    blockNumber: block.number,
    blockHash: block.hash,
    blockTimestamp: block.timestamp,
    escrowAddress,
    escrowBalanceWei: escrowBalance.toString(),
  };
  return JSON.stringify(deliverable, null, 2);
}

export async function runSeller({ escrowAddress, jobId, outPath }) {
  const seller = getWallet("SELLER_KEY");
  const escrow = escrowContract(escrowAddress, seller);

  const text = await doWork(escrowAddress);
  writeFileSync(outPath, text);
  const proofHash = hashDeliverable(text);

  const tx = await escrow.submitProof(jobId, proofHash);
  const receipt = await tx.wait();
  return { proofHash, txHash: receipt.hash, deliverablePath: outPath };
}

// CLI: SELLER_KEY=... node seller.js <escrowAddress> <jobId> [outPath]
if (import.meta.url === `file://${process.argv[1]}`) {
  const [escrowAddress, jobId, outPath = "deliverable.json"] = process.argv.slice(2);
  const r = await runSeller({ escrowAddress, jobId: BigInt(jobId), outPath });
  console.log(JSON.stringify(r, null, 2));
}

// Live testnet run against the deployed AgentEscrow on HSKChain Testnet.
// Env: BUYER_KEY, SELLER_KEY, ESCROW_ADDRESS, JOB_AMOUNT_WEI (default 0.01 HSK)
import { ethers } from "ethers";
import { getProvider, getWallet, fmt } from "./lib.js";
import { createJob, waitForProof, verifyProof, payAndRelease } from "./buyer.js";
import { runSeller } from "./seller.js";

const escrowAddress = process.env.ESCROW_ADDRESS;
if (!escrowAddress) throw new Error("missing ESCROW_ADDRESS");
const amount = BigInt(process.env.JOB_AMOUNT_WEI || ethers.parseEther("0.01"));

const provider = getProvider();
const buyer = getWallet("BUYER_KEY");
const seller = getWallet("SELLER_KEY");

console.log("network chainId:", Number((await provider.getNetwork()).chainId));
console.log("escrow:", escrowAddress);
const sellerBefore = await provider.getBalance(seller.address);
console.log("seller balance before:", fmt(sellerBefore));

const { jobId, txHash } = await createJob({
  escrowAddress,
  sellerAddress: seller.address,
  amountWei: amount,
});
console.log(`job #${jobId} created (tx ${txHash}) — ${fmt(amount)} escrowed`);

const outPath = new URL("./deliverable-testnet.json", import.meta.url).pathname;
const sold = await runSeller({ escrowAddress, jobId, outPath });
console.log("seller proof:", sold.proofHash, `(tx ${sold.txHash})`);

await waitForProof({ escrowAddress, jobId });
const verdict = await verifyProof({ escrowAddress, jobId, deliverablePath: outPath });
console.log("buyer verification:", verdict.ok ? "PROOF OK" : `REJECTED — ${verdict.reason}`);
if (!verdict.ok) process.exit(1);

const paid = await payAndRelease({ escrowAddress, jobId });
console.log(`released ${paid.amount} with HSP mandate ${paid.mandateReference} (tx ${paid.txHash})`);

const sellerAfter = await provider.getBalance(seller.address);
console.log("seller balance after:", fmt(sellerAfter));
console.log("seller received (net of own gas):", fmt(sellerAfter - sellerBefore));

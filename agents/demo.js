// End-to-end demo on a local chain (anvil):
// deploy escrow -> buyer funds a job -> seller does the work and submits a
// proof -> buyer verifies the proof independently -> buyer signs the HSP
// payment mandate -> escrow releases -> balances before/after prove payment.
//
// Run:  anvil (in another shell)
//       BUYER_KEY=<anvil0> SELLER_KEY=<anvil1> node agents/demo.js
import { readFileSync } from "node:fs";
import { ethers } from "ethers";
import { getProvider, getWallet, fmt } from "./lib.js";
import { createJob, waitForProof, verifyProof, payAndRelease } from "./buyer.js";
import { runSeller } from "./seller.js";

const provider = getProvider();
const buyer = getWallet("BUYER_KEY");
const seller = getWallet("SELLER_KEY");

console.log("== AgentPay Escrow demo ==");
console.log("buyer :", buyer.address);
console.log("seller:", seller.address);

const artifact = JSON.parse(
  readFileSync(new URL("../out/AgentEscrow.sol/AgentEscrow.json", import.meta.url))
);
const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode.object, buyer);
const escrow = await factory.deploy();
await escrow.waitForDeployment();
const escrowAddress = await escrow.getAddress();
console.log("escrow deployed:", escrowAddress);

const sellerBefore = await provider.getBalance(seller.address);
console.log("seller balance before:", fmt(sellerBefore));

const amount = ethers.parseEther("0.5");
const { jobId, txHash: createTx } = await createJob({
  escrowAddress,
  sellerAddress: seller.address,
  amountWei: amount,
});
console.log(`job #${jobId} created (tx ${createTx}) — ${fmt(amount)} escrowed`);

const sold = await runSeller({
  escrowAddress,
  jobId,
  outPath: new URL("./deliverable.json", import.meta.url).pathname,
});
console.log("seller delivered, proof:", sold.proofHash, `(tx ${sold.txHash})`);

await waitForProof({ escrowAddress, jobId });
const verdict = await verifyProof({
  escrowAddress,
  jobId,
  deliverablePath: new URL("./deliverable.json", import.meta.url).pathname,
});
console.log("buyer verification:", verdict.ok ? "PROOF OK" : `REJECTED — ${verdict.reason}`);
if (!verdict.ok) process.exit(1);

const paid = await payAndRelease({ escrowAddress, jobId });
console.log(`released ${paid.amount} with HSP mandate ${paid.mandateReference} (tx ${paid.txHash})`);

const sellerAfter = await provider.getBalance(seller.address);
console.log("seller balance after: ", fmt(sellerAfter));
console.log("seller received:      ", fmt(sellerAfter - sellerBefore));
console.log("== demo complete ==");

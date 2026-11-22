// HSP (HashKey Settlement Platform) payment-mandate module.
//
// The documented HSP Agentic Payment flow is:
//   1. The receiving (seller) agent publishes its payment terms.
//   2. The paying (buyer) agent creates a Payment Mandate from those terms.
//   3. The buyer wallet signs the mandate.
//   4. HSP's Gateway verifies the signed mandate and executes the payment.
//
// Steps 2-3 are implemented here for real: the mandate is a structured
// document and the buyer signs it with EIP-712 typed data, which is the
// signature the Gateway verifies. Step 4 (the Gateway call) is isolated in
// `submitToGateway` so the live HSP endpoint can be dropped in when merchant
// API access is provisioned; in the demo it records the signed mandate and
// returns its reference, which the buyer then anchors on-chain in the
// escrow's release() call.
import { ethers } from "ethers";

const MANDATE_TYPES = {
  PaymentMandate: [
    { name: "mandateId", type: "string" },
    { name: "buyer", type: "address" },
    { name: "seller", type: "address" },
    { name: "amountWei", type: "uint256" },
    { name: "asset", type: "string" },
    { name: "jobReference", type: "string" },
    { name: "expiresAt", type: "uint64" },
  ],
};

export function mandateDomain(chainId) {
  return {
    name: "HSP Agentic Payment",
    version: "1",
    chainId,
    verifyingContract: ethers.ZeroAddress,
  };
}

/// Build the mandate document from the seller's payment terms.
export function buildMandate({ buyer, seller, amountWei, jobReference }) {
  return {
    mandateId: `hsp-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    buyer,
    seller,
    amountWei: amountWei.toString(),
    asset: "HSK",
    jobReference,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
  };
}

/// The buyer wallet signs the mandate (EIP-712). This signature is what the
/// HSP Gateway verifies before executing the payment.
export async function signMandate(buyerWallet, mandate) {
  const chainId = (await buyerWallet.provider.getNetwork()).chainId;
  const signature = await buyerWallet.signTypedData(
    mandateDomain(Number(chainId)),
    MANDATE_TYPES,
    {
      ...mandate,
      amountWei: BigInt(mandate.amountWei),
      expiresAt: BigInt(mandate.expiresAt),
    }
  );
  return { mandate, signature };
}

/// Verify a signed mandate locally (the same check the Gateway performs:
/// the recovered signer must be the mandate's buyer).
export function verifyMandate({ mandate, signature }, chainId) {
  const recovered = ethers.verifyTypedData(
    mandateDomain(chainId),
    MANDATE_TYPES,
    {
      ...mandate,
      amountWei: BigInt(mandate.amountWei),
      expiresAt: BigInt(mandate.expiresAt),
    },
    signature
  );
  return recovered.toLowerCase() === mandate.buyer.toLowerCase();
}

/// Gateway submission point. With live HSP merchant credentials this POSTs
/// the signed mandate to the HSP Gateway, which executes the on-chain
/// payment and returns its own reference. In the demo environment it
/// returns the mandate id as the reference, and the escrow release anchors
/// that reference on-chain.
export async function submitToGateway(signedMandate) {
  return { reference: signedMandate.mandate.mandateId, status: "signed" };
}

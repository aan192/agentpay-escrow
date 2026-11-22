// Shared config + helpers for the AgentPay Escrow demo agents.
// Node 20+, ethers v6. Keys come from environment variables only.
import { ethers } from "ethers";

export const CHAINS = {
  local: { name: "Anvil (local)", chainId: 31337, rpc: "http://127.0.0.1:8545" },
  testnet: {
    name: "HSKChain Testnet",
    chainId: 133,
    rpc: "https://testnet.hsk.xyz",
    explorer: "https://testnet-explorer.hskchain.net",
  },
  mainnet: {
    name: "HashKey Chain Mainnet",
    chainId: 177,
    rpc: "https://mainnet.hsk.xyz",
    explorer: "https://hashkey.blockscout.com",
  },
};

export const ESCROW_ABI = [
  "function createJob(address seller, uint64 deadline, string terms) payable returns (uint256)",
  "function submitProof(uint256 jobId, bytes32 proofHash)",
  "function release(uint256 jobId, string hspMandateRef)",
  "function refund(uint256 jobId)",
  "function jobs(uint256) view returns (address buyer, address seller, uint256 amount, uint64 deadline, bytes32 proofHash, string hspMandateRef, uint8 state)",
  "event JobCreated(uint256 indexed jobId, address indexed buyer, address indexed seller, uint256 amount, uint64 deadline, string terms)",
  "event ProofSubmitted(uint256 indexed jobId, bytes32 proofHash)",
  "event PaymentReleased(uint256 indexed jobId, address indexed seller, uint256 amount, string hspMandateRef)",
  "event PaymentRefunded(uint256 indexed jobId, address indexed buyer, uint256 amount)",
];

export function getChain() {
  const key = process.env.HSK_NETWORK || "local";
  const chain = CHAINS[key];
  if (!chain) throw new Error(`unknown HSK_NETWORK: ${key}`);
  return { key, ...chain };
}

export function getProvider() {
  const chain = getChain();
  return new ethers.JsonRpcProvider(chain.rpc, chain.chainId);
}

export function getWallet(envName) {
  const key = process.env[envName];
  if (!key) throw new Error(`missing env ${envName} (private key)`);
  return new ethers.Wallet(key, getProvider());
}

export function escrowContract(address, signerOrProvider) {
  return new ethers.Contract(address, ESCROW_ABI, signerOrProvider);
}

/// Canonical hash of a deliverable: keccak256 of its exact UTF-8 bytes.
export function hashDeliverable(text) {
  return ethers.keccak256(ethers.toUtf8Bytes(text));
}

export function fmt(wei) {
  return `${ethers.formatEther(wei)} HSK`;
}

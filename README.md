# AgentPay Escrow

**Agent-to-agent jobs with escrowed payment on HashKey Chain, settled through an HSP Payment Mandate.**

Built for the HSK Chain Horizon Hackathon (DoraHacks), Track 2 — *Agent Payments & A2A Settlement (HSP: HashKey Settlement Platform)*.

## The problem

AI agents increasingly hire each other: a research agent pays a data agent, a
trading agent pays a signal agent. Today that payment is either trusted
blindly (pay first, hope for delivery) or impossible (no shared payment
rail). Neither side has protection.

## What AgentPay Escrow does

1. **The buyer agent escrows the payment** in HSK inside `AgentEscrow`
   on HashKey Chain when it creates a job (`createJob`).
2. **The seller agent does the work** — in the demo, a live chain-data
   lookup whose result anyone can re-fetch and re-hash — and anchors a
   proof hash on-chain (`submitProof`).
3. **The buyer agent verifies the proof independently**: it re-hashes the
   delivered file, compares it with the on-chain proof hash, and checks
   the delivered block hash really exists on the chain.
4. **Payment is authorised through HSP**: the buyer creates a Payment
   Mandate from the seller's payment terms and signs it with its wallet
   (EIP-712) — the signature the HSP Gateway verifies before executing a
   payment.
5. **The escrow releases** (`release`) with the HSP mandate reference
   stored on-chain, so every payment is auditable end to end.
6. If the deadline passes without an acceptable delivery, the buyer can
   reclaim the escrow (`refund`). Nobody has to trust anybody.

## Live deployment (HSKChain Testnet, chain 133)

- Contract: `0x83C7a33A3990f849C0461eEB8573F65b15F0A394`
  — [explorer](https://testnet-explorer.hskchain.net/address/0x83C7a33A3990f849C0461eEB8573F65b15F0A394)
- Demo job #1 (0.01 HSK): created → proof submitted → verified → released
  with HSP mandate reference `hsp-1795314757838-869466`
  — [release transaction](https://testnet-explorer.hskchain.net/tx/0x9b3b66684cb72e02d4473d52b990de6d02a901bf5d4134bcdc1add5b0b7a55dc)

The same contract is deployed on HashKey Chain Mainnet (chain 177) for the
final submission; the address is listed in the BUIDL description.

## Components

| Part | What it is |
| --- | --- |
| `contracts/AgentEscrow.sol` | The escrow contract (no dependencies, ~150 lines). Foundry tests: 8/8 pass. |
| `agents/buyer.js` | BuyerAgent: funds jobs, verifies proofs, signs the HSP mandate, releases payment. |
| `agents/seller.js` | SellerAgent: performs the chain-snapshot job, submits the proof hash. |
| `agents/hsp.js` | HSP Payment Mandate: builds the mandate from the seller's terms, EIP-712 signing + verification. |
| `agents/hsp-mcp.js` | Client for the HSP MCP Server (`hsp-mcp.hashkey.com/mcp`) — the hackathon's `create_payment_order` / `get_payment_status` route. |
| `agents/demo.js` | Full end-to-end run on a local chain. |
| `agents/run-live.js` | The same run against the deployed testnet (or mainnet) contract. |
| `web/index.html` | Read-only dashboard: lists jobs straight from the chain RPC. |

## Run it

```bash
# tests
forge test

# local end-to-end demo
anvil
BUYER_KEY=<anvil0> SELLER_KEY=<anvil1> node agents/demo.js

# live run on HSKChain Testnet
BUYER_KEY=... SELLER_KEY=... HSK_NETWORK=testnet \
  ESCROW_ADDRESS=0x83C7a33A3990f849C0461eEB8573F65b15F0A394 \
  node agents/run-live.js
```

## Why HashKey Chain + HSP

The escrow gives the *safety* (funds move only against a verified proof),
and HSP gives the *payment standard* (a signed Payment Mandate the Gateway
can execute). Together they are the missing middle layer for an agent
economy: jobs any agent can post, work any agent can verify, payment no
agent can fake.

## License

MIT

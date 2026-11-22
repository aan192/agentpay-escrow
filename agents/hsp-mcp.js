// Minimal MCP (streamable HTTP) client for the HSP MCP Server.
// The hackathon guide: agents do NOT call the HSP API directly — the MCP
// server at https://hsp-mcp.hashkey.com/mcp handles all HSP interactions
// with a preconfigured test merchant app_id.
// Tools: create_payment_order, get_payment_status, get_chain_tokens,
// generate_payment_url, get_payment_mandate_details,
// get_transaction_details, get_payment_summary.
const MCP_URL = process.env.HSP_MCP_URL || "https://hsp-mcp.hashkey.com/mcp";

export class HspMcpClient {
  constructor() {
    this.sessionId = null;
    this.nextId = 1;
  }

  async #post(body) {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    const res = await fetch(MCP_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    const text = await res.text();
    if (!res.ok) throw new Error(`HSP MCP HTTP ${res.status}: ${text.slice(0, 300)}`);
    if (!text.trim()) return null;
    // Streamable HTTP may answer as SSE; take the last data: JSON payload.
    if (text.includes("data:")) {
      const payloads = text
        .split("\n")
        .filter((l) => l.startsWith("data:"))
        .map((l) => l.slice(5).trim())
        .filter(Boolean);
      return JSON.parse(payloads[payloads.length - 1]);
    }
    return JSON.parse(text);
  }

  async #rpc(method, params) {
    const id = this.nextId++;
    const out = await this.#post({ jsonrpc: "2.0", id, method, params });
    if (out && out.error) {
      throw new Error(`HSP MCP ${method} error: ${JSON.stringify(out.error)}`);
    }
    return out ? out.result : null;
  }

  async connect() {
    await this.#rpc("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "agentpay-escrow", version: "0.1.0" },
    });
    await this.#post({ jsonrpc: "2.0", method: "notifications/initialized" });
    return this;
  }

  async listTools() {
    const r = await this.#rpc("tools/list", {});
    return r ? r.tools : [];
  }

  async callTool(name, args) {
    const r = await this.#rpc("tools/call", { name, arguments: args });
    if (r && r.isError) {
      throw new Error(`HSP tool ${name} failed: ${JSON.stringify(r.content).slice(0, 300)}`);
    }
    return r;
  }

  /// Create an HSP payment order for a job. Returns the payment URL and the
  /// payment mandate id — the mandate id is what we anchor on-chain in the
  /// escrow's release() call.
  async createPaymentOrder(args) {
    return this.callTool("create_payment_order", args);
  }

  async getPaymentStatus(args) {
    return this.callTool("get_payment_status", args);
  }
}

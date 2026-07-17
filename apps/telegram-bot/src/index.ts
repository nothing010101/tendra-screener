import { Telegraf } from "telegraf";

const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) throw new Error("TELEGRAM_TOKEN not set");

const API        = "https://app.apescreener.store";
const BLOCKSCOUT = "https://robinhoodchain.blockscout.com";
const APE_STORE  = "https://ape.store/robinhood";
const CHAIN      = 4663;

const bot = new Telegraf(TOKEN);

// ── helpers ───────────────────────────────────────────────────────────────────

/** Shorten 0xABCD...1234 */
function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Format USD number */
function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/** Escape MarkdownV2 special chars — handles undefined/null safely */
function esc(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

/** Time ago from ISO string */
function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** Fetch JSON with timeout, returns null on any error */
async function fetchJson<T>(url: string, timeoutMs = 15_000): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return r.json() as Promise<T>;
  } catch {
    return null;
  }
}

// ── /start & /help ────────────────────────────────────────────────────────────

const HELP = `🦍 *ApeScreener Bot*

Scan tokens on Robinhood Chain \\(ape\\.store\\)

*Commands:*
/scan \\<CA\\> — Scan a token by contract address
/help — Show this message

*Example:*
\`/scan 0x0ba813c7a084cb68aeb1b0f633821a112ab90629\``;

bot.start((ctx) => ctx.replyWithMarkdownV2(HELP));
bot.help((ctx)  => ctx.replyWithMarkdownV2(HELP));

// ── /scan ─────────────────────────────────────────────────────────────────────

bot.command("scan", async (ctx) => {
  const parts = ctx.message.text.trim().split(/\s+/);
  const ca    = parts[1]?.toLowerCase();

  if (!ca || !/^0x[0-9a-f]{40}$/i.test(ca)) {
    return ctx.reply(
      "❌ Please provide a valid contract address.\n\nExample:\n/scan 0xAbCd...",
    );
  }

  const loading = await ctx.reply("🔍 Scanning…");

  // Fetch token detail + funding trace in parallel
  const [detail, funding] = await Promise.all([
    fetchJson<any>(`${API}/api/token/${CHAIN}/${ca}`),
    fetchJson<any>(`${API}/api/wallet/${ca}/funding`, 8_000),
  ]);

  // Delete "Scanning…" message
  await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});

  if (!detail || detail.error || !detail.token) {
    return ctx.reply(
      "❌ Token not found\\. Make sure the CA is correct and the token exists on ape\\.store Robinhood Chain\\.",
      { parse_mode: "MarkdownV2" },
    );
  }

  const t   = detail.token;
  const mc  = detail.marketCap ?? t.marketCap ?? 0;

  // ── Header ──
  const header = `🪙 *${esc(t.name)}* \\($${esc(t.symbol)}\\)`;

  // ── Stats ──
  const stats = [
    `📊 Market Cap: *${esc(fmtUsd(mc))}*`,
    `👥 Holders: *${esc(String(t.holderCount ?? "—"))}*`,
    `🕐 Created: *${esc(timeAgo(t.createDate))}*`,
    `💳 DEX Fee: ${detail.dexPaid ? "✅ Paid" : "❌ Not paid"}`,
  ].join("\n");

  // ── Creator ──
  const creator   = t.creator ?? "";
  const launchCount: number = detail.creatorLaunchCount ?? 0;
  const devBadge  = launchCount > 1
    ? ` ⚠️ *DEV ×${launchCount}*`
    : "";
  const creatorLine = creator
    ? `👤 Creator: [${esc(short(creator))}](${BLOCKSCOUT}/address/${creator})${devBadge}`
    : "";

  // ── Funding trace (creator wallet) ──
  let fundingLine = "";
  if (funding?.trace && !funding.funderSuppressed) {
    const f      = funding.trace;
    const funder = f.from_address ?? "";
    const amt    = f.amount != null
      ? `${Number(f.amount).toFixed(4)} ETH`
      : "";
    const fanOut = funding.funderFanOut ?? 0;
    const fanTag = fanOut > 1
      ? ` \\(funded *${fanOut}* dev wallets\\)`
      : "";
    fundingLine = `💸 Funded by: [${esc(short(funder))}](${BLOCKSCOUT}/address/${funder}) ${esc(amt)}${fanTag}`;
  }

  // ── Token links ──
  const links = [
    `[Screener](${API}/token/${CHAIN}/${ca})`,
    `[Blockscout](${BLOCKSCOUT}/token/${ca})`,
    `[ape\\.store](${APE_STORE}/${ca})`,
  ].join(" \\| ");

  // ── Assemble ──
  const lines = [
    header,
    "",
    stats,
    "",
    creatorLine,
    fundingLine,
    "",
    links,
  ].filter(Boolean);

  await ctx.replyWithMarkdownV2(lines.join("\n"), {
    disable_web_page_preview: true,
  } as any);
});

// ── catch-all ─────────────────────────────────────────────────────────────────

bot.on("text", (ctx) =>
  ctx.reply("Use /scan <CA> to scan a token, or /help for usage."),
);

// ── launch ────────────────────────────────────────────────────────────────────

bot.launch({ dropPendingUpdates: true });
console.log("🤖 ApeScreener bot running…");

process.once("SIGINT",  () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

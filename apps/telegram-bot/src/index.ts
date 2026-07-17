import { Telegraf } from "telegraf";

const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) throw new Error("TELEGRAM_TOKEN not set");

const API        = "https://app.apescreener.store";
const BLOCKSCOUT = "https://robinhoodchain.blockscout.com";
const APE_STORE  = "https://ape.store/robinhood";
const CHAIN      = 4663;

const bot = new Telegraf(TOKEN);

// ── helpers ───────────────────────────────────────────────────────────────────

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtUsd(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

/** Escape MarkdownV2 special chars — null/undefined safe */
function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function fetchJson<T>(url: string, timeoutMs = 15_000): Promise<T | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!r.ok) return null;
    return r.json() as Promise<T>;
  } catch {
    return null;
  }
}

function isValidCa(ca: string): boolean {
  return /^0x[0-9a-f]{40}$/i.test(ca);
}

// ── /start & /help ────────────────────────────────────────────────────────────

const HELP = `🦍 *ApeScreener Bot*

Scan tokens on Robinhood Chain \\(ape\\.store\\)

*Commands:*
/scan \\<CA\\> — Token info \\+ top holders
/bundle \\<CA\\> — Bundle analysis \\(takes \\~30s\\)
/help — Show this message

*Example:*
\`/scan 0x0ba813c7a084cb68aeb1b0f633821a112ab90629\``;

bot.start((ctx) => ctx.replyWithMarkdownV2(HELP));
bot.help((ctx)  => ctx.replyWithMarkdownV2(HELP));

// ── /scan ─────────────────────────────────────────────────────────────────────

bot.command("scan", async (ctx) => {
  const ca = ctx.message.text.trim().split(/\s+/)[1]?.toLowerCase();

  if (!ca || !isValidCa(ca)) {
    return ctx.reply("❌ Please provide a valid contract address.\n\nExample:\n/scan 0xAbCd...");
  }

  const loading = await ctx.reply("🔍 Scanning…");

  // All three in parallel — holders uses Blockscout so it's independent & fast
  const [detail, funding, holdersData] = await Promise.all([
    fetchJson<any>(`${API}/api/token/${CHAIN}/${ca}`),
    fetchJson<any>(`${API}/api/wallet/${ca}/funding`, 8_000),
    fetchJson<any>(`${API}/api/token/${CHAIN}/${ca}/holders`, 10_000),
  ]);

  await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});

  if (!detail?.token) {
    return ctx.reply("❌ Token not found. Make sure the CA is correct and the token exists on ape.store Robinhood Chain.");
  }

  const t  = detail.token;
  const mc = detail.marketCap ?? t.marketCap ?? 0;

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
  const creator    = t.creator ?? "";
  const launchCount: number = detail.creatorLaunchCount ?? 0;
  const devBadge   = launchCount > 1 ? ` ⚠️ *DEV ×${launchCount}*` : "";
  const creatorLine = creator
    ? `👤 Creator: [${esc(short(creator))}](${BLOCKSCOUT}/address/${creator})${devBadge}`
    : "";

  // ── Top holders ──
  const holders: any[] = holdersData?.holders ?? [];
  let holdersSection = "";
  if (holders.length > 0) {
    const top5 = holders.slice(0, 5);
    const rows = top5.map((h, i) => {
      const devTag = h.isDevWallet ? ` 🔴 dev×${h.launchCount}` : "";
      return `  ${i + 1}\\. [${esc(short(h.address))}](${BLOCKSCOUT}/address/${h.address}) — *${esc(h.holdPct.toFixed(2))}%*${esc(devTag)}`;
    });
    const total = holdersData?.total ?? holders.length;
    holdersSection = `📋 *Top Holders* \\(${esc(String(total))} total\\)\n` + rows.join("\n");
  }

  // ── Funding trace ──
  let fundingLine = "";
  if (funding?.trace && !funding.funderSuppressed) {
    const f      = funding.trace;
    const funder = f.from_address ?? "";
    const amt    = f.amount != null ? `${Number(f.amount).toFixed(4)} ETH` : "";
    const fanOut = funding.funderFanOut ?? 0;
    const fanTag = fanOut > 1 ? ` \\(funded *${fanOut}* wallets\\)` : "";
    fundingLine = `💸 Funded by: [${esc(short(funder))}](${BLOCKSCOUT}/address/${funder}) ${esc(amt)}${fanTag}`;
  }

  // ── Links ──
  const links = [
    `[Screener](${API}/token/${CHAIN}/${ca})`,
    `[Blockscout](${BLOCKSCOUT}/token/${ca})`,
    `[ape\\.store](${APE_STORE}/${ca})`,
  ].join(" \\| ");

  const lines = [
    header, "",
    stats, "",
    creatorLine,
    fundingLine,
    holdersSection ? "" : null,
    holdersSection,
    "",
    `💡 Run /bundle ${esc(ca)} for bundle analysis`,
    "",
    links,
  ].filter((l) => l != null) as string[];

  await ctx.replyWithMarkdownV2(lines.join("\n"), {
    disable_web_page_preview: true,
  } as any);
});

// ── /bundle ───────────────────────────────────────────────────────────────────

bot.command("bundle", async (ctx) => {
  const ca = ctx.message.text.trim().split(/\s+/)[1]?.toLowerCase();

  if (!ca || !isValidCa(ca)) {
    return ctx.reply("❌ Please provide a valid contract address.\n\nExample:\n/bundle 0xAbCd...");
  }

  const loading = await ctx.reply("📦 Running bundle analysis… (~30s, fetching on-chain data)");

  const data = await fetchJson<any>(`${API}/api/token/${CHAIN}/${ca}/bundlers`, 60_000);

  await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});

  if (!data || data.error) {
    return ctx.reply("❌ Bundle analysis failed. Try again in a moment.");
  }

  const visible    = (data.bundles ?? []).filter((b: any) => !b.suppressed);
  const suppressed = data.suppressedCount ?? 0;
  const earlyCount = data.earlyBuyerCount ?? 0;
  const cached     = data.fromCache ? " \\(cached\\)" : "";

  let body: string;

  if (visible.length === 0) {
    body = `✅ *No bundles detected*\n_Analysed ${esc(String(earlyCount))} early buyers, ${esc(String(suppressed))} bridge\\/relay hidden${cached}_`;
  } else {
    const bundleRows = visible.map((b: any) => {
      const walletCount = b.wallets?.length ?? 0;
      const pct = b.holdPct != null ? `${Number(b.holdPct).toFixed(2)}%` : "?%";
      return `  • [${esc(short(b.funder))}](${BLOCKSCOUT}/address/${b.funder}) → *${walletCount}* wallets \\(${esc(pct)}\\)`;
    });
    body = [
      `⚠️ *${visible.length} bundle group${visible.length !== 1 ? "s" : ""} detected*`,
      `_${esc(String(earlyCount))} early buyers, ${esc(String(suppressed))} relay hidden${cached}_`,
      "",
      ...bundleRows,
    ].join("\n");
  }

  const header = `📦 *Bundle Analysis*\n[${esc(short(ca))}](${BLOCKSCOUT}/token/${ca})\n`;

  await ctx.replyWithMarkdownV2(header + body, {
    disable_web_page_preview: true,
  } as any);
});

// ── catch-all ─────────────────────────────────────────────────────────────────

bot.on("text", (ctx) =>
  ctx.reply("Use /scan <CA> to scan a token, /bundle <CA> for bundle analysis, or /help for usage."),
);

// ── launch ────────────────────────────────────────────────────────────────────

bot.launch({ dropPendingUpdates: true });
console.log("🤖 ApeScreener bot running…");

process.once("SIGINT",  () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

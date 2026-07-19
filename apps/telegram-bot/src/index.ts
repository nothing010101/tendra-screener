import { Telegraf } from "telegraf";

const TOKEN = process.env.TELEGRAM_TOKEN;
if (!TOKEN) throw new Error("TELEGRAM_TOKEN not set");

const SUPABASE_URL  = process.env.SUPABASE_URL_PROJECT ?? "";
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

// ── user tracking ─────────────────────────────────────────────────────────────

async function trackUser(ctx: any): Promise<void> {
  try {
    const from = ctx.message?.from ?? ctx.from;
    if (!from || !SUPABASE_URL || !SUPABASE_KEY) return;
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/upsert_bot_user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
      body: JSON.stringify({
        p_user_id:    from.id,
        p_username:   from.username   ?? null,
        p_first_name: from.first_name ?? null,
      }),
    });
  } catch {
    // fire-and-forget, never block the command
  }
}

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
  const normalized = /[Z+\-]\d*$/.test(iso) ? iso : iso + "Z";
  const diff = Date.now() - new Date(normalized).getTime();
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

/** Edit the loading message in-place — works in private and group chats.
 *  Falls back to a new reply if edit fails (e.g. message too old). */
async function editOrReply(
  msgId: number,
  ctx: any,
  text: string,
): Promise<void> {
  try {
    await ctx.telegram.editMessageText(ctx.chat.id, msgId, undefined, text, {
      parse_mode: "MarkdownV2",
      disable_web_page_preview: true,
    });
  } catch {
    await ctx.replyWithMarkdownV2(text, { disable_web_page_preview: true } as any);
  }
}

// ── admin ─────────────────────────────────────────────────────────────────────

const ADMIN_ID = 8356291357;

function isAdmin(ctx: any): boolean {
  const id = ctx.message?.from?.id ?? ctx.callbackQuery?.from?.id;
  return id === ADMIN_ID;
}

async function supabaseQuery(sql: string): Promise<any[]> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/run_admin_query`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) return [];
  return r.json();
}

async function getStats(): Promise<string> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bot_users?select=user_id,last_seen,command_count,first_seen`, {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
      },
    });
    const rows: any[] = res.ok ? await res.json() : [];

    const now = Date.now();
    const total      = rows.length;
    const active7d   = rows.filter(r => now - new Date(r.last_seen).getTime() < 7  * 86400_000).length;
    const active30d  = rows.filter(r => now - new Date(r.last_seen).getTime() < 30 * 86400_000).length;
    const newToday   = rows.filter(r => now - new Date(r.first_seen).getTime() < 86400_000).length;
    const totalCmds  = rows.reduce((s, r) => s + (r.command_count ?? 0), 0);

    return [
      `📊 *Statistik Bot*`,
      ``,
      `👤 Total user: *${total}*`,
      `🆕 User baru hari ini: *${newToday}*`,
      `🟢 Aktif 7 hari: *${active7d}*`,
      `🟡 Aktif 30 hari: *${active30d}*`,
      `⌨️ Total command: *${totalCmds}*`,
      `📈 Rata\\-rata cmd/user: *${total ? (totalCmds / total).toFixed(1) : 0}*`,
    ].join("\n");
  } catch {
    return "❌ Gagal ambil statistik\\.";
  }
}

async function getTopUsers(): Promise<string> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/bot_users?select=first_name,username,command_count&order=command_count.desc&limit=10`,
      { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } }
    );
    const rows: any[] = res.ok ? await res.json() : [];
    if (!rows.length) return "_Belum ada data user\\._";
    const lines = rows.map((r, i) => {
      const name = esc(r.first_name ?? r.username ?? "Unknown");
      const uname = r.username ? ` \\(@${esc(r.username)}\\)` : "";
      return `${i + 1}\\. ${name}${uname} — *${r.command_count}* cmd`;
    });
    return `🏆 *Top 10 User Aktif*\n\n` + lines.join("\n");
  } catch {
    return "❌ Gagal ambil data\\.";
  }
}

const ADMIN_MENU_TEXT = `🔐 *Admin Panel*\n\nPilih menu di bawah:`;
const ADMIN_KEYBOARD = {
  inline_keyboard: [
    [
      { text: "📊 Statistik", callback_data: "admin_stats" },
      { text: "🏆 Top User", callback_data: "admin_top" },
    ],
    [
      { text: "📢 Broadcast", callback_data: "admin_broadcast" },
    ],
  ],
};

// pending broadcast state per admin session
const pendingBroadcast = new Map<number, boolean>();

bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.reply("⛔ Akses ditolak.");
  await ctx.replyWithMarkdownV2(ADMIN_MENU_TEXT, { reply_markup: ADMIN_KEYBOARD });
});

bot.action("admin_stats", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Akses ditolak.");
  await ctx.answerCbQuery();
  const text = await getStats();
  await ctx.replyWithMarkdownV2(text, {
    reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Admin", callback_data: "admin_back" }]] },
  });
});

bot.action("admin_top", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Akses ditolak.");
  await ctx.answerCbQuery();
  const text = await getTopUsers();
  await ctx.replyWithMarkdownV2(text, {
    reply_markup: { inline_keyboard: [[{ text: "🔙 Menu Admin", callback_data: "admin_back" }]] },
  });
});

bot.action("admin_broadcast", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Akses ditolak.");
  await ctx.answerCbQuery();
  pendingBroadcast.set(ADMIN_ID, true);
  await ctx.reply(
    "📢 *Mode Broadcast*\n\nKirim pesan yang ingin di\\-broadcast ke semua user\\.\nFormat bebas \\(teks, emoji, dll\\)\\.\n\nKetik /cancel untuk batalkan\\.",
    { parse_mode: "MarkdownV2" }
  );
});

bot.action("admin_back", async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery("⛔ Akses ditolak.");
  await ctx.answerCbQuery();
  await ctx.replyWithMarkdownV2(ADMIN_MENU_TEXT, { reply_markup: ADMIN_KEYBOARD });
});

bot.command("cancel", async (ctx) => {
  if (!isAdmin(ctx)) return;
  pendingBroadcast.delete(ADMIN_ID);
  await ctx.reply("✅ Dibatalkan.");
});

// intercept plain text from admin when broadcast mode active
bot.on("text", async (ctx) => {
  const from = ctx.message.from;
  if (from.id !== ADMIN_ID) return;
  if (!pendingBroadcast.get(ADMIN_ID)) return;

  pendingBroadcast.delete(ADMIN_ID);
  const message = ctx.message.text;

  // fetch all user_ids
  let users: { user_id: number }[] = [];
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bot_users?select=user_id`, {
      headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` },
    });
    users = res.ok ? await res.json() : [];
  } catch { /* ignore */ }

  if (!users.length) return ctx.reply("❌ Tidak ada user terdaftar.");

  const status = await ctx.reply(`📤 Mengirim ke ${users.length} user…`);
  let ok = 0, fail = 0;

  for (const u of users) {
    try {
      await bot.telegram.sendMessage(u.user_id, message);
      ok++;
    } catch {
      fail++;
    }
    // small delay to avoid Telegram flood limits
    await new Promise(r => setTimeout(r, 50));
  }

  await ctx.telegram.editMessageText(
    ctx.chat.id, status.message_id, undefined,
    `✅ Broadcast selesai\\!\n\n📨 Terkirim: *${ok}*\n❌ Gagal: *${fail}*`,
    { parse_mode: "MarkdownV2" }
  );
});

// ── /start & /help ────────────────────────────────────────────────────────────

const HELP = `🦍 *ApeScreener Bot*

Real\\-time token scanner for ape\\.store on Robinhood Chain\\.

*Commands:*
/scan \\<CA\\> — Token info \\+ top holders
/bundle \\<CA\\> — Bundle analysis \\(takes \\~30s\\)
/help — Show this message

*Example:*
\`/scan 0x0ba813c7a084cb68aeb1b0f633821a112ab90629\`

🌐 [app\\.apescreener\\.store](https://app.apescreener.store)
💬 [t\\.me/apescreenerstore](https://t.me/apescreenerstore)`;

bot.start(async (ctx) => { trackUser(ctx); return ctx.replyWithMarkdownV2(HELP); });
bot.help(async (ctx)  => { trackUser(ctx); return ctx.replyWithMarkdownV2(HELP); });

// ── /scan ─────────────────────────────────────────────────────────────────────

bot.command("scan", async (ctx) => {
  trackUser(ctx);
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

  if (!detail?.token) {
    await editOrReply(loading.message_id, ctx, "❌ Token not found\\. Make sure the CA is correct and the token exists on ape\\.store Robinhood Chain\\.");
    return;
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

  await editOrReply(loading.message_id, ctx, lines.join("\n"));
});

// ── /bundle ───────────────────────────────────────────────────────────────────

bot.command("bundle", async (ctx) => {
  trackUser(ctx);
  const ca = ctx.message.text.trim().split(/\s+/)[1]?.toLowerCase();

  if (!ca || !isValidCa(ca)) {
    return ctx.reply("❌ Please provide a valid contract address.\n\nExample:\n/bundle 0xAbCd...");
  }

  const loading = await ctx.reply("📦 Running bundle analysis… (~30s, fetching on-chain data)");

  const data = await fetchJson<any>(`${API}/api/token/${CHAIN}/${ca}/bundlers`, 60_000);

  if (!data || data.error) {
    await editOrReply(loading.message_id, ctx, "❌ Bundle analysis failed\\. Try again in a moment\\.");
    return;
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

  await editOrReply(loading.message_id, ctx, header + body);
});

// ── launch ────────────────────────────────────────────────────────────────────

bot.launch({ dropPendingUpdates: true });
console.log("🤖 ApeScreener bot running…");

process.once("SIGINT",  () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

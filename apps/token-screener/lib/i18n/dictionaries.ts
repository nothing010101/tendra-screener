export type Locale = "en" | "zh" | "de";

export interface Dictionary {
  brand: string;
  tagline: string;
  searchPlaceholder: string;
  columns: {
    token: string;
    price: string;
    marketCap: string;
    volume: string;
    holders: string;
    created: string;
  };
  sort: {
    marketCap: string;
    volume: string;
    name: string;
    newest: string;
  };
  order: { desc: string; asc: string };
  empty: string;
  loading: string;
  error: string;
  liveBadge: string;
  holdersUnavailable: string;
  holdersAsOf: string;
  serialDevFilter: string;
  updatedAgo: string;
  resultCount: string;
  footerNote: string;
  detail: {
    back: string;
    liquidity: string;
    kingProgress: string;
    apeProgress: string;
    dexPaid: string;
    dexPaidYes: string;
    dexPaidNo: string;
    tradesTitle: string;
    tradesEmpty: string;
    tradesLoading: string;
    columns: {
      wallet: string;
      side: string;
      amount: string;
      price: string;
      time: string;
      txn: string;
    };
    side: { buy: string; sell: string };
    notFound: string;
    holdersNote: string;
  };
  devWallet: {
    tableBadge: string;
    tableBadgeTooltip: string;
    warningTitle: string;
    warningBody: string;
    otherLaunchesTitle: string;
    deadBadge: string;
    viewToken: string;
  };
  funding: {
    title: string;
    fundedBy: string;
    amount: string;
    txn: string;
    none: string;
    fanOut: string;
    loading: string;
  };
}

export const dictionaries: Record<Locale, Dictionary> = {
  en: {
    brand: "ApeScreener",
    tagline: "Live token board for ape.store on Robinhood Chain",
    searchPlaceholder: "Search name or symbol\u2026",
    columns: {
      token: "Token",
      price: "Price",
      marketCap: "Market cap",
      volume: "Volume",
      holders: "Holders",
      created: "Created",
    },
    sort: {
      marketCap: "Market cap",
      volume: "Volume",
      name: "Name (A\u2013Z)",
      newest: "Newest",
    },
    order: { desc: "High to low", asc: "Low to high" },
    empty: "No tokens match your search.",
    loading: "Loading tokens\u2026",
    error: "Couldn't reach ape.store. Retrying shortly.",
    liveBadge: "Live",
    holdersUnavailable: "N/A",
    holdersAsOf: "as of {t}",
    serialDevFilter: "Serial dev",
    updatedAgo: "Updated {n}s ago",
    resultCount: "{count} tokens on Robinhood Chain",
    footerNote: "Data sourced live from ape.store. Not financial advice.",
    detail: {
      back: "Back to screener",
      liquidity: "Virtual liquidity",
      kingProgress: "King progress",
      apeProgress: "Ape progress",
      dexPaid: "DEX paid",
      dexPaidYes: "Paid",
      dexPaidNo: "Not paid",
      tradesTitle: "Recent trades",
      tradesEmpty: "No trades yet.",
      tradesLoading: "Loading trades\u2026",
      columns: {
        wallet: "Wallet",
        side: "Side",
        amount: "Amount",
        price: "Price",
        time: "Time",
        txn: "Tx",
      },
      side: { buy: "Buy", sell: "Sell" },
      notFound: "Token not found.",
      holdersNote: "Holder count isn't available yet for this chain.",
    },
    devWallet: {
      tableBadge: "Serial dev",
      tableBadgeTooltip: "This wallet has launched {count} tokens on Robinhood Chain",
      warningTitle: "Serial dev wallet",
      warningBody: "This creator has launched {count} other token(s) on Robinhood Chain.",
      otherLaunchesTitle: "Other tokens by this creator",
      deadBadge: "Dead",
      viewToken: "View",
    },
    funding: {
      title: "Funding trace",
      fundedBy: "Funded by",
      amount: "Amount",
      txn: "Tx",
      none: "No incoming funding found for this wallet yet.",
      fanOut: "This funder has funded {count} dev wallet(s) on Robinhood Chain.",
      loading: "Tracing funding source\u2026",
    },
  },
  zh: {
    brand: "ApeScreener",
    tagline: "Robinhood Chain 上 ape.store 代币实时看板",
    searchPlaceholder: "搜索名称或代号\u2026",
    columns: {
      token: "代币",
      price: "价格",
      marketCap: "市值",
      volume: "成交量",
      holders: "持有人数",
      created: "创建时间",
    },
    sort: {
      marketCap: "市值",
      volume: "成交量",
      name: "名称（A\u2013Z）",
      newest: "最新",
    },
    order: { desc: "从高到低", asc: "从低到高" },
    empty: "没有匹配的代币。",
    loading: "正在加载代币\u2026",
    error: "无法连接到 ape.store，稍后重试。",
    liveBadge: "实时",
    holdersUnavailable: "暂无",
    holdersAsOf: "{t}前更新",
    serialDevFilter: "连续发币",
    updatedAgo: "{n} 秒前更新",
    resultCount: "Robinhood Chain 上共 {count} 个代币",
    footerNote: "数据实时来自 ape.store，非投资建议。",
    detail: {
      back: "返回筛选器",
      liquidity: "虚拟流动性",
      kingProgress: "King 进度",
      apeProgress: "Ape 进度",
      dexPaid: "DEX 认证",
      dexPaidYes: "已认证",
      dexPaidNo: "未认证",
      tradesTitle: "最近交易",
      tradesEmpty: "暂无交易记录。",
      tradesLoading: "正在加载交易\u2026",
      columns: {
        wallet: "钱包",
        side: "方向",
        amount: "数量",
        price: "价格",
        time: "时间",
        txn: "交易",
      },
      side: { buy: "买入", sell: "卖出" },
      notFound: "未找到该代币。",
      holdersNote: "该链的持有人数暂不可用。",
    },
    devWallet: {
      tableBadge: "连续发币",
      tableBadgeTooltip: "该钱包已在 Robinhood Chain 上发行 {count} 个代币",
      warningTitle: "连续发币钱包",
      warningBody: "该创建者已在 Robinhood Chain 上发行了 {count} 个其他代币。",
      otherLaunchesTitle: "该创建者的其他代币",
      deadBadge: "已死亡",
      viewToken: "查看",
    },
    funding: {
      title: "资金追踪",
      fundedBy: "资金来源",
      amount: "金额",
      txn: "交易",
      none: "暂未发现该钱包的资金来源。",
      fanOut: "该资金来源钱包已为 Robinhood Chain 上 {count} 个开发者钱包提供资金。",
      loading: "正在追踪资金来源\u2026",
    },
  },
  de: {
    brand: "ApeScreener",
    tagline: "Live-Token-Übersicht für ape.store auf der Robinhood Chain",
    searchPlaceholder: "Name oder Symbol suchen\u2026",
    columns: {
      token: "Token",
      price: "Preis",
      marketCap: "Marktkapitalisierung",
      volume: "Volumen",
      holders: "Halter",
      created: "Erstellt",
    },
    sort: {
      marketCap: "Marktkapitalisierung",
      volume: "Volumen",
      name: "Name (A\u2013Z)",
      newest: "Neueste",
    },
    order: { desc: "Hoch zu niedrig", asc: "Niedrig zu hoch" },
    empty: "Keine Token entsprechen deiner Suche.",
    loading: "Token werden geladen\u2026",
    error: "ape.store nicht erreichbar. Erneuter Versuch in Kürze.",
    liveBadge: "Live",
    holdersUnavailable: "N/V",
    holdersAsOf: "Stand: vor {t}",
    serialDevFilter: "Serial Dev",
    updatedAgo: "Vor {n}s aktualisiert",
    resultCount: "{count} Token auf der Robinhood Chain",
    footerNote: "Daten live von ape.store. Keine Anlageberatung.",
    detail: {
      back: "Zurück zum Screener",
      liquidity: "Virtuelle Liquidität",
      kingProgress: "King-Fortschritt",
      apeProgress: "Ape-Fortschritt",
      dexPaid: "DEX bezahlt",
      dexPaidYes: "Bezahlt",
      dexPaidNo: "Nicht bezahlt",
      tradesTitle: "Letzte Trades",
      tradesEmpty: "Noch keine Trades.",
      tradesLoading: "Trades werden geladen\u2026",
      columns: {
        wallet: "Wallet",
        side: "Seite",
        amount: "Menge",
        price: "Preis",
        time: "Zeit",
        txn: "Tx",
      },
      side: { buy: "Kauf", sell: "Verkauf" },
      notFound: "Token nicht gefunden.",
      holdersNote: "Die Halterzahl ist für diese Chain noch nicht verfügbar.",
    },
    devWallet: {
      tableBadge: "Serien-Dev",
      tableBadgeTooltip: "Dieses Wallet hat {count} Token auf der Robinhood Chain gestartet",
      warningTitle: "Serien-Dev-Wallet",
      warningBody: "Dieser Ersteller hat {count} weitere Token auf der Robinhood Chain gestartet.",
      otherLaunchesTitle: "Weitere Token dieses Erstellers",
      deadBadge: "Tot",
      viewToken: "Ansehen",
    },
    funding: {
      title: "Finanzierungsnachverfolgung",
      fundedBy: "Finanziert von",
      amount: "Betrag",
      txn: "Tx",
      none: "Für dieses Wallet wurde noch keine eingehende Finanzierung gefunden.",
      fanOut: "Dieser Geldgeber hat {count} Dev-Wallet(s) auf der Robinhood Chain finanziert.",
      loading: "Finanzierungsquelle wird nachverfolgt\u2026",
    },
  },
};

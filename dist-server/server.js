// server.ts
import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import path from "path";

// src/server/scraper.js
import * as cheerio from "cheerio";
var categories = [
  "kredyty-gotowkowe",
  "kredyty-konsolidacyjne",
  "kredyty-hipoteczne",
  "kredyty-samochodowe",
  "chwilowki",
  "pozyczki",
  "pozyczki-bankowe-online",
  "konta-osobiste",
  "karty-kredytowe",
  "konta-oszczednosciowe",
  "lokaty-i-inwestycje",
  "ubezpieczenia-ac-oc",
  "pozostale-ubezpieczenia",
  "konta-dla-firm",
  "kredyty-dla-firm"
];
async function fetchOffersFromPanel() {
  let allOffers = [];
  console.log("[Scraper] Rozpoczynam pobieranie ofert z API toomasz-money.oferty-kredytowe.pl...");
  for (const cat of categories) {
    try {
      const pageUrl = `https://toomasz-money.oferty-kredytowe.pl/${cat}`;
      const pageRes = await fetch(pageUrl);
      if (!pageRes.ok) {
        console.warn(`[Scraper] B\u0142\u0105d pobierania strony kategorii ${cat}: ${pageRes.status}`);
        continue;
      }
      const pageHtml = await pageRes.text();
      const $page = cheerio.load(pageHtml);
      const dataKey = $page("#category-campaigns").attr("data-key");
      if (!dataKey) {
        console.warn(`[Scraper] Nie znaleziono data-key dla kategorii ${cat}`);
        continue;
      }
      const apiUrl = `https://toomasz-money.oferty-kredytowe.pl/get-category-campaigns/${dataKey}`;
      const apiRes = await fetch(apiUrl);
      if (!apiRes.ok) {
        console.warn(`[Scraper] B\u0142\u0105d pobierania API dla ${dataKey}: ${apiRes.status}`);
        continue;
      }
      let json;
      try {
        json = await apiRes.json();
      } catch (e) {
        console.warn(`[Scraper] B\u0142\u0105d parsowania JSON dla ${cat}:`, e);
        continue;
      }
      if (!Array.isArray(json)) {
        console.log(`[Scraper] Kategoria ${cat} (${dataKey}) nie zwr\xF3ci\u0142a tablicy JSON.`);
        continue;
      }
      console.log(`[Scraper] Kategoria ${cat} (${dataKey}): otrzymano ${json.length} element\xF3w.`);
      json.forEach((htmlString, i) => {
        const $ = cheerio.load(htmlString);
        let name = $(".product__name a").text().trim();
        if (!name) {
          name = $(".product__legal").attr("data-title")?.trim() || "";
        }
        const link = $("a[data-href]").first().attr("data-href");
        const features = [];
        $(".product__features li").each((_, el) => {
          features.push($(el).text().trim());
        });
        const params = {};
        $(".product__params .param").each((_, el) => {
          const label = $(el).find(".param__label").text().trim().toLowerCase();
          const value = $(el).find(".param__value").text().trim();
          if (label && value)
            params[label] = value;
        });
        if (name && link) {
          const id = `${cat}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${i}`;
          allOffers.push({
            id,
            name,
            url: link,
            category: cat,
            features: features.length > 0 ? features : void 0,
            // Przekazujemy parametry jako ukryte pole dla AI
            params: Object.keys(params).length > 0 ? params : void 0
          });
        }
      });
    } catch (e) {
      console.error(`[Scraper] B\u0142\u0105d podczas przetwarzania kategorii ${cat}:`, e);
    }
  }
  console.log(`[Scraper] Zako\u0144czono. Pobrano \u0142\u0105cznie ${allOffers.length} ofert.`);
  return allOffers;
}

// src/server/router.js
var cachedOffers = [];
var lastFetchTime = 0;
var CACHE_DURATION_MS = 1e3 * 60 * 60;
async function getLiveOffers() {
  const now = Date.now();
  if (cachedOffers.length > 0 && now - lastFetchTime < CACHE_DURATION_MS) {
    return cachedOffers;
  }
  try {
    const scraped = await fetchOffersFromPanel();
    let offers = [];
    if (scraped.length > 0) {
      offers = scraped.map((s) => ({
        id: s.id,
        name: s.name,
        category: s.category,
        // Zostawiamy oryginalną kategorię do filtrowania
        url: s.url
      }));
    }
    const revolutBase = {
      url: "https://revolut.com/referral/?referral-code=tomasz52u!APR1-26-AR&geo-redirect",
      features: ["Ponad 70 mln u\u017Cytkownik\xF3w", "Karta wielowalutowa", "Bonus na start"]
    };
    offers.push({
      ...revolutBase,
      id: "revolut-referral-account",
      name: "Revolut - Konto Osobiste",
      category: "konta-osobiste"
    });
    offers.push({
      ...revolutBase,
      id: "revolut-referral-savings",
      name: "Revolut - Konto Oszcz\u0119dno\u015Bciowe",
      category: "konta-oszczednosciowe",
      features: ["Wysokie oprocentowanie", "Dost\u0119p do \u015Brodk\xF3w 24/7", "Ponad 70 mln u\u017Cytkownik\xF3w"]
    });
    offers.push({
      ...revolutBase,
      id: "revolut-referral-investments",
      name: "Revolut - Inwestycje i Lokaty",
      category: "lokaty-i-inwestycje",
      features: ["Inwestuj od 1 EUR", "Akcje, krypto i towary", "Lokaty terminowe"]
    });
    if (offers.length > 0) {
      cachedOffers = offers;
      lastFetchTime = now;
      return cachedOffers;
    }
  } catch (error) {
    console.error("B\u0142\u0105d pobierania ofert na \u017Cywo:", error);
  }
  return cachedOffers;
}
async function getOffersForProfile(profile) {
  const allOffers = await getLiveOffers();
  if (allOffers.length === 0) {
    return [{
      id: "gotowkowe-default",
      name: "Kredyt got\xF3wkowy",
      category: "Kredyt",
      url: "https://toomasz-money.oferty-kredytowe.pl/kredyty-gotowkowe"
    }];
  }
  let targetCategories = ["kredyty-gotowkowe"];
  if (profile.goal === "business") {
    if (profile.businessType === "loan") {
      targetCategories = ["kredyty-dla-firm"];
    } else if (profile.businessType === "account") {
      targetCategories = ["konta-dla-firm"];
    } else {
      targetCategories = ["kredyty-dla-firm", "konta-dla-firm"];
    }
  } else if (profile.goal === "insurance") {
    if (profile.insuranceType === "acoc") {
      targetCategories = ["ubezpieczenia-ac-oc"];
    } else {
      targetCategories = ["pozostale-ubezpieczenia"];
    }
  } else if (profile.goal === "house") {
    targetCategories = ["kredyty-hipoteczne"];
  } else if (profile.goal === "car") {
    targetCategories = ["kredyty-samochodowe"];
  } else if (profile.goal === "debt") {
    targetCategories = ["kredyty-konsolidacyjne"];
  } else if (profile.goal === "account") {
    targetCategories = ["konta-osobiste", "karty-kredytowe"];
  } else if (profile.goal === "savings") {
    if (profile.savingsType === "account") {
      targetCategories = ["konta-oszczednosciowe"];
    } else if (profile.savingsType === "investments") {
      targetCategories = ["lokaty-i-inwestycje"];
    } else {
      targetCategories = ["konta-oszczednosciowe", "lokaty-i-inwestycje"];
    }
  }
  if (profile.score === "bad") {
    targetCategories = ["chwilowki", "pozyczki", "pozyczki-bankowe-online"];
  }
  let matchedOffers = allOffers.filter((o) => targetCategories.includes(o.category));
  if (matchedOffers.length === 0) {
    matchedOffers = allOffers.filter((o) => ["kredyty-gotowkowe", "chwilowki"].includes(o.category));
  }
  const shuffled = [...matchedOffers].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 10).map((o) => ({
    ...o,
    category: o.category.replace(/-/g, " ").toUpperCase()
    // Ładne formatowanie nazwy kategorii dla UI
  }));
}
async function routeOffer(offerId) {
  const allOffers = await getLiveOffers();
  return allOffers.find((o) => o.id === offerId);
}

// src/server/tracker.js
import { v4 as uuidv4 } from "uuid";

// src/lib/supabase.js
import { createClient } from "@supabase/supabase-js";
var supabaseUrl = "";
var supabaseAnonKey = "placeholder-key";
if (typeof process !== "undefined" && process.env && process.env.VITE_SUPABASE_URL) {
  supabaseUrl = process.env.VITE_SUPABASE_URL;
  supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || "placeholder-key";
} else if (typeof import.meta !== "undefined" && import.meta.env) {
  supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
  supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "placeholder-key";
}
supabaseUrl = supabaseUrl.replace(/^["']|["']$/g, "");
supabaseAnonKey = supabaseAnonKey.replace(/^["']|["']$/g, "");
try {
  new URL(supabaseUrl);
} catch (e) {
  supabaseUrl = "https://placeholder.supabase.co";
}
var isSupabaseConfigured = supabaseUrl !== "https://placeholder.supabase.co" && supabaseUrl !== "";
var supabaseInstance = null;
var getSupabase = () => {
  if (!supabaseInstance) {
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey);
  }
  return supabaseInstance;
};
var supabase = getSupabase();

// src/server/tracker.js
async function trackClick(req, offer) {
  const clickid = uuidv4();
  const ip = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "unknown";
  const userAgent = req.headers["user-agent"] || "unknown";
  if (!isSupabaseConfigured) {
    console.warn("[Tracker] Brak konfiguracji Supabase. Pomijam zapis klikni\u0119cia.");
    return clickid;
  }
  try {
    const { error } = await supabase.from("clicks").insert([
      {
        id: clickid,
        offer_id: offer.id,
        offer_name: offer.name,
        ip_address: ip,
        user_agent: userAgent,
        created_at: (/* @__PURE__ */ new Date()).toISOString(),
        status: "click"
      }
    ]);
    if (error) {
      console.error("B\u0142\u0105d zapisu klikni\u0119cia do Supabase:", error.message);
    }
  } catch (err) {
    console.error("Wyj\u0105tek podczas zapisu do Supabase:", err);
  }
  return clickid;
}
async function trackConversion(clickid, payout) {
  if (!isSupabaseConfigured) {
    console.warn("[Tracker] Brak konfiguracji Supabase. Pomijam zapis konwersji.");
    return;
  }
  try {
    const { error } = await supabase.from("clicks").update({
      status: "conversion",
      payout,
      converted_at: (/* @__PURE__ */ new Date()).toISOString()
    }).eq("id", clickid);
    if (error) {
      console.error("B\u0142\u0105d zapisu konwersji do Supabase:", error.message);
    }
  } catch (err) {
    console.error("Wyj\u0105tek podczas zapisu konwersji:", err);
  }
}

// server.ts
async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3e3;
  app.use(cors());
  app.use(express.json());
  app.post("/api/offers", async (req, res) => {
    try {
      const userProfile = req.body;
      const offers = await getOffersForProfile(userProfile);
      console.log(`[API] Znaleziono ${offers.length} ofert dla profilu:`, userProfile.goal, userProfile.score);
      res.json(offers);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "B\u0142\u0105d silnika ofert" });
    }
  });
  app.get("/api/go", async (req, res) => {
    try {
      const offerId = req.query.offerId;
      const offer = await routeOffer(offerId);
      if (!offer) {
        res.status(404).send("Oferta niedost\u0119pna");
        return;
      }
      const clickid = await trackClick(req, offer);
      const redirectUrl = new URL(offer.url);
      redirectUrl.searchParams.append("clickid", clickid);
      res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error(error);
      res.status(500).send("B\u0142\u0105d przekierowania");
    }
  });
  app.get("/api/postback", async (req, res) => {
    try {
      const { clickid, payout } = req.query;
      if (!clickid) {
        res.status(400).send("Brak clickid");
        return;
      }
      await trackConversion(clickid, Number(payout));
      res.send("ok");
    } catch (error) {
      console.error(error);
      res.status(500).send("B\u0142\u0105d postbacka");
    }
  });
  app.get("/api/news", async (req, res) => {
    try {
      const apiKey = process.env.NEWS_API_KEY;
      if (!apiKey) {
        res.status(400).json({ error: "Brak klucza NEWS_API_KEY w zmiennych \u015Brodowiskowych." });
        return;
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5e3);
      const response = await fetch(`https://newsapi.org/v2/top-headlines?country=pl&category=business&apiKey=${apiKey}`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`NewsAPI error: ${response.statusText}`);
      }
      const data = await response.json();
      res.json(data.articles || []);
    } catch (error) {
      console.error("B\u0142\u0105d pobierania wiadomo\u015Bci:", error);
      if (error.name === "AbortError") {
        res.status(504).json({ error: "Przekroczono czas oczekiwania na odpowied\u017A z serwera wiadomo\u015Bci (Timeout)." });
      } else {
        res.status(500).json({ error: "Nie uda\u0142o si\u0119 pobra\u0107 wiadomo\u015Bci finansowych." });
      }
    }
  });
  app.post("/api/leads", async (req, res) => {
    try {
      const { email, timestamp } = req.body;
      if (!email) {
        res.status(400).json({ error: "Brak adresu e-mail" });
        return;
      }
      console.log(`[LEAD] Nowy e-mail z lejka: ${email} (Czas: ${timestamp})`);
      res.json({ success: true, message: "Lead zapisany" });
    } catch (error) {
      console.error("B\u0142\u0105d zapisu leada:", error);
      res.status(500).json({ error: "Nie uda\u0142o si\u0119 zapisa\u0107 leada." });
    }
  });
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CashMaker running on http://localhost:${PORT}`);
  });
}
startServer();

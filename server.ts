import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import path from "path";
import { getOffersForProfile, routeOffer } from "./src/server/router.js";
import { trackClick, trackConversion } from "./src/server/tracker.js";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(cors());
  app.use(express.json());

  // 1. Endpoint dla Frontendu: Zwraca dopasowane oferty na podstawie quizu
  app.post("/api/offers", async (req, res) => {
    try {
      const userProfile = req.body;
      const offers = await getOffersForProfile(userProfile);
      
      // Sprawdzamy czy mamy oferty (zastępcze dla wskaźnika akceptacji)
      if (offers.length === 0) {
        res.json({ url: "https://tmlead.pl/redirect/388900_1090", status: "downsell", name: "Stop Komornik", features: ["Wstrzymanie egzekucji", "Czyszczenie BIK", "Ochrona majątku"] });
        return;
      }

      console.log(`[API] Znaleziono ${offers.length} ofert dla profilu:`, userProfile.goal, userProfile.score);
      res.json(offers);
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Błąd silnika ofert" });
    }
  });

  // 2. Endpoint przekierowujący (Twój dawny "/")
  app.get("/api/go", async (req, res) => {
    try {
      const offerId = req.query.offerId as string;
      const offer = await routeOffer(offerId);
      
      if (!offer) {
        res.status(404).send("Oferta niedostępna");
        return;
      }

      // Zapisujemy kliknięcie w Supabase
      const clickid = await trackClick(req, offer);

      // Bezpieczne dodawanie parametru clickid
      const redirectUrl = new URL(offer.url);
      redirectUrl.searchParams.append("clickid", clickid);

      res.redirect(redirectUrl.toString());
    } catch (error) {
      console.error(error);
      res.status(500).send("Błąd przekierowania");
    }
  });

  // 3. Postback z sieci afiliacyjnej (Money2Money)
  app.get("/api/postback", async (req, res) => {
    try {
      const { clickid, payout } = req.query;
      
      if (!clickid) {
        res.status(400).send("Brak clickid");
        return;
      }

      // Zapisujemy konwersję w Supabase
      await trackConversion(clickid as string, Number(payout));
      
      res.send("ok");
    } catch (error) {
      console.error(error);
      res.status(500).send("Błąd postbacka");
    }
  });

  // 4. Endpoint dla wiadomości finansowych
  app.get("/api/news", async (req, res) => {
    try {
      const apiKey = process.env.NEWS_API_KEY;
      if (!apiKey) {
        res.status(400).json({ error: "Brak klucza NEWS_API_KEY w zmiennych środowiskowych." });
        return;
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 sekund timeoutu

      const response = await fetch(`https://newsapi.org/v2/top-headlines?country=pl&category=business&apiKey=${apiKey}`, {
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`NewsAPI error: ${response.statusText}`);
      }

      const data = await response.json();
      res.json(data.articles || []);
    } catch (error: any) {
      console.error("Błąd pobierania wiadomości:", error);
      if (error.name === 'AbortError') {
        res.status(504).json({ error: "Przekroczono czas oczekiwania na odpowiedź z serwera wiadomości (Timeout)." });
      } else {
        res.status(500).json({ error: "Nie udało się pobrać wiadomości finansowych." });
      }
    }
  });

  // 5. Endpoint dla leadów z lejka (zastępuje Make.com)
  app.post("/api/leads", async (req, res) => {
    try {
      const { email, timestamp } = req.body;
      
      if (!email) {
        res.status(400).json({ error: "Brak adresu e-mail" });
        return;
      }

      console.log(`[LEAD] Nowy e-mail z lejka: ${email} (Czas: ${timestamp})`);
      
      // Tutaj możesz dodać zapis do Supabase, np.:
      // await supabase.from('leads').insert([{ email, created_at: timestamp }]);

      res.json({ success: true, message: "Lead zapisany" });
    } catch (error) {
      console.error("Błąd zapisu leada:", error);
      res.status(500).json({ error: "Nie udało się zapisać leada." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`CashMaker running on http://localhost:${PORT}`);
  });
}

startServer();

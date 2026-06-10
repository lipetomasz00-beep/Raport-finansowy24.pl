import { GoogleGenAI, Type } from "@google/genai";
import { fetchOffersFromApi } from "./apiClient";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export interface Offer {
  id: string;
  name: string;
  description: string;
  interestRate: string;
  maxAmount: string;
  rrso: string;
  decisionTime: string;
  comment?: string;
}

export async function getAiRecommendedOffers(quizData: Record<string, any>): Promise<Offer | null> {
  // 1. Pobierz aktualne oferty z serwera via cache client
  const availableOffers = await fetchOffersFromApi(quizData);
  
  if (!availableOffers || availableOffers.length === 0) {
    console.error("Brak dostępnych ofert do rekomendacji");
    return null;
  }

  // 2. Poproś AI o wybór z aktualnych ofert
  const prompt = `
    Jesteś niezależnym doradcą finansowym. Twoim zadaniem jest analiza profilu klienta i wybór NAJLEPSZEJ oferty.
    
    UWAGA: Musisz być obiektywny. Nie faworyzuj żadnego konkretnego banku. 
    Jeśli kilka ofert jest podobnych, wybierz losowo jedną z nich, aby zapewnić różnorodność.
    
    DANE KLIENTA:
    ${JSON.stringify(quizData, null, 2)}
    
    DOSTĘPNE OFERTY (z prawdziwymi danymi):
    ${JSON.stringify(availableOffers, null, 2)}
    
    ZASADY WYBORU:
    1. Dopasuj ofertę do celu (business -> firmowe, debt -> konsolidacja, house -> hipoteka, account -> konta osobiste, savings -> oszczędności/lokaty, insurance -> ubezpieczenia).
    2. Dopasuj ofertę do historii kredytowej (pole 'score'):
       - 'good' (Dobra) -> preferuj tradycyjne kredyty bankowe, oferty z najniższym RRSO, konta premium.
       - 'mid' (Średnia) -> standardowe oferty bankowe oraz pozabankowe pożyczki ratalne.
       - 'bad' (Słaba) -> BEZWZGLĘDNIE preferuj pożyczki pozabankowe (chwilówki), firmy pożyczkowe. Unikaj tradycyjnych banków przy ofertach gotówkowych.
    3. Jeśli celem jest 'account' (Konto bankowe), zwróć szczególną uwagę na pole 'accountFilter':
       - 'free' -> szukaj darmowych kont (0 zł za prowadzenie).
       - 'bonus' -> szukaj kont z premią na start.
       - 'moneyback' -> szukaj kont oferujących zwrot za zakupy (moneyback/cashback).
    4. Jeśli celem jest 'insurance' (Ubezpieczenia), zwróć uwagę na pole 'insuranceType':
       - 'acoc' -> szukaj ubezpieczeń komunikacyjnych (AC/OC).
       - 'other' -> szukaj pozostałych ubezpieczeń (na życie, turystyczne, nieruchomości).
    5. Jeśli celem jest 'business' (Firma), zwróć uwagę na pole 'businessType':
       - 'loan' -> szukaj kredytów dla firm, linii kredytowych, limitów w koncie.
       - SPECJALNE DLA 'loan':
         - 'businessLoanType' == 'startup' -> priorytet dla ofert dla NOWYCH FIRM (często bez stażu).
         - 'businessDuration' == 'new' -> szukaj pożyczek pozabankowych i ofert dla nowych firm.
       - 'account' -> szukaj kont firmowych (0 zł za przelewy do ZUS/US, premie za otwarcie).
    6. Jeśli celem jest 'savings' (Oszczędzanie), zwróć uwagę na pole 'savingsType':
       - 'account' -> szukaj kont oszczędnościowych (wysokie oprocentowanie, dostęp do środków).
       - 'investments' -> szukaj lokat terminowych i ofert inwestycyjnych.
    7. Zwróć uwagę na formę zatrudnienia ('employment') i dochód ('income'):
       - 'b2b' -> uzasadnienie może nawiązywać do elastyczności dla przedsiębiorców.
       - 'high', 'expert' -> szukaj produktów premium, kont VIP lub wyższych limitów.
    8. Wyciągnij PRAWDZIWE dane z pola 'params' i 'features'.
    
    Zwróć odpowiedź w formacie JSON:
    {
      "recommendedOfferId": "id_oferty",
      "reasoning": "krótkie, unikalne uzasadnienie (max 100 znaków)",
      "rrso": "prawdziwe RRSO z danych (np. 0% lub 12.5%)",
      "maxAmount": "prawdziwa kwota max (np. 5000 zł)",
      "decisionTime": "czas decyzji (np. 15 min)"
    }
  `;

  const aiResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          recommendedOfferId: { type: Type.STRING },
          reasoning: { type: Type.STRING },
          rrso: { type: Type.STRING },
          maxAmount: { type: Type.STRING },
          decisionTime: { type: Type.STRING }
        },
        required: ["recommendedOfferId", "reasoning", "rrso", "maxAmount", "decisionTime"],
      },
    },
  });

  const result = JSON.parse(aiResponse.text || '{}');
  
  // 3. Znajdź pełny obiekt oferty na podstawie ID
  const recommended = availableOffers.find((offer: any) => offer.id === result.recommendedOfferId);
  
  if (!recommended) return null;

  // 4. Mapuj na format oczekiwany przez frontend
  return {
    id: recommended.id,
    name: recommended.name,
    description: result.reasoning || 'Oferta dopasowana do Twojego profilu.',
    interestRate: "0%", // Zastąpione przez RRSO w UI
    maxAmount: result.maxAmount || "Zależnie od zdolności",
    rrso: result.rrso || "0%",
    decisionTime: result.decisionTime || "15 min",
    comment: recommended.comment
  };
}

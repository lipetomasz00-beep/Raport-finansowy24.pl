import { fetchOffersFromPanel } from './src/server/scraper.ts';
fetchOffersFromPanel().then(res => console.log('Result:', res.length, res.slice(0, 2))).catch(console.error);

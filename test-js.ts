import * as cheerio from "cheerio";

async function test() {
  const res = await fetch('https://toomasz-money.oferty-kredytowe.pl/kredyty-gotowkowe');
  const html = await res.text();
  const $ = cheerio.load(html);
  
  console.log('data-key:', $('#category-campaigns').attr('data-key'));
}
test();

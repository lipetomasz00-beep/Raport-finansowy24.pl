import * as cheerio from "cheerio";
async function test() {
  const res = await fetch('https://toomasz-money.oferty-kredytowe.pl/kredyty-gotowkowe');
  const html = await res.text();
  const $ = cheerio.load(html);
  
  $('script').each((i, el) => {
    const src = $(el).attr('src');
    if (src) console.log('Script src:', src);
    else console.log('Inline script:', $(el).html()?.substring(0, 100));
  });
}
test();

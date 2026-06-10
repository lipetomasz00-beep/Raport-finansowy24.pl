async function test() {
  const res = await fetch('https://toomasz-money.oferty-kredytowe.pl/kredyty-gotowkowe');
  console.log('Status:', res.status);
  const text = await res.text();
  console.log('HTML:', text.substring(0, 500));
}
test();

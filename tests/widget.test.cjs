const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
let browser, server, base;
const root = path.resolve(process.env.TEST_ROOT || path.join(__dirname, '..'));
before(async () => {
  server = http.createServer(async (req, res) => {
    try {
      const name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
      if (!file.startsWith(root + path.sep)) throw Error('Invalid path');
      res.setHeader('Content-Type', ({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png'})[path.extname(file)] || 'text/plain');
      res.end(await fs.readFile(file));
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({headless:true});
});
after(async () => { await browser?.close(); await new Promise(resolve => server.close(resolve)); });
async function pageFor(t, setup) {
  const page = await browser.newPage();
  t.after(() => page.close());
  page.setDefaultTimeout(4000);
  if (setup) await setup(page);
  await page.goto(base);
  await page.locator('#mental-math-1 .widget-main-title').waitFor();
  return page;
}
const widget = page => page.locator('#mental-math-1');
const start = page => widget(page).getByRole('button', {name:'Начать', exact:true}).click();
async function answer(page, value) {
  await widget(page).locator('input').fill(String(value));
  await widget(page).getByRole('button', {name:'Ответить', exact:true}).click();
}
async function correct(page) {
  const text = await widget(page).locator('.widget-task-value').textContent();
  const [a, op, b] = text.split(' ');
  return ({'+':()=>+a + +b,'−':()=>+a - +b,'×':()=>+a * +b,'÷':()=>+a / +b})[op]();
}
test('Three widgets render and work independently; answers and history persist', async t => {
  const page = await pageFor(t);
  assert.equal(await page.locator('mental-math-widget').count(),3);
  await start(page);
  await answer(page,await correct(page));
  await answer(page,(await correct(page))+1);
  assert.equal(await widget(page).locator('.widget-stat-box').allTextContents().then(a=>a.join('|')),'Решено: 2|Ошибки: 1');
  assert.equal(await page.locator('#mental-math-2 input').isDisabled(),true);
  if(process.env.CAPTURE_DIR) await widget(page).screenshot({path:path.join(process.env.CAPTURE_DIR,'preview-desktop.png')});
  for(let i=0;i<6;i++) await answer(page,-999);
  assert.equal(await widget(page).locator('tbody tr').count(),5);
  await page.reload();
  assert.equal(await widget(page).locator('.widget-stat-box').first().textContent(),'Решено: 8');
  assert.equal(await widget(page).locator('input').isDisabled(),true);
});
test('Generated arithmetic is correct across all levels', async t => {
  const page = await pageFor(t);
  for(const level of ['easy','medium','hard']) {
    await widget(page).locator('select').first().selectOption(level);
    await start(page);
    for(let i=0;i<30;i++) await answer(page,await correct(page));
    assert.equal(await widget(page).locator('.widget-stat-box').last().textContent(),'Ошибки: 0');
    await widget(page).getByRole('button',{name:'Остановить'}).click();
  }
});
test('Timer expires and settings are locked during training', async t => {
  const page = await pageFor(t, p=>p.clock.install());
  await widget(page).locator('select').last().selectOption('30');
  await start(page);
  assert.equal(await widget(page).locator('select').first().isDisabled(),true);
  await page.clock.runFor(30000);
  assert.equal(await widget(page).locator('input').isDisabled(),true);
  assert.equal(await widget(page).locator('.widget-timer-value').textContent(),'Осталось: 00:00');
});
test('Elapsed wall-clock time ends session after background suspension', async t => {
  const page=await pageFor(t,p=>p.clock.install()); await start(page);
  await page.clock.fastForward(65000);
  assert.equal(await widget(page).locator('input').isDisabled(),true);
});
test('Storage access failures do not prevent training', async t => {
  const page=await pageFor(t,p=>p.addInitScript(()=>{
    Storage.prototype.getItem=()=>{throw new DOMException('Blocked','SecurityError');};
    Storage.prototype.setItem=()=>{throw new DOMException('Quota','QuotaExceededError');};
  }));
  await start(page); await answer(page,await correct(page));
  assert.equal(await widget(page).locator('.widget-stat-box').first().textContent(),'Решено: 1');
});
test('Corrupted saved history is discarded safely', async t => {
  const page=await pageFor(t,p=>p.addInitScript(()=>localStorage.setItem('mental-math-widget-mental-math-1',JSON.stringify({history:[null,{},'bad'],level:'easy',duration:60}))));
  assert.equal(await widget(page).locator('tbody').textContent(),'Пока ошибок нет');
  await start(page); assert.equal(await widget(page).locator('input').isEnabled(),true);
});
test('Invalid HTML settings fall back to valid defaults', async t => {
  const page=await pageFor(t);
  await page.evaluate(()=>{const e=document.createElement('mental-math-widget');e.id='invalid';e.setAttribute('data-level','oops');e.setAttribute('data-duration','-2');document.body.append(e);});
  assert.deepEqual(await page.locator('#invalid select').evaluateAll(nodes=>nodes.map(n=>n.value)),['easy','60']);
});
test('Removing and reconnecting an element stops its session without crashing', async t => {
  const page=await pageFor(t,p=>p.clock.install()); await start(page);
  await page.evaluate(()=>{window.removed=document.querySelector('#mental-math-1');window.removed.remove();});
  await page.clock.runFor(2000);
  await page.evaluate(()=>document.body.append(window.removed));
  assert.equal(await widget(page).locator('input').isDisabled(),true);
  await start(page); assert.equal(await widget(page).locator('input').isEnabled(),true);
});
test('Mobile viewport has no horizontal overflow', async t => {
  const page=await pageFor(t,p=>p.setViewportSize({width:375,height:812}));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  if(process.env.CAPTURE_DIR) await widget(page).screenshot({path:path.join(process.env.CAPTURE_DIR,'preview-mobile.png')});
});
test('Failed page data request displays a visible error', async t => {
  const page=await browser.newPage();t.after(()=>page.close());
  await page.route('**/data.json',route=>route.fulfill({status:500,body:'Error'}));
  await page.goto(base);
  await page.getByRole('alert').waitFor({timeout:3000});
});
test('Blank answers are ignored; Enter submits; restarting clears the input and counters', async t => {
  const page=await pageFor(t);await start(page);
  await widget(page).getByRole('button',{name:'Ответить',exact:true}).click();
  assert.equal(await widget(page).locator('.widget-stat-box').first().textContent(),'Решено: 0');
  await widget(page).locator('input').fill(String(await correct(page)));
  await widget(page).locator('input').press('Enter');
  assert.equal(await widget(page).locator('.widget-stat-box').first().textContent(),'Решено: 1');
  await widget(page).locator('input').fill('123');
  await widget(page).getByRole('button',{name:'Остановить'}).click();
  await start(page);
  assert.equal(await widget(page).locator('input').inputValue(),'');
  assert.equal(await widget(page).locator('.widget-stat-box').first().textContent(),'Решено: 0');
});
test('Widget without id remains usable without a shared persistence key', async t => {
  const page=await pageFor(t);
  await page.evaluate(()=>document.body.append(document.createElement('mental-math-widget')));
  const anonymous=page.locator('mental-math-widget:not([id])');
  await anonymous.getByRole('button',{name:'Начать',exact:true}).click();
  assert.equal(await anonymous.locator('input').isEnabled(),true);
  assert.equal(await page.evaluate(()=>localStorage.getItem('mental-math-widget-')),null);
});

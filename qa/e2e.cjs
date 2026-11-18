// Headless Chromium walkthrough at 390x844. Run: node qa/e2e.cjs
let pw; try { pw = require('playwright'); } catch { pw = require('/workspace/shots/node_modules/playwright'); }
const { chromium } = pw;
const fs = require('fs');
const BASE = process.env.BASE || 'http://localhost:4173/offbook/';
const OUT = process.env.OUT || '/workspace/english-app/redesign/v2-screens';
fs.mkdirSync(OUT, { recursive: true });

const INIT = () => {
  window.__asrQueue = [];
  class FakeRec {
    start() {
      setTimeout(() => {
        this.onspeechstart && this.onspeechstart();
        const t = window.__asrQueue.length ? window.__asrQueue.shift() : 'Okay sure';
        const r0 = { 0: { transcript: t }, isFinal: true, length: 1 };
        const res = { 0: r0, length: 1 };
        this.onresult && this.onresult({ resultIndex: 0, results: res });
        setTimeout(() => this.onend && this.onend(), 30);
      }, 600);
    }
    stop() {} abort() {}
  }
  window.SpeechRecognition = FakeRec;
  window.webkitSpeechRecognition = FakeRec;
  if (window.speechSynthesis) {
    window.speechSynthesis.speak = (u) => { setTimeout(() => u.onend && u.onend(), 300 + (u.text || '').length * 12); };
    window.speechSynthesis.cancel = () => {};
  }
};

const log = (...a) => console.log('•', ...a);
let n = 0;
async function shot(page, name, full = false) {
  n++;
  const f = `${OUT}/${String(n).padStart(2, '0')}-${name}.png`;
  await page.screenshot({ path: f, fullPage: full });
  log('shot', f);
}
async function asr(page, text) { await page.evaluate((t) => window.__asrQueue.push(t), text); }
async function waitYou(page) { await page.waitForSelector('.talk-btn.is-ready', { timeout: 20000 }); }

(async () => {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'zh-CN', acceptDownloads: true });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const FAKE = 'sk-fake-test-1234567890';
  const leaks = [];
  page.on('request', (r) => {
    const u = new URL(r.url());
    const blob = r.url() + JSON.stringify(r.headers()) + (r.postData() || '');
    if (blob.includes(FAKE) && u.hostname !== 'api.deepseek.com') leaks.push(r.url());
  });

  // ---------- first launch ----------
  await page.goto(BASE);
  await page.waitForSelector('.first');
  await shot(page, 'welcome');
  await page.getByText('开始，60 秒').click();
  await shot(page, 'goal');
  await page.getByText('和外国人聊天').click();
  await page.waitForSelector('.watch');
  await shot(page, 'first-watch-ready');
  await page.click('.play-btn');
  await page.waitForTimeout(5200);
  await shot(page, 'first-watch-playing');
  await page.getByText('听完了，下一步').click();
  await shot(page, 'first-quiz');
  await page.locator('.opt').first().click();
  await shot(page, 'first-quiz-answered');
  await page.getByText('继续').click();
  await page.waitForSelector('.call--ringing');
  await shot(page, 'first-call-ringing');
  await page.click('.round-btn--green');
  await waitYou(page);
  await shot(page, 'first-call-your-turn');
  await page.click('.ctrl >> nth=0');
  await page.click('.ctrl >> nth=0');
  await shot(page, 'first-call-hint-2');
  await asr(page, 'Nah I got this');
  await page.click('.talk-btn');
  await page.waitForTimeout(400);
  await shot(page, 'first-call-listening');
  await waitYou(page);
  await shot(page, 'first-call-turn-2');
  await asr(page, "yeah I'm sure I picked the place");
  await page.click('.talk-btn');
  await page.waitForSelector('.call--ended', { timeout: 20000 });
  await shot(page, 'first-call-ended');
  await page.getByText('看小结').click();
  await page.waitForSelector('.pace');
  await shot(page, 'first-pace');
  await page.getByText('正好').click();
  await page.waitForSelector('.today');
  await page.waitForTimeout(500);
  await shot(page, 'today');
  await shot(page, 'today-full', true);

  // tab bar overlap check
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);
  const overlap = await page.evaluate(() => {
    const bar = document.querySelector('.tabbar').getBoundingClientRect();
    const els = [...document.querySelectorAll('.app__main *')].filter((e) => e.children.length === 0 && e.textContent.trim());
    const last = els[els.length - 1].getBoundingClientRect();
    return { barTop: bar.top, lastBottom: last.bottom };
  });
  log('tabbar overlap check', overlap, overlap.lastBottom <= overlap.barTop ? 'OK' : 'OVERLAP');
  await shot(page, 'today-bottom');
  await page.evaluate(() => window.scrollTo(0, 0));

  // ---------- full episode 1 (scripted) ----------
  await page.getByText('开始 · 约 15 分钟').click();
  await page.waitForSelector('.watch');
  await page.click('.play-btn');
  await page.waitForTimeout(3500);
  await page.locator('.bubble').first().click();
  await page.waitForSelector('.sheet');
  await page.getByText('看中文意思').click();
  await shot(page, 'episode-line-sheet');
  await page.click('.sheet-backdrop', { position: { x: 20, y: 20 } });
  await page.getByText('听完了，下一步').click();
  await page.locator('.opt').nth(1).click();
  await shot(page, 'episode-quiz-wrong');
  await page.getByText('继续').click();
  await page.waitForSelector('.steal');
  await shot(page, 'steal-1');
  await asr(page, 'I got this');
  await page.click('.mic-btn');
  await page.waitForTimeout(1300);
  await shot(page, 'steal-1-lit');
  await page.getByText('下一句').click();
  await asr(page, 'you sure');
  await page.click('.mic-btn');
  await page.waitForTimeout(1300);
  await page.getByText('下一句').click();
  await asr(page, 'I can throw');
  await page.click('.mic-btn');
  await page.waitForTimeout(1300);
  await shot(page, 'steal-3');
  await page.getByText('收进句库').click();
  await page.waitForSelector('.call--ringing');
  await page.click('.round-btn--green');
  await waitYou(page);
  await asr(page, 'I pay this one');
  await page.click('.talk-btn');
  await waitYou(page);
  await page.click('.ctrl >> nth=1'); // keyboard
  await shot(page, 'call-typing-chips');
  await page.locator('.chip').first().click();
  await waitYou(page);
  await page.fill('.type-row input', 'you can pay the taxi');
  await page.click('.type-row button');
  await waitYou(page);
  await page.click('.ctrl >> nth=0');
  await page.click('.ctrl >> nth=0');
  await page.click('.ctrl >> nth=0');
  await shot(page, 'call-hint-3');
  await page.locator('.chip').first().click();
  await page.waitForSelector('.call--ended', { timeout: 20000 });
  await page.getByText('看小结').click();
  await page.waitForSelector('.pair, .phrase-row', { timeout: 10000 });
  await page.waitForTimeout(400);
  await shot(page, 'recap-scripted');
  await shot(page, 'recap-scripted-full', true);
  await page.getByText('这就够了').click();
  await page.waitForSelector('.today');
  await page.waitForTimeout(400);
  await shot(page, 'today-after-ep1');

  // ---------- 句库 ----------
  await page.click('.tab >> nth=1');
  await page.waitForSelector('.phrases');
  await page.waitForTimeout(300);
  await shot(page, 'phrases');
  await page.getByText(/练一遍/).click();
  await asr(page, 'I got this');
  await page.click('.mic-btn');
  await page.waitForTimeout(1500);
  await shot(page, 'phrases-review');
  await page.click('.practice__bar .icon-btn');

  // ---------- 我 / AI key ----------
  await page.click('.tab >> nth=2');
  await page.waitForSelector('.me');
  await shot(page, 'me');
  await page.locator('#ai').scrollIntoViewIfNeeded();
  await page.fill('input[name=deepseek-key]', FAKE);
  await shot(page, 'ai-key-masked');
  await page.click('[aria-label=显示密钥]');
  await shot(page, 'ai-key-shown');
  await page.click('[aria-label=隐藏密钥]');
  await page.getByText('测试连接').click();
  await page.waitForSelector('#ai .error', { timeout: 20000 });
  log('test result:', await page.textContent('#ai .error'));
  await page.locator('#ai').screenshot({ path: `${OUT}/${String(++n).padStart(2, '0')}-ai-test-error.png` });
  await page.getByText('保存', { exact: true }).click();
  await page.waitForTimeout(300);
  const status = await page.textContent('#ai .pill');
  log('ai pill after save:', status);
  await shot(page, 'me-ai-saved-full', true);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '导出备份' }).click()]);
  const p = await dl.path();
  const txt = fs.readFileSync(p, 'utf8');
  log('backup bytes', txt.length, 'contains key?', txt.includes(FAKE));

  // ---------- AI call with fake key against REAL DeepSeek (401 -> fallback) ----------
  await page.click('.tab >> nth=0');
  await page.getByText('只想说话').click();
  await page.waitForSelector('.call--ringing');
  await shot(page, 'ai-call-ringing');
  await page.click('.round-btn--green');
  await waitYou(page);
  await shot(page, 'ai-call-bad-key-fallback');
  await page.click('.hangup');
  await page.waitForTimeout(300);
  if (await page.$('.practice')) await page.click('.practice__bar .icon-btn').catch(() => {});

  // ---------- AI call with mocked DeepSeek stream ----------
  let turn = 0;
  const seenAuth = [];
  await page.route('https://api.deepseek.com/**', async (route) => {
    const req = route.request();
    seenAuth.push(req.headers()['authorization']);
    const body = JSON.parse(req.postData() || '{}');
    if (body.response_format) {
      const sys = body.messages[0].content;
      const json = sys.includes('pairs')
        ? { pairs: [{ said: 'I pay this one', better: "I've got this one.", noteZh: '“我来付”更地道的说法' }, { said: 'next time you pay', better: "You can get the next one.", noteZh: '用 get 表示请客' }], phrases: [{ en: "I've got this one.", zh: '这次我来' }, { en: 'Next one’s on you.', zh: '下次你请' }, { en: "Don't make it weird.", zh: '别搞得很别扭' }], praiseZh: '你很自然地接住了 Chris 的玩笑。' }
        : { zh: '告诉他这次你来付', first: "Don't even…", line: "Don't even. I got this." };
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ choices: [{ message: { content: JSON.stringify(json) } }] }) });
    }
    turn++;
    const lines = ["Oh, here, I'll grab the check real quick.", "Wait, you got it? You sure? I feel like I owe you.", "Okay, okay. Can I at least get the coffee after?", "Deal. See, that wasn't hard. Thanks, really. [END]"];
    const text = lines[Math.min(turn - 1, lines.length - 1)];
    const parts = text.match(/.{1,12}/g);
    const sse = parts.map((p) => `data: ${JSON.stringify({ choices: [{ delta: { content: p } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
    return route.fulfill({ status: 200, contentType: 'text/event-stream', headers: { 'access-control-allow-origin': '*' }, body: sse });
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByText('只想说话').click();
  await page.waitForSelector('.call--ringing');
  await page.click('.round-btn--green');
  await waitYou(page);
  await shot(page, 'ai-call-partner-line');
  await page.click('.ctrl >> nth=0');
  await page.waitForSelector('.hint-card');
  await shot(page, 'ai-call-hint');
  await asr(page, 'no no I pay this one');
  await page.click('.talk-btn');
  await waitYou(page);
  await asr(page, 'yes you paid last time');
  await page.click('.talk-btn');
  await waitYou(page);
  await asr(page, 'sure next time you pay');
  await page.click('.talk-btn');
  await page.waitForSelector('.call--ended', { timeout: 20000 });
  await page.getByText('看小结').click();
  await page.waitForSelector('.pair', { timeout: 10000 });
  await shot(page, 'ai-recap');
  await shot(page, 'ai-recap-full', true);
  log('auth headers seen by mock:', [...new Set(seenAuth)].map((a) => a && a.replace(/sk-.{6}/, 'sk-******')));
  await page.getByText('这就够了').click();
  await page.waitForSelector('.today');

  log('key leaks to non-deepseek hosts:', leaks.length ? leaks : 'none');
  log('page errors:', errors.length ? errors : 'none');
  await browser.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });

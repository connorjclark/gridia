import {ChildProcess} from 'child_process';

import expect from 'expect';
import puppeteer from 'puppeteer';

import {runStaticServer} from './test-utils.js';

const DEBUG = Boolean(process.env.DEBUG);

describe('e2e tests', function() {
  this.timeout(100_000);

  let browser: puppeteer.Browser;
  let page: puppeteer.Page;
  const childProcesses: ChildProcess[] = [];

  before(async () => {
    browser = await puppeteer.launch({
      headless: !DEBUG,
    });
    childProcesses.push(await runStaticServer());
  });

  after(async () => {
    await browser.close();
    for (const child of childProcesses) {
      child.kill();
    }
  });

  let messages: Message[] = [];
  let onMessage: (e: Message) => void;

  beforeEach(async () => {
    messages = [];
    page = await browser.newPage();
    page.evaluateOnNewDocument(() => {
      (window as any).Gridia = {
        debug(msg: Message) {
          (window as any).onMessage(msg);
        },
      };
    });
    await page.goto('http://localhost:8080?quick=local');
    await page.exposeFunction('onMessage', (msg: Message) => {
      // This runs in node.
      messages.push(msg);
      onMessage(msg);
    });
    await page.waitForSelector('.game:not(.hidden)');
  });

  afterEach(async () => {
    await page.close();
  });

  it('basic', async () => {
    await new Promise<void>((resolve) => onMessage = (msg: Message) => {
      if (msg.data?.type === 'animation') resolve();
    });

    expect(messages[0]).toMatchObject({id: 1, data: {type: 'login'}});
    expect(messages.find((msg) => msg.data?.type === 'animation')?.data)
      .toMatchObject({type: 'animation', args: {name: 'WarpIn'}});
  });
});

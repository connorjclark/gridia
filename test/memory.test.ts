import { ChildProcess, spawn } from 'child_process';
import * as puppeteer from 'puppeteer';

const DEBUG = Boolean(process.env.DEBUG);

jest.setTimeout(100 * 1000);

interface MemorySample {
  JSHeapUsedSize: number;
  additionalMemory: number;
  additionalMemoryPercentage: number;
}

interface Memory {
  baseline: puppeteer.Metrics;
  samples: MemorySample[];
  last: MemorySample;
}

async function collect(page: puppeteer.Page, numSamples: number, duration: number): Promise<Memory> {
  const baselineMetrics = await page.metrics();
  const samples = [];
  for (let i = 0; i < numSamples; i++) {
    const metrics = await page.metrics();
    const additionalMemory = metrics.JSHeapUsedSize - baselineMetrics.JSHeapUsedSize;
    const additionalMemoryPercentage = additionalMemory / baselineMetrics.JSHeapUsedSize;
    samples.push({
      JSHeapUsedSize: metrics.JSHeapUsedSize,
      additionalMemory,
      additionalMemoryPercentage,
    });
    await page.waitFor(duration);
  }

  return {
    baseline: baselineMetrics,
    samples,
    last: samples[samples.length - 1],
  };
}

function detect(memory: Memory) {
  const passed = memory.last.additionalMemoryPercentage < 0.1;
  const warn = passed && memory.last.additionalMemory > 0;

  if (warn) {
    console.warn(`slight increase in memory`);
  }
  if (!passed || warn || DEBUG) {
    const tabularData = memory.samples.map((m) => {
      const truncatedPercentage = Math.round(m.additionalMemoryPercentage * 100);
      const JSHeapUsedSize = Math.round(m.JSHeapUsedSize / 1024);
      const additionalMemory = `${m.additionalMemory >= 0 ? '+' : ''}${Math.round(m.additionalMemory / 1024)}%`;
      const additionalMemoryPercentage = `${m.additionalMemoryPercentage >= 0 ? '+' : ''}${truncatedPercentage}%`;
      return {
        'JSHeapUsedSize (KB)': JSHeapUsedSize.toString().padStart(8, ' '),
        '+/- baseline': additionalMemory.toString().padStart(8, ' '),
        '%': additionalMemoryPercentage.toString().padStart(4, ' '),
      };
    });
    console.log('baseline:');
    console.table(memory.baseline);
    console.log('samples:');
    console.table(tabularData);
  }
  if (!passed) {
    fail('memory leak / churn detected');
  }
}

// This is basic, just loading the game and letting it idle.
describe('Check for memory leaks', () => {
  let browser: puppeteer.Browser;
  let page: puppeteer.Page;
  const childProcesses: ChildProcess[] = [];

  beforeAll(async () => {
    browser = await puppeteer.launch({
      headless: !DEBUG,
    });

    console.warn('make sure to have run yarn build');
    await new Promise((resolve, reject) => {
      const childProcess = spawn('yarn', ['run-server']);
      childProcess.stdout.on('data', (data) => {
        if (data.toString().includes('Server started')) resolve();
      });
      childProcess.on('error', reject);
      childProcesses.push(childProcess);
    });
    await new Promise((resolve, reject) => {
      const childProcess = spawn('yarn', ['run-static-server']);
      childProcess.stdout.on('data', (data) => {
        if (data.toString().includes('Available on')) resolve();
      });
      childProcess.on('error', reject);
      childProcesses.push(childProcess);
    });
  });

  afterAll(async () => {
    await browser.close();
    for (const child of childProcesses) {
      child.kill();
    }
  });

  beforeEach(async () => {
    page = await browser.newPage();
    await page.goto('http://localhost:8080', {waitUntil: 'networkidle0'});
  });

  afterEach(async () => {
    await page.close();
  });

  it('at login page', async () => {
    // Let things settle.
    await page.waitFor(5000);

    const memory = await collect(page, 10, 1000);
    detect(memory);
  });

  it.skip('in game', async () => {
    await page.waitFor(2000);
    await page.$eval('.register--form input', (input: HTMLInputElement) => input.value = '');
    await page.type('.register--form input', 'player');
    await page.waitForSelector('.register-btn');
    await page.click('.register-btn');
    await page.waitForSelector('.game:not(.hidden)');
    // await page.$eval('.register--form', (form: HTMLFormElement) => form.submit());

    // Let things settle.
    await page.waitFor(10000);

    const memory = await collect(page, 60, 1000);
    detect(memory);
  });
});

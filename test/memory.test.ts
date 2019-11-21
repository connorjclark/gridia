import { ChildProcess, spawn } from 'child_process';
import * as puppeteer from 'puppeteer';

const DEBUG = Boolean(process.env.DEBUG);
const CI = Boolean(process.env.CI);
const QUERY = Boolean(process.env.QUERY);

jest.setTimeout((QUERY ? 200 : 100) * 1000);

interface MemorySample {
  JSHeapUsedSize: number;
  additionalMemory: number;
  additionalMemoryPercentage: number;
  objectCounts: Record<string, number>;
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
    const sample: MemorySample = {
      JSHeapUsedSize: metrics.JSHeapUsedSize,
      additionalMemory,
      additionalMemoryPercentage,
      objectCounts: {},
    };

    // This is expensive.
    if (QUERY) {
      const prototypes = [
        'PIXI.Rectangle.prototype',
        'PIXI.Texture.prototype',
        'PIXI.Sprite.prototype',
      ];
      for (const prototype of prototypes) {
        // tslint:disable-next-line: no-eval
        const prototypeHandle = await page.evaluateHandle((p) => eval(p), prototype);
        const objectsHandle = await page.queryObjects(prototypeHandle);
        const count = await page.evaluate((objects) => objects.length, objectsHandle);
        await prototypeHandle.dispose();
        await objectsHandle.dispose();
        sample.objectCounts[prototype.replace(/\./g,  '_') + '_count'] = count;
      }
    }

    samples.push(sample);
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
      const JSHeapUsedSize = `${Math.round(m.JSHeapUsedSize / 1024)}`;
      const additionalMemory = `${Math.round(m.additionalMemory / 1024)}`;
      const additionalMemoryPercentage = `${truncatedPercentage}`;
      return {
        'JSHeapUsedSize (KB)': JSHeapUsedSize.padStart(8, ' '),
        '+/- baseline': additionalMemory.padStart(8, ' '),
        '%': additionalMemoryPercentage.padStart(4, ' '),
        ...m.objectCounts,
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
      childProcess.on('close', reject);
      childProcess.on('error', reject);
      childProcesses.push(childProcess);
    }).catch(() => process.exit(1));
    await new Promise((resolve, reject) => {
      const childProcess = spawn('yarn', ['run-static-server']);
      childProcess.stdout.on('data', (data) => {
        if (data.toString().includes('Available on')) resolve();
      });
      childProcess.on('close', reject);
      childProcess.on('error', reject);
      childProcesses.push(childProcess);
    }).catch(() => process.exit(1));
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

  // This is basic, just loading the game and letting it idle.
  it('in game', async () => {
    // Takes too long, so just run if debugging.
    if (!DEBUG) return;

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

import {ChildProcess} from 'child_process';

import puppeteer from 'puppeteer';

import {runStaticServer} from './test-utils.js';

const DEBUG = Boolean(process.env.DEBUG);
const QUERY = Boolean(process.env.QUERY);

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
    if (metrics.JSHeapUsedSize === undefined) throw new Error('missing data');
    if (baselineMetrics.JSHeapUsedSize === undefined) throw new Error('missing data');

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
        /* eslint-disable */
        const prototypeHandle = await page.evaluateHandle((p) => eval(p), prototype);
        const objectsHandle = await page.queryObjects(prototypeHandle);
        const count = await page.evaluate((objects) => objects.length, objectsHandle);
        await prototypeHandle.dispose();
        await objectsHandle.dispose();
        sample.objectCounts[prototype.replace(/\./g,  '_') + '_count'] = count;
        /* eslint-enable */
      }
    }

    samples.push(sample);
    await page.waitForTimeout(duration);
  }

  return {
    baseline: baselineMetrics,
    samples,
    last: samples[samples.length - 1],
  };
}

function detect(memory: Memory) {
  const passed = memory.last.additionalMemoryPercentage < 0.1;
  const warn = passed && memory.last.additionalMemoryPercentage >= 0.05;

  if (warn) {
    console.warn('slight increase in memory');
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
    throw new Error('memory leak / churn detected');
  }
}

const describeSkipInCI = process.env.CI ? xdescribe : describe;

describeSkipInCI('Check for memory leaks', function() {
  this.timeout((QUERY ? 200 : 100) * 1000);

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

  beforeEach(async () => {
    page = await browser.newPage();
  });

  afterEach(async () => {
    await page.close();
  });

  // This is basic, just loading the game and letting it idle.
  it('in game', async () => {
    await page.goto('http://localhost:8080?quick=local', {waitUntil: 'networkidle0'});
    await page.waitForSelector('.game:not(.hidden)');

    // Let things settle.
    await page.waitForTimeout(10_000);

    const memory = await collect(page, 60, 1000);
    detect(memory);
  });
});

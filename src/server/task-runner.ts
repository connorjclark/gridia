export interface Rate {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  ms?: number;
}

interface TickSectionBase {
  description: string;
  rate?: Rate;
}

export type TickSection = TickSectionBase & (
  | { fn: (() => Promise<void>) | (() => void) }
  | { generator: Generator | (() => Generator) }
);

interface PerfTick {
  started: number;
  duration: number;
  sections: Array<{ name: string; duration: number }>;
}

export class TaskRunner {
  debugMeasureTiming = false;
  perf = {
    ticks: [] as PerfTick[],
    tickDurationAverage: 0,
    tickDurationMax: 0,
  };
  private tickSections: TickSection[] = [];
  private ticks = 0;
  private resetTickRate: Rate = {days: 10};
  private tickTimeoutHandle?: NodeJS.Timeout;
  private lastTickTime = 0;
  private unprocessedTickTime = 0;

  constructor(private tickDuration: number) {
  }

  start() {
    this.tickTimeoutHandle = setInterval(() => {
      this.tick();
    }, 10);
  }

  stop() {
    if (this.tickTimeoutHandle) clearInterval(this.tickTimeoutHandle);
    this.tickTimeoutHandle = undefined;
  }

  async tick() {
    const now = performance.now();
    this.unprocessedTickTime += now - this.lastTickTime;
    this.lastTickTime = now;

    while (this.unprocessedTickTime >= this.tickDuration) {
      this.unprocessedTickTime -= this.tickDuration;
      try {
        await this.tickImpl();
      } catch (err) {
        throw err;
      }
    }
  }

  getTicks() {
    return this.ticks;
  }

  registerTickSection(section: TickSection) {
    this.tickSections.push(section);
    return section;
  }

  unregisterTickSection(section: TickSection) {
    const index = this.tickSections.indexOf(section);
    if (index !== undefined) this.tickSections.splice(index, 1);
  }

  registerForNextTick(options: Exclude<TickSection, 'rate'>) {
    this.registerTickSection({...options, rate: {ms: 0}});
  }

  rateToTicks({days = 0, hours = 0, minutes = 0, seconds = 0, ms = 0}) {
    let ms_ = ms;
    ms_ += seconds * 1000;
    ms_ += minutes * 1000 * 60;
    ms_ += hours * 1000 * 60 * 60;
    ms_ += days * 1000 * 60 * 60 * 24;
    return Math.floor(ms_ / this.tickDuration);
  }

  private async tickImpl() {
    this.ticks++;
    if (this.rateMatchesCurrentTick(this.resetTickRate)) this.ticks = 0;

    let perfTick: PerfTick | undefined;
    if (this.debugMeasureTiming) perfTick = {started: performance.now(), duration: 0, sections: []};

    for (const section of [...this.tickSections]) {
      if (section.rate !== undefined && !this.rateMatchesCurrentTick(section.rate)) continue;

      if (!perfTick) {
        await this.handleTickSection(section);
      } else {
        const now = performance.now();
        await this.handleTickSection(section);
        const duration = performance.now() - now;
        perfTick.sections.push({name: section.description, duration});
      }

      // Remove sections that run only once.
      if (section.rate === 0) this.tickSections.splice(this.tickSections.indexOf(section), 1);
    }

    if (perfTick) {
      perfTick.duration = performance.now() - perfTick.started;
      this.perf.ticks.push(perfTick);
    }
  }

  private rateMatchesCurrentTick(rate: Rate) {
    const ticks = this.rateToTicks(rate);
    if (ticks === 0) return true;
    return this.ticks % ticks === 0;
  }

  private async handleTickSection(section: TickSection) {
    if ('fn' in section) {
      const result = section.fn();
      if (result instanceof Promise) await result;
      return;
    }

    let it;
    if (section.generator instanceof Function) {
      it = section.generator();
    } else {
      it = section.generator;
    }

    const start = performance.now();
    while (!it.next().done) {
      if (performance.now() - start > this.tickDuration * 0.5) {
        this.registerForNextTick({...section, generator: it});
        break;
      }
    }
  }
}

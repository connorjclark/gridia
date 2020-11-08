import performance from '../performance';
import * as Utils from '../utils';

interface TickSectionBase {
  description: string;
  rate?: number;
}

type TickSection = TickSectionBase & (
  | { fn: (() => Promise<void>) | (() => void) }
  | { generator: Generator | (() => Generator) }
);

interface PerfTick {
  started: number;
  duration: number;
  sections: Array<{ name: string, duration: number }>;
}

export default class TaskRunner {
  public debugMeasureTiming = false;

  public perf = {
    ticks: [] as PerfTick[],
    tickDurationAverage: 0,
    tickDurationMax: 0,
  };

  private tickSections: TickSection[] = [];

  private ticks = 0;

  private resetTickRate = Utils.RATE({ days: 10 });

  public async tick() {
    this.ticks++;
    if (this.ticks % this.resetTickRate === 0) this.ticks = 0;

    let perfTick: PerfTick | undefined;
    if (this.debugMeasureTiming) perfTick = { started: performance.now(), duration: 0, sections: [] };

    for (const section of [...this.tickSections]) {
      if (section.rate !== undefined && section.rate > 1 && this.ticks % section.rate !== 0) continue;

      if (!perfTick) {
        await this.handleTickSection(section);
      } else {
        const now = performance.now();
        await this.handleTickSection(section);
        const duration = performance.now() - now;
        perfTick.sections.push({ name: section.description, duration });
      }

      // Remove sections that run only once.
      if (section.rate === 0) this.tickSections.splice(this.tickSections.indexOf(section), 1);
    }

    if (perfTick) {
      perfTick.duration = performance.now() - perfTick.started;
      this.perf.ticks.push(perfTick);
    }
  }

  public registerTickSection(section: TickSection) {
    this.tickSections.push(section);
  }

  public registerForNextTick(options: Exclude<TickSection, 'rate'>) {
    this.registerTickSection({ ...options, rate: 0 });
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
      if (performance.now() - start > Utils.TICK_DURATION * 0.5) {
        this.registerForNextTick({ ...section, generator: it });
        break;
      }
    }
  }
}

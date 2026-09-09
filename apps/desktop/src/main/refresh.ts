import type { LibraryService } from "./library";

export interface RefreshState {
  running: boolean;
  checkedAt?: string;
  failures: string[];
}

/** One scheduler per local library. Lifecycle triggers share the same in-flight run. */
export class RefreshScheduler {
  state: RefreshState = { running: false, failures: [] };
  private pending?: Promise<void>;
  constructor(
    private readonly library: LibraryService,
    private readonly changed: (state: RefreshState) => void,
  ) {}
  run(force = false): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.refresh(force).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async refresh(force: boolean): Promise<void> {
    this.state = { ...this.state, running: true, failures: [] };
    this.changed(this.state);
    const podcasts = await this.library.listPodcasts();
    const failures: string[] = [];
    let index = 0;
    await Promise.all(
      Array.from({ length: Math.min(3, podcasts.length) }, async () => {
        while (index < podcasts.length) {
          const podcast = podcasts[index++];
          try {
            await this.library.refresh(podcast.id, force);
          } catch (error) {
            failures.push(
              `${podcast.title}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
        }
      }),
    );
    this.state = { running: false, checkedAt: new Date().toISOString(), failures };
    this.changed(this.state);
  }
}

import type { Requestor } from '../http/requestor.js';

/**
 * Read-only library item. Beyond `id`, `enabled`, and `source`
 * (`'domain'` rows shadow same-id `'store'` rows), payloads are free-form.
 */
export interface LibraryItem {
  id: string;
  enabled?: boolean;
  source?: 'domain' | 'store';
  [key: string]: unknown;
}

/**
 * Generic read-only resource for workflows / connectors / rules / profiles /
 * optimize presets. Envelope keys differ per resource (and are not always
 * the path name — optimize-presets uses `presets`).
 */
export class LibraryResource {
  constructor(
    private readonly requestor: Requestor,
    private readonly path: string,
    private readonly listKey: string,
    private readonly itemKey: string,
  ) {}

  async list(): Promise<LibraryItem[]> {
    const { data } = await this.requestor.json<Record<string, LibraryItem[]>>('GET', this.path);
    return data[this.listKey] ?? [];
  }

  async retrieve(id: string): Promise<LibraryItem> {
    const { data } = await this.requestor.json<Record<string, LibraryItem>>(
      'GET',
      `${this.path}/${id}`,
    );
    return data[this.itemKey] as LibraryItem;
  }
}

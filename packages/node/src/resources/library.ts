import type { Requestor } from '../http/requestor.js';

/**
 * A record from one of the setup collections. Beyond `id`, `enabled`, and
 * `source` (`'domain'` rows shadow same-id `'store'` rows), payloads are
 * free-form: the API's JSON schemas describe them.
 */
export interface LibraryItem {
  id: string;
  enabled?: boolean;
  source?: 'domain' | 'store';
  draft?: boolean;
  customized?: boolean;
  [key: string]: unknown;
}

/** What a write answers: the record as saved (or as it would be, with `dryRun`). */
export interface WriteResult<T = LibraryItem> {
  record: T;
  /** True when nothing was saved (`dryRun: true` was sent). */
  dryRun?: boolean;
}

/** `publish()`: the record, live now, and every id published with it (drafts it pointed at come first). */
export interface PublishResult extends WriteResult {
  published: string[];
}

/** `revert()`: the catalog record that applies again, and whether there was a copy to drop. */
export interface RevertResult extends WriteResult {
  reverted: boolean;
}

/** `del()`: `{ id, deleted: true }`. */
export interface DeletedRecord {
  id?: string;
  deleted: true;
  [key: string]: unknown;
}

export interface CreateOptions {
  /** Save as a draft: hidden from the storefront and dashboard until published; jobs can still run against it by id. */
  draft?: boolean;
  /** Validate and check references without saving. */
  dryRun?: boolean;
}

export interface UpdateOptions {
  /** Validate and check references without saving. */
  dryRun?: boolean;
}

export const flag = (value: boolean | undefined): string | undefined =>
  value ? 'true' : undefined;

/**
 * List / get / create / update (JSON Merge Patch) / delete over one API
 * collection. Envelope keys differ per resource (and are not always the path
 * name — optimize-presets uses `presets`).
 */
export class RecordResource<T = LibraryItem> {
  constructor(
    protected readonly requestor: Requestor,
    protected readonly path: string,
    protected readonly listKey: string,
    protected readonly itemKey: string,
  ) {}

  protected url(id: string, suffix = ''): string {
    return `${this.path}/${encodeURIComponent(id)}${suffix}`;
  }

  protected async listWith(query: Record<string, string | undefined> = {}): Promise<T[]> {
    const { data } = await this.requestor.json<Record<string, T[]>>('GET', this.path, { query });
    return data[this.listKey] ?? [];
  }

  protected toResult<R extends WriteResult<T>>(data: Record<string, unknown>): R {
    const { [this.itemKey]: record, ...rest } = data;
    return { record: record as T, ...rest } as R;
  }

  async list(): Promise<T[]> {
    return this.listWith();
  }

  async retrieve(id: string): Promise<T> {
    const { data } = await this.requestor.json<Record<string, T>>('GET', this.url(id));
    return data[this.itemKey] as T;
  }

  async create(
    record: Record<string, unknown>,
    options: UpdateOptions = {},
  ): Promise<WriteResult<T>> {
    const { data } = await this.requestor.json<Record<string, unknown>>('POST', this.path, {
      body: record,
      query: { dryRun: flag(options.dryRun) },
      idempotent: false,
    });
    return this.toResult(data);
  }

  /** A JSON Merge Patch (RFC 7396): send only what changes; `null` removes a key; arrays replace. */
  async update(
    id: string,
    patch: Record<string, unknown>,
    options: UpdateOptions = {},
  ): Promise<WriteResult<T>> {
    const { data } = await this.requestor.json<Record<string, unknown>>('PATCH', this.url(id), {
      body: patch,
      query: { dryRun: flag(options.dryRun) },
      idempotent: false,
    });
    return this.toResult(data);
  }

  async del(id: string): Promise<DeletedRecord> {
    const { data } = await this.requestor.json<Record<string, DeletedRecord>>(
      'DELETE',
      this.url(id),
      { idempotent: false },
    );
    return data[this.itemKey] as DeletedRecord;
  }
}

/**
 * The catalog collections — workflows, rules, profiles, connectors, optimize
 * presets: your records merged with the built-in catalog, copy-on-write
 * customisation, drafts.
 */
export class LibraryResource extends RecordResource<LibraryItem> {
  /** `drafts: true` includes your unpublished drafts (marked `draft: true`). */
  override async list(options: { drafts?: boolean } = {}): Promise<LibraryItem[]> {
    return this.listWith({ drafts: flag(options.drafts) });
  }

  override async create(
    record: Record<string, unknown>,
    options: CreateOptions = {},
  ): Promise<WriteResult> {
    const { data } = await this.requestor.json<Record<string, unknown>>('POST', this.path, {
      body: record,
      query: { draft: flag(options.draft), dryRun: flag(options.dryRun) },
      idempotent: false,
    });
    return this.toResult(data);
  }

  /** Makes a draft live, with the drafts it points at. */
  async publish(id: string): Promise<PublishResult> {
    const { data } = await this.requestor.json<Record<string, unknown>>(
      'POST',
      this.url(id, '/publish'),
      { idempotent: false },
    );
    return this.toResult<PublishResult>(data);
  }

  /** Drops your copy of a catalog record (or un-hides one you deleted). */
  async revert(id: string): Promise<RevertResult> {
    const { data } = await this.requestor.json<Record<string, unknown>>(
      'POST',
      this.url(id, '/revert'),
      { idempotent: false },
    );
    return this.toResult<RevertResult>(data);
  }
}

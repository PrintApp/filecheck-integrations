import type { Requestor } from '../http/requestor.js';
import { type DeletedRecord, RecordResource, type UpdateOptions, flag } from './library.js';

/** A record whose shape the API's JSON schema describes (destination, webhook, settings…). */
export type SetupRecord = Record<string, unknown> & { id?: string };

/** `POST …/{id}/test`: whether the sample delivery got through. */
export interface TestResult {
  ok: boolean;
  [key: string]: unknown;
}

/**
 * Delivery destinations: SFTP / FTP hotfolders, S3, webhooks, email. Secret
 * params are write-only and read back as `********`.
 */
export class DestinationsResource extends RecordResource<SetupRecord> {
  constructor(requestor: Requestor) {
    super(requestor, '/destinations', 'destinations', 'destination');
  }

  /**
   * Delivers a sample order (TEST-1001, one-page Sample_Product.pdf) through
   * the real transport. Hotfolders really receive the file.
   */
  async test(id: string): Promise<TestResult> {
    const { data } = await this.requestor.json<{ test: TestResult }>(
      'POST',
      this.url(id, '/test'),
      { idempotent: false },
    );
    return data.test;
  }
}

/** HTTP callbacks for job, proof, account and billing events. */
export class WebhooksResource extends RecordResource<SetupRecord> {
  constructor(requestor: Requestor) {
    super(requestor, '/webhooks', 'webhooks', 'webhook');
  }

  /** The event types a webhook can subscribe to. */
  async events(): Promise<SetupRecord[]> {
    const { data } = await this.requestor.json<{ events: SetupRecord[] }>('GET', '/webhook-events');
    return data.events ?? [];
  }

  /** Sends a signed test event to the webhook's URL. */
  async test(id: string): Promise<TestResult> {
    const { data } = await this.requestor.json<{ test: TestResult }>(
      'POST',
      this.url(id, '/test'),
      { idempotent: false },
    );
    return data.test;
  }
}

export interface ProductMap {
  productId: string;
  workflowId?: string | null;
  title?: string;
  url?: string | null;
  [key: string]: unknown;
}

/** Which workflow each product in the store opens. */
export class ProductMapsResource {
  constructor(private readonly requestor: Requestor) {}

  async list(): Promise<ProductMap[]> {
    const { data } = await this.requestor.json<{ productMaps: ProductMap[] }>(
      'GET',
      '/product-maps',
    );
    return data.productMaps ?? [];
  }

  /** Maps a product (Shopify: its numeric id) to a published workflow. */
  async set(
    productId: string,
    map: Record<string, unknown>,
    options: UpdateOptions = {},
  ): Promise<{ record: ProductMap; dryRun?: boolean }> {
    const { data } = await this.requestor.json<{ productMap: ProductMap; dryRun?: boolean }>(
      'PUT',
      `/product-maps/${encodeURIComponent(productId)}`,
      { body: map, query: { dryRun: flag(options.dryRun) } },
    );
    return { record: data.productMap, ...(data.dryRun && { dryRun: true }) };
  }

  async del(productId: string): Promise<DeletedRecord> {
    const { data } = await this.requestor.json<{ productMap: DeletedRecord }>(
      'DELETE',
      `/product-maps/${encodeURIComponent(productId)}`,
    );
    return data.productMap;
  }
}

export interface StoreProductPage {
  products: SetupRecord[];
  hasMore: boolean;
  nextCursor: string | null;
}

/** Products in the connected store (Shopify), each with the workflow it is mapped to. */
export class ProductsResource {
  constructor(private readonly requestor: Requestor) {}

  async search(params: { search?: string; cursor?: string } = {}): Promise<StoreProductPage> {
    const { data } = await this.requestor.json<StoreProductPage>('GET', '/products', {
      query: { search: params.search, cursor: params.cursor },
    });
    return {
      products: data.products ?? [],
      hasMore: !!data.hasMore,
      nextCursor: data.nextCursor ?? null,
    };
  }
}

/** How the storefront Element appears on product pages. */
export class SettingsResource {
  constructor(private readonly requestor: Requestor) {}

  async retrieve(): Promise<SetupRecord> {
    const { data } = await this.requestor.json<{ settings: SetupRecord }>('GET', '/settings');
    return data.settings;
  }

  /** Send only what changes; `null` puts a setting back to its default. */
  async update(
    patch: Record<string, unknown>,
    options: UpdateOptions = {},
  ): Promise<{ record: SetupRecord; dryRun?: boolean }> {
    const { data } = await this.requestor.json<{ settings: SetupRecord; dryRun?: boolean }>(
      'PATCH',
      '/settings',
      { body: patch, query: { dryRun: flag(options.dryRun) }, idempotent: false },
    );
    return { record: data.settings, ...(data.dryRun && { dryRun: true }) };
  }
}

import type { Requestor } from '../http/requestor.js';
import type { OrderResult } from '../types/job.js';

export class OrdersResource {
  constructor(private readonly requestor: Requestor) {}

  /** `POST /orders/{id}` — attach/refresh order data on the tenant's jobs. */
  async create(orderId: string, params: Record<string, unknown>): Promise<OrderResult> {
    const { data } = await this.requestor.json<OrderResult>(
      'POST',
      `/orders/${encodeURIComponent(orderId)}`,
      { body: params, idempotent: false },
    );
    return data;
  }
}

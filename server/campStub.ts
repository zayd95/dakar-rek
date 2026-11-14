import { DurableObject } from 'cloudflare:workers';

/**
 * Rollback only (branch rollback/production-before-release-1.0.1): the 1.0 game with the server class that 1.0.1's migration `v3-grand-camp` created.
 * Once that migration is applied to the public Worker, a deployment must still declare the class, or the deployment is refused; deleting the class
 * would need a `deleted_classes` migration, which destroys its storage. So the 1.0 code keeps the class, empty: it answers nothing and stores nothing.
 * Entry fees still held when 1.0.1 is rolled back stay in the ledger's Grand Camp tables (add-only), untouched, for a later release to return.
 */
export class GrandCamp extends DurableObject {
  async fetch(): Promise<Response> { return new Response('Grand Camp is not available in this version', { status: 503 }); }
}

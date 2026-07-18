import worker, { SessionCoordinator } from "../../worker/index.js";

export { SessionCoordinator };

export async function onRequest(context) {
  return worker.fetch(context.request, context.env);
}


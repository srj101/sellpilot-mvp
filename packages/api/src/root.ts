import { agentRouter } from "./router/agent";
import { analyticsRouter } from "./router/analytics";
import { authRouter } from "./router/auth";
import { checkoutRouter } from "./router/checkout";
import { customersRouter } from "./router/customers";
import { dashboardRouter } from "./router/dashboard";
import { ecommerceRouter } from "./router/ecommerce";
import { inboxRouter } from "./router/inbox";
import { integrationsRouter } from "./router/integrations";
import { offersRouter } from "./router/offers";
import { orgRouter } from "./router/org";
import { ordersRouter } from "./router/orders";
import { postRouter } from "./router/post";
import { productsRouter } from "./router/products";
import { rolesRouter } from "./router/roles";
import { settingsRouter } from "./router/settings";
import { superadminRouter } from "./router/superadmin";
import { usersRouter } from "./router/users";
import { createTRPCRouter } from "./trpc";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  post: postRouter,
  agent: agentRouter,
  checkout: checkoutRouter,
  analytics: analyticsRouter,
  inbox: inboxRouter,
  integrations: integrationsRouter,
  dashboard: dashboardRouter,
  ecommerce: ecommerceRouter,
  products: productsRouter,
  customers: customersRouter,
  orders: ordersRouter,
  offers: offersRouter,
  org: orgRouter,
  roles: rolesRouter,
  settings: settingsRouter,
  superadmin: superadminRouter,
  users: usersRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

import { agentRouter } from "./router/agent";
import { analyticsRouter } from "./router/analytics";
import { authRouter } from "./router/auth";
import { checkoutRouter } from "./router/checkout";
import { customersRouter } from "./router/customers";
import { dashboardRouter } from "./router/dashboard";
import { ecommerceRouter } from "./router/ecommerce";
import { inboxRouter } from "./router/inbox";
import { integrationsRouter } from "./router/integrations";
import { notificationsRouter } from "./router/notifications";
import { activityRouter } from "./router/activity";
import { offersRouter } from "./router/offers";
import { businessRouter } from "./router/business";
import { ordersRouter } from "./router/orders";
import { paymentsRouter } from "./router/payments";
import { postRouter } from "./router/post";
import { productsRouter } from "./router/products";
import { storeConnectionsRouter } from "./router/store-connections";
import { importsRouter } from "./router/imports";
import { rolesRouter } from "./router/roles";
import { settingsRouter } from "./router/settings";
import { bugReportsRouter } from "./router/bug-reports";
import { subscriptionRouter } from "./router/subscription";
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
  storeConnections: storeConnectionsRouter,
  imports: importsRouter,
  customers: customersRouter,
  orders: ordersRouter,
  payments: paymentsRouter,
  offers: offersRouter,
  business: businessRouter,
  subscription: subscriptionRouter,
  roles: rolesRouter,
  settings: settingsRouter,
  bugReports: bugReportsRouter,
  superadmin: superadminRouter,
  users: usersRouter,
  notifications: notificationsRouter,
  activity: activityRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

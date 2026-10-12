import { Router } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import { attachClinicContext, requireClinicOwner } from "../middleware/clinic-context.js";
import * as subscriptionsController from "../controllers/subscriptions.controller.js";

export const adminSubscriptionsRouter = Router();
adminSubscriptionsRouter.use(authenticate, requireRole(Role.SUPER_ADMIN));
adminSubscriptionsRouter.get("/overview", subscriptionsController.overview);
adminSubscriptionsRouter.get("/earnings", subscriptionsController.earnings);
adminSubscriptionsRouter.get("/plans", subscriptionsController.listPlans);
adminSubscriptionsRouter.post("/plans", subscriptionsController.createPlan);
adminSubscriptionsRouter.put("/plans/:planId", subscriptionsController.updatePlan);
adminSubscriptionsRouter.patch("/plans/:planId/status", subscriptionsController.setPlanActive);
adminSubscriptionsRouter.get("/", subscriptionsController.listSubscriptions);
adminSubscriptionsRouter.get("/:subscriptionId", subscriptionsController.getSubscription);
adminSubscriptionsRouter.post("/assign", subscriptionsController.assignSubscription);

export const doctorSubscriptionsRouter = Router();
doctorSubscriptionsRouter.use(
  authenticate,
  requireRole(Role.DOCTOR, Role.CLINIC_STAFF),
  attachClinicContext,
);
doctorSubscriptionsRouter.get("/plans", subscriptionsController.listPublicPlans);
doctorSubscriptionsRouter.get("/access", subscriptionsController.getAccess);
doctorSubscriptionsRouter.get("/", requireClinicOwner, subscriptionsController.getMine);
doctorSubscriptionsRouter.post(
  "/checkout/confirm",
  requireClinicOwner,
  subscriptionsController.confirmCheckout,
);
doctorSubscriptionsRouter.post("/checkout", requireClinicOwner, subscriptionsController.startCheckout);

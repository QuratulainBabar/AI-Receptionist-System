import { Router } from "express";
import * as synthflowController from "../controllers/synthflow.controller.js";

export const synthflowRouter = Router();

/** Synthflow Deployment Settings → Phone → Inbound Webhook URL */
synthflowRouter.post("/inbound", synthflowController.inbound);

/** Synthflow Deployment Settings → Phone → Data Webhook URL (post-call) */
synthflowRouter.get("/data", synthflowController.dataHealth);
synthflowRouter.post("/data", synthflowController.data);
synthflowRouter.get("/inbound", synthflowController.dataHealth);


/** Optional custom actions the agent can invoke mid-call */
synthflowRouter.post("/actions/book", synthflowController.bookAction);
synthflowRouter.post("/actions/availability", synthflowController.availabilityAction);

/** Helper for operators — returns the complete webhook URLs for this environment */
synthflowRouter.get("/urls", synthflowController.urls);

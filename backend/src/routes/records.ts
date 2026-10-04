import { Router } from "express";
import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import { Role } from "@prisma/client";
import { authenticate, requireRole } from "../middleware/auth.js";
import { AppError } from "../utils/AppError.js";
import * as recordsController from "../controllers/records.controller.js";

export const recordsRouter = Router();

recordsRouter.use(authenticate, requireRole(Role.PATIENT));

function handleUpload(req: Request, res: Response, next: NextFunction) {
  recordsController.uploadMiddleware(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return next(new AppError(400, "File must be 10 MB or smaller"));
      }
      return next(new AppError(400, error.message));
    }
    return next(error);
  });
}

recordsRouter.get("/", recordsController.list);
recordsRouter.post("/", handleUpload, recordsController.upload);
recordsRouter.get("/:recordId/file", recordsController.viewFile);

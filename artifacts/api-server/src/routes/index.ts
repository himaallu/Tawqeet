import { Router, type IRouter } from "express";
import demoRouter from "./demo";
import healthRouter from "./health";
import authRouter from "./auth";
import agencyRouter from "./agency";
import clientsRouter from "./clients";
import systemRouter from "./system";
import brainRouter from "./brain";
import signalSettingsRouter from "./signal-settings";
import reviewRouter from "./review";
import operationsRouter from "./operations";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(agencyRouter);
router.use(clientsRouter);
router.use(brainRouter);
router.use(systemRouter);
router.use(signalSettingsRouter);
router.use(reviewRouter);
router.use(operationsRouter);
router.use(demoRouter);

export default router;

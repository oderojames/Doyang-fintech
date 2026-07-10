import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import webhookRouter from "./routes/webhooks";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());

// Paystack webhook MUST be mounted before express.json() because signature
// verification requires the raw request body (HMAC-SHA512 of the raw bytes).
// express.raw() captures it as a Buffer; express.json() would replace it.
app.use(
  "/api/webhooks",
  express.raw({ type: "application/json" }),
  webhookRouter,
);

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use("/api", router);

export default app;

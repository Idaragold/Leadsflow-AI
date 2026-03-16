import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import Stripe from "stripe";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(cors());
  app.use(express.json());

  // API Routes
  app.post("/api/create-checkout-session", async (req, res) => {
    try {
      const { plan, userId } = req.body;
      
      const prices: Record<string, number> = {
        'Basic': 1900, // $19.00
        'Growth': 4900, // $49.00
        'Premium': 9900, // $99.00
      };

      const baseUrl = process.env.APP_URL || req.headers.origin || `http://localhost:${PORT}`;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `LeadFlow AI ${plan} Plan`,
              },
              unit_amount: prices[plan] || 0,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${baseUrl}/?payment=success&plan=${plan}`,
        cancel_url: `${baseUrl}/?payment=cancel`,
        metadata: {
          userId,
          plan,
        },
      });

      res.json({ url: session.url });
    } catch (error: any) {
      console.error("Stripe error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

import axios from "axios";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST method" });
    }

    if (!process.env.NOWPAYMENTS_API_KEY) {
      return res.status(500).json({ error: "NOWPAYMENTS_API_KEY missing" });
    }

    // 🔥 SAFE BODY PARSE
    let body = req.body;

    if (typeof body === "string") {
      body = JSON.parse(body);
    }

    const { amount, userId } = body || {};

    console.log("Incoming Data:", body);

    if (!amount || !userId) {
      return res.status(400).json({
        error: "Missing amount or userId",
      });
    }

    // 🔥 FIXED PAY CURRENCY
    const response = await axios.post(
      "https://api.nowpayments.io/v1/payment",
      {
        price_amount: Number(amount),
        price_currency: "usd",
        pay_currency: "usdttrc20", // ✅ FIX HERE
        order_id: userId,
        order_description: "Deposit",
      },
      {
        headers: {
          "x-api-key": process.env.NOWPAYMENTS_API_KEY,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("NOWPayments Response:", response.data);

    return res.status(200).json(response.data);

  } catch (error: any) {
    console.error("NOWPAY ERROR FULL:", error);

    return res.status(500).json({
      error: "Payment creation failed",
      details: error?.response?.data || error.message,
    });
  }
}
import axios from "axios";
import type { VercelRequest, VercelResponse } from "@vercel/node";

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    // ✅ Method check
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Use POST method" });
    }

    // ✅ Env check
    if (!process.env.NOWPAYMENTS_API_KEY) {
      return res.status(500).json({ error: "NOWPAYMENTS_API_KEY missing" });
    }

    // ✅ Body safe parsing
    const { amount, userId } = req.body || {};

    if (!amount || !userId) {
      return res.status(400).json({
        error: "Missing required fields: amount or userId",
      });
    }

    // ✅ Create payment
    const response = await axios.post(
      "https://api.nowpayments.io/v1/payment",
      {
        price_amount: Number(amount),
        price_currency: "usd",
        pay_currency: "usdt",
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

    // ✅ Success response
    return res.status(200).json(response.data);

  } catch (error: any) {
    console.error("NOWPAY ERROR:", error?.response?.data || error.message);

    return res.status(500).json({
      error: "Payment creation failed",
      details: error?.response?.data || error.message,
    });
  }
}
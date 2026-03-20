const axios = require("axios");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  try {
    if (!process.env.NOWPAYMENTS_API_KEY) {
      return res.status(500).json({ error: "API key missing" });
    }

    const { amount, userId } = req.body;

    const response = await axios.post(
      "https://api.nowpayments.io/v1/payment",
      {
        price_amount: amount,
        price_currency: "usd",
        pay_currency: "usdt",
        order_id: userId,
        order_description: "Deposit",
      },
      {
        headers: {
          "x-api-key": process.env.NOWPAYMENTS_API_KEY,
        },
      }
    );

    return res.status(200).json(response.data);
  } catch (err) {
    console.error("NOWPAY ERROR:", err.response?.data || err.message);
    return res.status(500).json({ error: "Payment creation failed" });
  }
};
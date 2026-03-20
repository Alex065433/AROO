import axios from "axios"

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed")
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body
    const { amount, userId } = body

    const response = await axios.post(
      "https://api.nowpayments.io/v1/payment",
      {
        price_amount: Number(amount),
        price_currency: "usd",
        pay_currency: "usdt",
        order_id: userId,
        order_description: "Deposit"
      },
      {
        headers: {
          "x-api-key": process.env.NOWPAYMENTS_API_KEY,
          "Content-Type": "application/json"
        }
      }
    )

    return res.status(200).json(response.data)

  } catch (err: any) {
    console.error("NOWPAY ERROR:", err.response?.data || err.message)
    return res.status(500).json({ error: "Payment creation failed" })
  }
}
import axios from "axios"

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).send("Method Not Allowed")
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body
    const { amount, userId } = body

    const response = await fetch('/api/payments/create', {
  method: 'POST', // Check if this is missing or misspelled
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(paymentData),
});
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
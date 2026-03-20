export default async function handler(req, res) {

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed')
  }

  try {
    const { amount, user_id } = req.body

    const response = await fetch('https://api.nowpayments.io/v1/payment', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.NOWPAYMENTS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        price_amount: amount,
        price_currency: 'usd',
        pay_currency: 'usdttrc20',
        order_id: user_id,
        order_description: 'Arowin Deposit'
      })
    })

    const data = await response.json()

    return res.status(200).json(data)

  } catch (err) {
    console.log(err)
    return res.status(500).send('Payment creation failed')
  }
}
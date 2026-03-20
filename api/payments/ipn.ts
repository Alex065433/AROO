import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('Webhook working')
  }

  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed')
  }

  const body = req.body

  // 🔐 VERIFY SIGNATURE (IMPORTANT)
  const receivedSig = req.headers['x-nowpayments-sig']
  const secret = process.env.NOWPAYMENTS_IPN_SECRET

  const hmac = crypto
    .createHmac('sha512', secret)
    .update(JSON.stringify(body))
    .digest('hex')

  if (hmac !== receivedSig) {
    return res.status(400).send('Invalid signature')
  }

  // ⛔ Ignore incomplete payments
  if (body.payment_status !== 'finished') {
    return res.status(200).send('Waiting payment')
  }

  // 🔗 Supabase connect
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // 💾 Save payment
  const { error } = await supabase
    .from('payments')
    ..insert({
  uid: body.order_id,
  amount: body.price_amount,
  payment_status: body.payment_status,
  payment_id: body.payment_id
})
    }

  if (error) {
    console.log(error)
    return res.status(500).send('DB error')
  }

  return res.status(200).send('Saved')
}
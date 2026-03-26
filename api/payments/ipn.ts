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
    process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  )

  // 💾 Save payment using RPC to handle UUID casting
  const { error } = await supabase.rpc('admin_add_payment_rpc', {
    p_uid: body.order_id.toString(),
    p_amount: body.price_amount.toString(),
    p_type: 'deposit',
    p_method: 'CRYPTO',
    p_description: 'Crypto Deposit (NOWPayments)',
    p_status: body.payment_status,
    p_payment_id: body.payment_id.toString(),
    p_currency: body.pay_currency || 'usdtbsc',
    p_order_id: body.order_id.toString()
  });

  if (error) {
    console.error('IPN DB Error:', JSON.stringify(error, null, 2));
    return res.status(500).send('DB error')
  }

  console.log(`IPN processed for ${body.payment_id}. Status: ${body.payment_status}. Database trigger will handle wallet updates.`);
  return res.status(200).send('Saved')
}
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

  // 💾 Save payment
  const { error } = await supabase
    .from('payments')
    .insert({
      uid: body.order_id,
      amount: body.price_amount,
      status: body.payment_status,
      payment_id: body.payment_id,
      created_at: new Date().toISOString()
    });

  if (body.payment_status === 'finished') {
    // Update user wallet
    const { data: profile } = await supabase
      .from('profiles')
      .select('wallets')
      .eq('id', body.order_id)
      .single();
    
    if (profile) {
      const updatedWallets = {
        ...profile.wallets,
        master: {
          ...profile.wallets?.master,
          balance: (profile.wallets?.master?.balance || 0) + Number(body.price_amount)
        }
      };
      await supabase
        .from('profiles')
        .update({ wallets: updatedWallets })
        .eq('id', body.order_id);
    }
  }

  if (error) {
    console.log(error)
    return res.status(500).send('DB error')
  }

  return res.status(200).send('Saved')
}
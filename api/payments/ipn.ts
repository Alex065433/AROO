export default async function handler(req, res) {
  if (req.method === 'GET') {
    return res.status(200).send('Webhook working')
  }

  if (req.method === 'POST') {
    console.log('Payment received:', req.body)

    return res.status(200).json({ success: true })
  }

  return res.status(405).send('Method Not Allowed')
}
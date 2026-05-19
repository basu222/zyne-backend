const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const app = express();

app.use(cors());
app.use(express.json());

const BOT_TOKEN = '8645227789:AAEbpT3bW_qSUllPG4vgZ5NnoRnYXUPjYR8';
const CHAT_ID = '1761198919';

const pool = new Pool({
  connectionString:
    'postgresql://postgres.lkgftlizmvsdgpsjdeko:Zynewallet%40777@aws-1-ap-south-1.pooler.supabase.com:6543/postgres',
  ssl: {
    rejectUnauthorized: false,
  },
});

async function sendTelegram(message) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: CHAT_ID,
        text: message,
      }
    );
  } catch (err) {
    console.log(err.message);
  }
}

app.get('/', (req, res) => {
  res.send('Zyne Backend Running');
});

app.post('/click', async (req, res) => {
  try {
    const { upi_id, offer_id } = req.body;

    const click_id = uuidv4();

    await pool.query(
      `INSERT INTO clicks (click_id, upi_id, offer_id)
       VALUES ($1, $2, $3)`,
      [click_id, upi_id, offer_id]
    );

    const msg = `
🟡 OFFER CLICK

UPI: ${upi_id}
Offer ID: ${offer_id}
Click ID: ${click_id}
`;

    await sendTelegram(msg);

    res.json({
      success: true,
      click_id,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

app.listen(3000, () => {
  console.log('Server Running');
});

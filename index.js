const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   TELEGRAM SETTINGS
========================= */

const BOT_TOKEN = '8645227789:AAEbpT3bW_qSUllPG4vgZ5NnoRnYXUPjYR8';
const CHAT_ID = '1761198919';

/* =========================
   DATABASE CONNECTION
========================= */

const pool = new Pool({
  connectionString:
    'postgresql://postgres.lkgftlizmvsdgpsjdeko:Zynewallet%40777@aws-1-ap-south-1.pooler.supabase.com:6543/postgres',
  ssl: {
    rejectUnauthorized: false,
  },
});

/* =========================
   TELEGRAM FUNCTION
========================= */

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

/* =========================
   HOME ROUTE
========================= */

app.get('/', (req, res) => {
  res.send('Zyne Backend Running');
});

/* =========================
   TEST DATABASE
========================= */

app.get('/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/* =========================
   CLICK API
========================= */

app.post('/click', async (req, res) => {
  try {
    const { upi_id, offer_id } = req.body;

    const click_id = uuidv4();

    await pool.query(
      `INSERT INTO clicks
      (click_id, upi_id, offer_id)
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

/* =========================
   POSTBACK API
========================= */

app.get('/postback', async (req, res) => {
  try {
    const { click_id, amount } = req.query;

    const clickResult = await pool.query(
      `SELECT * FROM clicks WHERE click_id = $1`,
      [click_id]
    );

    if (clickResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Invalid click_id',
      });
    }

    const clickData = clickResult.rows[0];

    const upi_id = clickData.upi_id;

    /* SAVE CONVERSION */

    await pool.query(
      `INSERT INTO conversions
      (click_id, upi_id, amount, status)
      VALUES ($1, $2, $3, $4)`,
      [click_id, upi_id, amount, 'approved']
    );

    /* CHECK WALLET */

    const walletCheck = await pool.query(
      `SELECT * FROM wallet WHERE upi_id = $1`,
      [upi_id]
    );

    if (walletCheck.rows.length === 0) {
      await pool.query(
        `INSERT INTO wallet
        (upi_id, balance, total_earned)
        VALUES ($1, $2, $3)`,
        [upi_id, amount, amount]
      );
    } else {
      await pool.query(
        `UPDATE wallet
         SET balance = balance + $1,
             total_earned = total_earned + $1
         WHERE upi_id = $2`,
        [amount, upi_id]
      );
    }

    /* TELEGRAM ALERT */

    const msg = `
🟢 OFFER COMPLETED

UPI: ${upi_id}
Amount: ₹${amount}
Click ID: ${click_id}
`;

    await sendTelegram(msg);

    res.json({
      success: true,
    });
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

/* =========================
   START SERVER
========================= */

app.listen(3000, () => {
  console.log('Server Running');
});/* =========================
   WALLET API
========================= */

app.post('/wallet', async (req, res) => {
  try {
    const { upi_id } = req.body;

    const result = await pool.query(
      `SELECT * FROM wallet WHERE upi_id = $1`,
      [upi_id]
    );

    if (result.rows.length === 0) {
      return res.json({
        balance: 0,
        total_earned: 0,
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({
      error: err.message,
    });
  }
});

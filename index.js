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

const BOT_TOKEN = '8645227789:AAENSRZ5rHsfyh8kvQ1MHLjcj6hZxr_fTeQ';

/* PERSONAL TELEGRAM */
const ADMIN_CHAT_ID = '1761198919';

/* TRACKING CHANNEL */
const TRACKING_CHANNEL_ID = '-1003963402892';

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

async function sendTelegram(chatId, message) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
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

    const upi_id = req.body.upi_id;
    const offer_id = req.body.offer_id;

    const click_id = uuidv4();

    /* SAVE CLICK */

    await pool.query(
      `INSERT INTO clicks
      (click_id, upi_id, offer_id)
      VALUES ($1, $2, $3)`,
      [click_id, upi_id, offer_id]
    );

    /* TRACKING ALERT */

    const msg = `
🟡 OFFER CLICK

UPI: ${upi_id}
Offer ID: ${offer_id}
Click ID: ${click_id}
`;

    await sendTelegram(TRACKING_CHANNEL_ID, msg);

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

    const click_id = req.query.click_id;
    const amount = Number(req.query.amount);

    /* CHECK CLICK */

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

      /* CREATE WALLET */

      await pool.query(
        `INSERT INTO wallet
        (upi_id, balance, total_earned)
        VALUES ($1, $2, $3)`,
        [upi_id, amount, amount]
      );

    } else {

      /* UPDATE WALLET */

      await pool.query(
        `UPDATE wallet
         SET balance = balance + $1,
             total_earned = total_earned + $1
         WHERE upi_id = $2`,
        [amount, upi_id]
      );

    }

    /* COMPLETE ALERT */

    const msg = `
🟢 OFFER COMPLETED

UPI: ${upi_id}
Amount: ₹${amount}
Click ID: ${click_id}
`;

    await sendTelegram(TRACKING_CHANNEL_ID, msg);

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
   WALLET API
========================= */

app.post('/wallet', async (req, res) => {

  try {

    const upi_id = req.body.upi_id;

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

/* =========================
   TASK HISTORY API
========================= */

app.post('/history', async (req, res) => {

  try {

    const upi_id = req.body.upi_id;

    const result = await pool.query(
      `SELECT *
       FROM conversions
       WHERE upi_id = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [upi_id]
    );

    res.json(result.rows);

  } catch (err) {

    res.status(500).json({
      error: err.message,
    });

  }
});

/* =========================
   WITHDRAW API
========================= */

app.post('/withdraw', async (req, res) => {

  try {

    const upi_id = req.body.upi_id;
    const amount = Number(req.body.amount);

    /* CHECK WALLET */

    const walletResult = await pool.query(
      `SELECT * FROM wallet WHERE upi_id = $1`,
      [upi_id]
    );

    if (walletResult.rows.length === 0) {

      return res.status(404).json({
        error: 'Wallet not found',
      });

    }

    const wallet = walletResult.rows[0];

    /* MINIMUM WITHDRAW */

    if (amount < 10) {

      return res.status(400).json({
        error: 'Minimum withdrawal is ₹10',
      });

    }

    /* INSUFFICIENT BALANCE */

    if (wallet.balance < amount) {

      return res.status(400).json({
        error: 'Insufficient balance',
      });

    }

    /* DEDUCT BALANCE */

    await pool.query(
      `UPDATE wallet
       SET balance = balance - $1
       WHERE upi_id = $2`,
      [amount, upi_id]
    );

    /* SAVE WITHDRAWAL */

    await pool.query(
      `INSERT INTO withdrawals
      (upi_id, amount, status)
      VALUES ($1, $2, $3)`,
      [upi_id, amount, 'pending']
    );

    /* ADMIN ALERT */

    const msg = `
💸 WITHDRAWAL REQUEST

UPI: ${upi_id}
Amount: ₹${amount}
`;

    await sendTelegram(ADMIN_CHAT_ID, msg);

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
});

const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const nodemailer = require('nodemailer');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const app = express();

app.use(express.json());
app.use(cors());

app.use(express.static(path.join(__dirname, '../frontend')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api', authRoutes);  

// Serve Frontend
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// Match Email Sender
async function sendMatchEmail(donor, recipient) {
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        }
    });

    let mailOptions = {
        from: process.env.EMAIL_USER,
        to: [donor.email, recipient.email],
        subject: 'Organ Donation Match Found - Life-Link',
        text: `Dear ${donor.name} and ${recipient.name},

A verified match has been found for organ donation.

Donor Details:
Name: ${donor.name}
Blood Group: ${donor.bloodGroup}
Organ: ${donor.organ}

Recipient Details:
Name: ${recipient.name}
Blood Group: ${recipient.bloodGroup}
Organ Needed: ${recipient.organ}

Please visit the hospital within the next few days for further procedures.

Regards,
Life-Link Admin`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log("✅ Email sent successfully.");
    } catch (error) {
        console.error("❌ Error sending email:", error);
    }
}

app.post('/api/admin/match', async (req, res) => {
    const { donor, recipient } = req.body;

    if (!donor || !recipient) {
        return res.status(400).json({ message: 'Donor or Recipient data is missing' });
    }

    await sendMatchEmail(donor, recipient);
    return res.status(200).json({ message: 'Match found and emails sent' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));




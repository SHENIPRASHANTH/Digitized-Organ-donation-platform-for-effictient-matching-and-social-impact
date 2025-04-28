const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const driver = require('../config/neo4j');

const router = express.Router();

// In-memory store for OTPs (consider using a more persistent solution like Redis for production)
let otpStore = {};

// Function to generate a random OTP
function generateOtp() {
  return crypto.randomInt(100000, 999999).toString(); // 6-digit OTP
}

// Function to send OTP via email
async function sendOtpEmail(email, otp) {
  let transporter = nodemailer.createTransport({
    service: 'gmail', // You can use other email services like SendGrid, AWS SES, etc.
    auth: {
      user: process.env.EMAIL_USER, // Your email address
      pass: process.env.EMAIL_PASS, // Your email password or app password
    },
  });

  let info = await transporter.sendMail({
    from: '"Life-Link" <no-reply@lifelink.com>',
    to: email,
    subject: 'Your OTP for Life-Link Registration',
    text: `Your OTP for registration is: ${otp}`,
  });

  console.log('Message sent: %s', info.messageId);
}

// User Registration
router.post('/register', async (req, res) => {
  const { name, email, password, phone, bloodGroup, organ, address, userType, otp } = req.body;

  // Verify OTP
  if (otp !== otpStore[email]) {
    return res.status(400).json({ error: 'Invalid OTP' });
  }

  // Encrypt the password
  const encryptedPassword = await bcrypt.hash(password, 10);

  const session = driver.session();
  try {
    const userLabel = userType === 'donor' ? 'Donor' : 'Recipient';

    // Create the user node in the Neo4j database
    await session.run(
      `CREATE (u:${userLabel} {name: $name, email: $email, password: $password, phone: $phone, bloodGroup: $bloodGroup, organ: $organ, address: $address})`,
      { name, email, password: encryptedPassword, phone, bloodGroup, organ, address }
    );

    // Remove OTP after successful registration
    delete otpStore[email];

    res.status(201).json({ message: 'User registered successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    await session.close();
  }
});

// User Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const session = driver.session();

  try {
    const result = await session.run(
      `MATCH (u) WHERE u.email = $email RETURN u.password AS password, labels(u) AS type`,
      { email }
    );

    if (result.records.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.records[0];
    const storedPassword = user.get('password');
    const userType = user.get('type')[0];  // Get user type (Admin, Donor, Recipient)

    // If admin, directly check password (without bcrypt)
    if (userType === 'Admin') {
      if (password !== storedPassword) {
        return res.status(401).json({ error: 'Incorrect admin password!' });
      }
    } else {
      const isPasswordValid = await bcrypt.compare(password, storedPassword);
      if (!isPasswordValid) return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ message: 'Login successful', userType });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  } finally {
    await session.close();
  }
});

// Fetch Donors and Recipients
router.get('/users', async (req, res) => {
  const session = driver.session();
  try {
    const donorResult = await session.run(`MATCH (d:Donor) RETURN d`);
    const recipientResult = await session.run(`MATCH (r:Recipient) RETURN r`);

    const donors = donorResult.records.map(record => record.get('d').properties);
    const recipients = recipientResult.records.map(record => record.get('r').properties);

    res.json({ donors, recipients });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  } finally {
    await session.close();
  }
});

// Fetch Logged-in User Details
router.get('/user/:email', async (req, res) => {
  const { email } = req.params;
  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (u) WHERE u.email = $email RETURN u, labels(u) AS type`,
      { email }
    );

    if (result.records.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = result.records[0].get('u').properties;
    const userType = result.records[0].get('type')[0];

    delete user.password; // Remove password from response
    res.json({ user, userType });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user details' });
  } finally {
    await session.close();
  }
});

// Update User Details
router.put('/user/:email', async (req, res) => {
  const { email } = req.params;
  const updates = req.body;

  // Set default empty string if any field is missing
  const { name = "", phone = "", bloodGroup = "", organ = "", address = "" } = updates;

  const session = driver.session();
  try {
    const result = await session.run(
      `MATCH (u) WHERE u.email = $email 
       SET u.name = $name, 
           u.phone = $phone, 
           u.bloodGroup = $bloodGroup, 
           u.organ = $organ, 
           u.address = $address 
       RETURN u`,
      { email, name, phone, bloodGroup, organ, address }
    );

    if (result.records.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'User updated successfully.' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error updating user.', error: err });
  } finally {
    await session.close();
  }
});

// Endpoint to send OTP for registration
router.post('/sendOtp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  const otp = generateOtp();

  // Store OTP for this email (for verification)
  otpStore[email] = otp;

  try {
    await sendOtpEmail(email, otp);
    res.status(200).json({ message: 'OTP sent successfully!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Failed to send OTP. Please try again.' });
  }
});

module.exports = router;

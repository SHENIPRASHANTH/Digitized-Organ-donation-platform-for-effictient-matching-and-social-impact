const express = require('express');
const driver = require('../config/neo4j');

const router = express.Router();

// ✅ Route: Find Matches (Only verified users)
router.get('/find-matches', async (req, res) => {
    const session = driver.session();
    try {
        const result = await session.run(`
            MATCH (d:Donor {verified: true}), (r:Recipient {verified: true})
            WHERE d.bloodGroup = r.bloodGroup AND d.organ = r.organ
            MERGE (d)-[:MATCHED]->(r)
            RETURN d, r
        `);

        const matches = result.records.map(record => ({
            donor: record.get('d').properties,
            recipient: record.get('r').properties
        }));

        res.json({ matches });
    } catch (error) {
        console.error("Match error:", error);
        res.status(500).json({ error: "Error finding matches" });
    } finally {
        await session.close();
    }
});

// ✅ Route: Get Users (Donors or Recipients)
router.get('/users/:role', async (req, res) => {
    const session = driver.session();
    const { role } = req.params;
    const label = role.charAt(0).toUpperCase() + role.slice(1);

    try {
        const result = await session.run(`
            MATCH (u:${label})
            RETURN u
        `);

        const users = result.records.map(record => record.get('u').properties);
        res.json(users);
    } catch (error) {
        console.error("Fetch users error:", error);
        res.status(500).json({ error: 'Error fetching users' });
    } finally {
        await session.close();
    }
});

// ✅ Route: Verify Single User
router.post('/verify', async (req, res) => {
    const session = driver.session();
    const { role, email, verified } = req.body;
    const label = role.charAt(0).toUpperCase() + role.slice(1);

    try {
        await session.run(`
            MATCH (u:${label} {email: $email})
            SET u.verified = $verified
        `, { email, verified });

        res.json({ message: `User verification status set to ${verified}` });
    } catch (error) {
        console.error("Verify user error:", error);
        res.status(500).json({ error: 'Error updating verification status' });
    } finally {
        await session.close();
    }
});

// ✅ Route: Bulk Update Verification Status
router.post('/update-verification-status', async (req, res) => {
    const session = driver.session();
    const users = req.body; // Array of { email, isVerified, role }

    try {
        for (const user of users) {
            const label = user.role === 'donor' ? 'Donor' : 'Recipient';

            await session.run(
                `
                MATCH (u:${label} {email: $email})
                SET u.verified = $isVerified
                RETURN u
                `,
                {
                    email: user.email,
                    isVerified: user.isVerified,
                }
            );
        }

        res.status(200).json({ message: 'Verification statuses updated successfully.' });
    } catch (error) {
        console.error('Neo4j update error:', error);
        res.status(500).json({ error: 'Something went wrong while updating verification status.' });
    } finally {
        await session.close();
    }
});

module.exports = router;

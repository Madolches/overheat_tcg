import { pool, dbInit } from './db';
import { initServerCardLibrary } from './card_loader';
import { getLiveCardInventoryVariations } from './card_inventory';


async function initStore() {
    // console.log("Starting Store Schema Migration...");
    let conn;
    try {
        await initServerCardLibrary();
        await dbInit();
        conn = await pool.getConnection();

        // 1. Add coins column to users table
        try {
            await conn.query(`ALTER TABLE users ADD COLUMN coins INT DEFAULT 100000`);
            // console.log("✅ Added coins column to users");
        } catch (e: any) {
            if (e.code === 'ER_DUP_FIELDNAME') {
                // console.log("⚠️ coins column already exists");
            } else {
                throw e;
            }
        }

        // Set all existing users to 100000 coins
        await conn.query(`UPDATE users SET coins = 100000 WHERE coins IS NULL OR coins = 0`);
        // console.log("✅ Set initial coins for existing users");

        // 2. Create user_cards table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS user_cards (
                user_id VARCHAR(50) NOT NULL,
                card_id VARCHAR(50) NOT NULL,
                rarity VARCHAR(10) NOT NULL,
                quantity INT NOT NULL DEFAULT 0,
                PRIMARY KEY (user_id, card_id, rarity),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        // console.log("✅ user_cards table ensured");

        // 3. Create pack_history table for pity tracking
        await conn.query(`
            CREATE TABLE IF NOT EXISTS pack_history (
                user_id VARCHAR(50) PRIMARY KEY,
                total_packs INT DEFAULT 0,
                packs_since_sr INT DEFAULT 0,
                packs_since_ur INT DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        // console.log("✅ pack_history table ensured");

        // 4. Give all existing users the initial card collection (4 copies of each base card)
        const users = await conn.query('SELECT id FROM users');
        const cardVariations = getLiveCardInventoryVariations();

        for (const user of users) {
            for (const card of cardVariations) {
                await conn.query(
                    `INSERT INTO user_cards (user_id, card_id, rarity, quantity) VALUES (?, ?, ?, 4)
                     ON DUPLICATE KEY UPDATE quantity = 4`,
                    [user.id, card.cardId, card.rarity]
                );
            }
            // Initialize pack history
            await conn.query(
                `INSERT INTO pack_history (user_id, total_packs, packs_since_sr, packs_since_ur) VALUES (?, 0, 0, 0)
                 ON DUPLICATE KEY UPDATE total_packs = 0, packs_since_sr = 0, packs_since_ur = 0`,
                [user.id]
            );
        }
        // console.log("✅ Initial card collection given to all users (4 copies each)");

        // console.log("🚀 Store schema migration complete!");
    } catch (err) {
        console.error("❌ Migration error:", err);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
}

initStore();

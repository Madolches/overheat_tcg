import { dbInit, pool } from './db';
import { initServerCardLibrary } from './card_loader';
import { getLiveCardInventoryVariations } from './card_inventory';

type CliOptions = {
    user: string;
};

function parseArgs(argv: string[]): CliOptions {
    const userArg = argv.find(arg => arg.startsWith('--user='));
    const user = userArg?.slice('--user='.length).trim();

    if (!user) {
        throw new Error('Missing required argument --user=<userId|username|email>');
    }

    return { user };
}

async function refillUserCards() {
    let conn;

    try {
        const { user } = parseArgs(process.argv.slice(2));

        await initServerCardLibrary();
        await dbInit();

        conn = await pool.getConnection();

        const userRows = await conn.query(
            `SELECT id, username, email
             FROM users
             WHERE id = ? OR username = ? OR email = ?
             LIMIT 1`,
            [user, user, user]
        );

        if (userRows.length === 0) {
            throw new Error(`User not found: ${user}`);
        }

        const targetUser = userRows[0];
        const userId = String(targetUser.id);
        const cardVariations = getLiveCardInventoryVariations();

        await conn.beginTransaction();

        await conn.query(
            `INSERT INTO pack_history (user_id, total_packs, packs_since_sr, packs_since_ur)
             VALUES (?, 0, 0, 0)
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id)`,
            [userId]
        );

        for (const card of cardVariations) {
            await conn.query(
                `INSERT INTO user_cards (user_id, card_id, rarity, quantity)
                 VALUES (?, ?, ?, 4)
                 ON DUPLICATE KEY UPDATE quantity = GREATEST(quantity, 4)`,
                [userId, card.cardId, card.rarity]
            );
        }

        await conn.commit();

        console.log(
            `[RefillCards] Ensured ${cardVariations.length} card variations are at least 4 copies for user ${targetUser.username} (${userId}).`
        );
    } catch (err) {
        if (conn) {
            await conn.rollback();
        }
        console.error('[RefillCards] Failed to refill user cards:', err);
        process.exitCode = 1;
    } finally {
        if (conn) {
            conn.release();
        }
        process.exit();
    }
}

refillUserCards();

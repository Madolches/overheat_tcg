import { dbInit, pool } from './db';
import { initServerCardLibrary } from './card_loader';
import { getLiveCardInventoryVariations } from './card_inventory';

async function resetAllUserCards() {
    let conn;

    try {
        await initServerCardLibrary();
        await dbInit();

        const cardVariations = getLiveCardInventoryVariations();
        conn = await pool.getConnection();

        const users = await conn.query('SELECT id FROM users');
        const userIds = users.map((user: { id: string }) => user.id);

        await conn.beginTransaction();
        await conn.query('DELETE FROM user_cards');
        await conn.query('DELETE FROM pack_history');

        for (const userId of userIds) {
            await conn.query(
                `INSERT INTO pack_history (user_id, total_packs, packs_since_sr, packs_since_ur)
                 VALUES (?, 0, 0, 0)`,
                [userId]
            );

            for (const card of cardVariations) {
                await conn.query(
                    `INSERT INTO user_cards (user_id, card_id, rarity, quantity)
                     VALUES (?, ?, ?, 4)`,
                    [userId, card.cardId, card.rarity]
                );
            }
        }

        await conn.commit();

        console.log(
            `[ResetCards] Rebuilt ${userIds.length} users with ${cardVariations.length} card variations each (${userIds.length * cardVariations.length} user_cards rows).`
        );
    } catch (err) {
        if (conn) {
            await conn.rollback();
        }
        console.error('[ResetCards] Failed to rebuild user cards:', err);
        process.exitCode = 1;
    } finally {
        if (conn) {
            conn.release();
        }
        process.exit();
    }
}

resetAllUserCards();

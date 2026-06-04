import { pool } from './db';
import bcrypt from 'bcryptjs';

async function initDB() {
    // console.log("Starting Database Initialization...");
    let conn;
    try {
        conn = await pool.getConnection();

        // 1. Create users table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS users (
                id VARCHAR(50) PRIMARY KEY,
                username VARCHAR(50) UNIQUE NOT NULL,
                email VARCHAR(255) UNIQUE NULL,
                password_hash VARCHAR(255) NOT NULL,
                display_name VARCHAR(50) NOT NULL,
                role VARCHAR(20) DEFAULT 'user',
                coins BIGINT DEFAULT 100000,
                card_crystals BIGINT DEFAULT 100000,
                favorite_card_id VARCHAR(50) DEFAULT 'fav_card',
                favorite_back_id VARCHAR(50) DEFAULT 'default',
                created_at BIGINT,
                session_version INT NOT NULL DEFAULT 0
            )
        `);
        // console.log("✅ Users table ensured");

        // 2. Create games table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS games (
                id VARCHAR(50) PRIMARY KEY,
                state JSON NOT NULL,
                status INT DEFAULT 0,
                created_at BIGINT,
                updated_at BIGINT
            )
        `);
        // console.log("✅ Games table ensured");

        await conn.query(`
            CREATE TABLE IF NOT EXISTS ai_match_samples (
                id VARCHAR(64) PRIMARY KEY,
                game_id VARCHAR(64) NOT NULL,
                created_at BIGINT NOT NULL,
                finished_at BIGINT NOT NULL,
                mode VARCHAR(32),
                bot_profile_id VARCHAR(64),
                bot_difficulty VARCHAR(16),
                opponent_archetype VARCHAR(32),
                opponent_traits JSON,
                player_deck_hash VARCHAR(64),
                winner_side VARCHAR(16),
                win_reason VARCHAR(64),
                turn_count INT,
                final_phase VARCHAR(32),
                ai_decision_logs JSON,
                battle_logs JSON,
                final_board JSON,
                diagnosis JSON,
                ai_version VARCHAR(64),
                INDEX idx_ai_samples_created_at (created_at),
                INDEX idx_ai_samples_bot_profile (bot_profile_id),
                INDEX idx_ai_samples_opponent_archetype (opponent_archetype),
                INDEX idx_ai_samples_win_reason (win_reason)
            )
        `);
        // console.log("✅ AI match samples table ensured");

        // 3. Create decks table
        await conn.query(`
            CREATE TABLE IF NOT EXISTS decks (
                id VARCHAR(50) PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                name VARCHAR(100) NOT NULL,
                cards JSON NOT NULL,
                is_favorite BOOLEAN DEFAULT FALSE,
                created_at BIGINT,
                updated_at BIGINT,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        // console.log("✅ Decks table ensured");

        // 4. Seed Users
        await conn.query(`
            CREATE TABLE IF NOT EXISTS email_verification_codes (
                email VARCHAR(255) PRIMARY KEY,
                username VARCHAR(50) NOT NULL,
                code VARCHAR(6) NOT NULL,
                expires_at BIGINT NOT NULL,
                created_at BIGINT NOT NULL
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS password_reset_codes (
                email VARCHAR(255) PRIMARY KEY,
                user_id VARCHAR(50) NOT NULL,
                code VARCHAR(6) NOT NULL,
                expires_at BIGINT NOT NULL,
                created_at BIGINT NOT NULL,
                INDEX idx_password_reset_codes_user_id (user_id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS deck_square_posts (
                id VARCHAR(50) PRIMARY KEY,
                source_deck_id VARCHAR(255),
                user_id VARCHAR(50) NOT NULL,
                author_name VARCHAR(100) NOT NULL,
                name VARCHAR(255) NOT NULL,
                cards LONGTEXT NOT NULL,
                tags LONGTEXT,
                description LONGTEXT,
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL,
                INDEX (user_id),
                INDEX (created_at)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS deck_square_likes (
                post_id VARCHAR(50) NOT NULL,
                user_id VARCHAR(50) NOT NULL,
                created_at BIGINT NOT NULL,
                PRIMARY KEY (post_id, user_id)
            )
        `);

        await conn.query(`
            CREATE TABLE IF NOT EXISTS card_comments (
                id VARCHAR(50) PRIMARY KEY,
                card_id VARCHAR(50) NOT NULL,
                user_id VARCHAR(50) NOT NULL,
                author_name VARCHAR(100) NOT NULL,
                content TEXT NOT NULL,
                created_at BIGINT NOT NULL,
                updated_at BIGINT NOT NULL,
                INDEX idx_card_comments_card_created (card_id, created_at),
                INDEX idx_card_comments_user (user_id)
            )
        `);

        const accounts = [
            { id: 'admin', username: 'admin', password: 'admin123', name: 'Administrator', role: 'admin' },
            { id: 'user_guest1', username: 'guest1', password: 'guest111', name: 'Test User 1', role: 'user' },
            { id: 'user_guest2', username: 'guest2', password: 'guest222', name: 'Test User 2', role: 'user' },
            { id: 'user_guest3', username: 'guest3', password: 'guest333', name: 'Test User 3', role: 'user' },
            { id: 'user_guest4', username: 'guest4', password: 'guest444', name: 'Test User 4', role: 'user' },
            { id: 'user_guest5', username: 'guest5', password: 'guest555', name: 'Test User 5', role: 'user' },
        ];

        for (const account of accounts) {
            // Check if user exists
            const existing = await conn.query('SELECT username FROM users WHERE username = ?', [account.username]);
            if (existing.length === 0) {
                const hash = await bcrypt.hash(account.password, 10);
                await conn.query(
                    'INSERT INTO users (id, username, password_hash, display_name, role, coins, card_crystals, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [account.id, account.username, hash, account.name, account.role, 100000, 100000, Date.now()]
                );
                // console.log(`✅ Seeded user: ${account.username}`);
            } else {
                // console.log(`⚠️ User ${account.username} already exists`);
            }
        }

        // console.log("🚀 Database initialization complete!");
    } catch (err) {
        console.error("❌ Initialization error:", err);
    } finally {
        if (conn) conn.release();
        process.exit(0);
    }
}

initDB();

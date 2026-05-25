CREATE DATABASE IF NOT EXISTS overheat;
USE overheat;

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(50) NOT NULL,
    role VARCHAR(20) DEFAULT 'USER',
    coins BIGINT DEFAULT 100000,
    card_crystals BIGINT DEFAULT 100000,
    favorite_card_id VARCHAR(50) DEFAULT 'fav_card',
    favorite_back_id VARCHAR(50) DEFAULT 'default',
    created_at BIGINT,
    session_version INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS games (
    id VARCHAR(50) PRIMARY KEY,
    state JSON NOT NULL,
    status INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_cards (
    user_id VARCHAR(50) NOT NULL,
    card_id VARCHAR(50) NOT NULL,
    rarity VARCHAR(10) NOT NULL,
    quantity INT NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, card_id, rarity)
);

CREATE TABLE IF NOT EXISTS deck_square_posts (
    id VARCHAR(50) PRIMARY KEY,
    source_deck_id VARCHAR(255),
    user_id VARCHAR(50) NOT NULL,
    author_name VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    cards LONGTEXT NOT NULL,
    tags LONGTEXT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    INDEX (user_id),
    INDEX (created_at)
);

CREATE TABLE IF NOT EXISTS deck_square_likes (
    post_id VARCHAR(50) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    created_at BIGINT NOT NULL,
    PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS email_verification_codes (
    email VARCHAR(255) PRIMARY KEY,
    username VARCHAR(50) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS bug_cup_registrations (
    edition INT NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    deck_source_ids LONGTEXT NOT NULL,
    deck_names LONGTEXT NOT NULL,
    deck_cards LONGTEXT NOT NULL,
    deck_square_post_ids LONGTEXT NOT NULL,
    registered_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    locked_at BIGINT,
    PRIMARY KEY (edition, user_id),
    INDEX idx_bug_cup_reg_edition (edition),
    INDEX idx_bug_cup_reg_registered_at (registered_at)
);

CREATE TABLE IF NOT EXISTS bug_cup_matches (
    id VARCHAR(64) PRIMARY KEY,
    edition INT NOT NULL,
    phase VARCHAR(20) NOT NULL,
    round INT NOT NULL,
    player1_id VARCHAR(50) NOT NULL,
    player2_id VARCHAR(50),
    player1_deck_index INT,
    player2_deck_index INT,
    player1_ready BOOLEAN DEFAULT FALSE,
    player2_ready BOOLEAN DEFAULT FALSE,
    player1_ready_at BIGINT,
    player2_ready_at BIGINT,
    game_id VARCHAR(64),
    winner_id VARCHAR(50),
    result_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    scheduled_for BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    INDEX idx_bug_cup_matches_edition_phase_round (edition, phase, round),
    INDEX idx_bug_cup_matches_players (player1_id, player2_id),
    INDEX idx_bug_cup_matches_game (game_id)
);

-- Note: The passwords below are hashed with bcrypt. 
-- The plain text password for all these accounts is 'password123'
INSERT IGNORE INTO users (id, username, password_hash, display_name, role) VALUES 
('admin-id', 'admin', '$2a$10$tZ2yYp7m3r1dY4q7Yt2d4O/pW/.4/7T/o.p/w3f1hP2eH2Yv/Fq.O', 'Administrator', 'ADMIN'),
('test1-id', 'test1', '$2a$10$tZ2yYp7m3r1dY4q7Yt2d4O/pW/.4/7T/o.p/w3f1hP2eH2Yv/Fq.O', 'Test User 1', 'USER'),
('test2-id', 'test2', '$2a$10$tZ2yYp7m3r1dY4q7Yt2d4O/pW/.4/7T/o.p/w3f1hP2eH2Yv/Fq.O', 'Test User 2', 'USER'),
('test3-id', 'test3', '$2a$10$tZ2yYp7m3r1dY4q7Yt2d4O/pW/.4/7T/o.p/w3f1hP2eH2Yv/Fq.O', 'Test User 3', 'USER'),
('test4-id', 'test4', '$2a$10$tZ2yYp7m3r1dY4q7Yt2d4O/pW/.4/7T/o.p/w3f1hP2eH2Yv/Fq.O', 'Test User 4', 'USER'),
('test5-id', 'test5', '$2a$10$tZ2yYp7m3r1dY4q7Yt2d4O/pW/.4/7T/o.p/w3f1hP2eH2Yv/Fq.O', 'Test User 5', 'USER');

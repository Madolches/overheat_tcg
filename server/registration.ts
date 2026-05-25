import nodemailer from 'nodemailer';
import { getLiveCardInventoryVariations } from './card_inventory';

const REGISTRATION_SENDER_EMAIL = '2032461502@qq.com';
const REGISTRATION_SENDER_PASS =
    process.env.REGISTER_MAIL_PASS ||
    process.env.QQ_MAIL_AUTH_CODE ||
    process.env.MAIL_AUTH_CODE ||
    '';
const REGISTRATION_CODE_EXPIRE_MS = 10 * 60 * 1000;
const REGISTRATION_CODE_RESEND_MS = 60 * 1000;

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
    if (!REGISTRATION_SENDER_PASS) {
        throw new Error('邮箱验证码服务未配置，请在环境变量中设置 REGISTER_MAIL_PASS 或 QQ_MAIL_AUTH_CODE。');
    }

    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: process.env.REGISTER_MAIL_HOST || 'smtp.qq.com',
            port: Number(process.env.REGISTER_MAIL_PORT || 465),
            secure: true,
            auth: {
                user: REGISTRATION_SENDER_EMAIL,
                pass: REGISTRATION_SENDER_PASS
            }
        });
    }

    return transporter;
}

export function normalizeEmail(email: string) {
    return email.trim().toLowerCase();
}

export function validateUsername(username: string) {
    const value = username.trim();
    if (value.length < 3 || value.length > 20) {
        return '用户名长度需要在 3 到 20 个字符之间';
    }
    if (/\s/.test(value)) {
        return '用户名不能包含空格';
    }
    return null;
}

export function validatePassword(password: string) {
    if (!password || password.length < 6 || password.length > 64) {
        return '密码长度需要在 6 到 64 个字符之间';
    }
    return null;
}

export function validateEmail(email: string) {
    const value = normalizeEmail(email);
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(value)) {
        return '邮箱格式不正确';
    }
    return null;
}

export function createVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

export function getVerificationCodeExpireMs() {
    return REGISTRATION_CODE_EXPIRE_MS;
}

export function getVerificationCodeResendMs() {
    return REGISTRATION_CODE_RESEND_MS;
}

export async function sendRegistrationVerificationEmail(targetEmail: string, code: string) {
    const mailer = getTransporter();
    await mailer.sendMail({
        from: `"神蚀创痕" <${REGISTRATION_SENDER_EMAIL}>`,
        to: targetEmail,
        subject: '神蚀创痕注册验证码',
        text: `你的验证码是 ${code}，10 分钟内有效。如果不是你本人操作，请忽略这封邮件。`,
        html: `
            <div style="font-family: Arial, sans-serif; color: #111;">
                <h2 style="margin-bottom: 12px;">神蚀创痕注册验证码</h2>
                <p style="margin: 0 0 12px;">你的验证码是：</p>
                <div style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #c1121f; margin: 0 0 16px;">
                    ${code}
                </div>
                <p style="margin: 0;">验证码 10 分钟内有效。如果不是你本人操作，请忽略这封邮件。</p>
            </div>
        `
    });
}

export async function seedStarterResources(conn: any, userId: string) {
    const cardVariations = getLiveCardInventoryVariations();

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
             ON DUPLICATE KEY UPDATE quantity = 4`,
            [userId, card.cardId, card.rarity]
        );
    }
}

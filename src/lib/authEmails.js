const DEFAULT_CLIENT_URL = 'http://localhost:3000';

function appLink(path) {
    return `${process.env.CLIENT_URL || DEFAULT_CLIENT_URL}${path}`;
}

function lockoutEmail({ name, minutes }) {
    return {
        subject: 'Your account is temporarily locked',
        text: `Hi ${name},\n\nToo many failed sign-in attempts locked your account for ${minutes} minutes. If this was not you, contact an administrator.`,
    };
}

function resetEmail({ name, link }) {
    return {
        subject: 'Reset your password',
        text: `Hi ${name},\n\nUse this link to reset your password:\n${link}\n\nIf you did not ask for this, ignore this email.`,
    };
}

function inviteEmail({ name, companyName, link }) {
    return {
        subject: `You are invited to ${companyName}`,
        text: `Hi ${name},\n\nYou have been invited to ${companyName}. Use this link to set up your account:\n${link}`,
    };
}

function verifyEmail({ name, link }) {
    return {
        subject: 'Verify your email',
        text: `Hi ${name},\n\nUse this link to verify your email address:\n${link}`,
    };
}

module.exports = { lockoutEmail, resetEmail, inviteEmail, verifyEmail, appLink };

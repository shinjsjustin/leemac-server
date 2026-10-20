const DEFAULT_FROM = 'leemac@leemac.co';

function createMailer({ client, from }) {
    return {
        async send({ to, subject, text }) {
            await client.sendEmail({
                FromEmailAddress: from,
                Destination: { ToAddresses: [to] },
                Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: text } } } },
            }).promise();
        },
    };
}

let defaultMailer;

function sendMail(message) {
    if (!defaultMailer) {
        const AWS = require('aws-sdk');
        defaultMailer = createMailer({
            client: new AWS.SESV2({ region: process.env.AWS_REGION }),
            from: process.env.MAIL_FROM || DEFAULT_FROM,
        });
    }
    return defaultMailer.send(message);
}

module.exports = { createMailer, sendMail };

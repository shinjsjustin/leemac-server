const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMailer, sendMail } = require('../../src/lib/mailer');

function fakeClient() {
    const calls = [];
    return { calls, sendEmail(input) { calls.push(input); return { promise: async () => ({}) }; } };
}

test('send calls sendEmail once with sender, one recipient, subject and text', async () => {
    const client = fakeClient();
    await createMailer({ client, from: 'a@x.co' }).send({ to: 'b@y.co', subject: 'Hi', text: 'Body' });
    assert.deepEqual(client.calls, [{
        FromEmailAddress: 'a@x.co',
        Destination: { ToAddresses: ['b@y.co'] },
        Content: { Simple: { Subject: { Data: 'Hi' }, Body: { Text: { Data: 'Body' } } } },
    }]);
});

test('send awaits the promise and rejects when it rejects', async () => {
    const client = { sendEmail: () => ({ promise: async () => { throw new Error('ses down'); } }) };
    await assert.rejects(
        createMailer({ client, from: 'a@x.co' }).send({ to: 'b@y.co', subject: 's', text: 't' }),
        /ses down/
    );
});

test('sendMail is exported as a function', () => {
    assert.equal(typeof sendMail, 'function');
});

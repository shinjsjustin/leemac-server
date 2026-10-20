const { signAdminToken, signClientToken } = require('../../src/lib/auth');

const TEST_SID = 'f'.repeat(64);
const SESSION_HANDLER = { match: /FROM auth_session/, rows: [{ id: TEST_SID }] };

const adminToken = (row) => signAdminToken(row, TEST_SID);
const clientToken = (row) => signClientToken(row, TEST_SID);

module.exports = { TEST_SID, SESSION_HANDLER, adminToken, clientToken };

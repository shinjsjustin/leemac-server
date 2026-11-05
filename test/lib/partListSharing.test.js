const test = require('node:test');
const assert = require('node:assert/strict');
const { makeSharedListsDb } = require('../helpers/sharedListsSqliteDb');
const sharing = require('../../src/lib/partListSharing');
const shared = require('../../src/lib/sharedPartLists');
const { AdminPartListError } = require('../../src/lib/adminPartLists');

const ADMIN = { id: 7, email: 'a@x.com' };
const B = { id: 22, name: 'Bob', company_id: 2 };
const TOKEN_LENGTH = 43;

// List 1 holds part 1 (company 1 and 2 both have it), part 3 (company 1 fee line only), part 4 (company 2 only),
// where company 2 added part 4. Company 3 has no parts. List 2 has no token yet.
function seed() {
    const db = makeSharedListsDb();
    db.sqlite.exec(`
      INSERT INTO company (id, name) VALUES (1,'Acme'),(2,'Bolt'),(3,'Cog');
      INSERT INTO job (id, company_id, job_number) VALUES (1,1,'J1'),(2,2,'J2');
      INSERT INTO part (id, number, description) VALUES (1,'P1','Bracket'),(3,'P3','Rush fee'),(4,'P4','Gear');
      INSERT INTO job_part (job_id, part_id, details) VALUES (1,1,'*AL'),(1,3,'*Fee'),(2,4,'*Steel'),(2,1,'*Steel');
      INSERT INTO admin_part_list (id, name, created_by_id, created_by_name, updated_by_id, updated_by_name, created_at, updated_at)
        VALUES (1,'One','1','A','1','A','t','t'),(2,'Two','1','A','1','A','t','t');
      INSERT INTO admin_part_list_item (list_id, part_id, added_at, added_by_company_id)
        VALUES (1,1,'t',NULL),(1,3,'t',NULL),(1,4,'t',2);
      INSERT INTO admin_part_list_member (list_id, company_id, joined_by_id, joined_by_name, joined_at)
        VALUES (1,1,'1','Ann','2025-01-01'),(1,2,'2','Bob','2025-01-02'),(1,3,'3','Cy','2025-01-03');
    `);
    return db;
}

test('turning a link on makes a 43-character token, off keeps members, on again restores the same token', async () => {
    const db = seed();
    const on = await sharing.setSharing(db, ADMIN, 2, { enabled: true });
    assert.equal(on.enabled, true);
    assert.match(on.token, /^[A-Za-z0-9_-]{43}$/);
    assert.equal(on.token.length, TOKEN_LENGTH);

    const off = await sharing.setSharing(db, ADMIN, 1, { enabled: true });
    const firstToken = off.token;
    const disabled = await sharing.setSharing(db, ADMIN, 1, { enabled: false });
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.token, null);
    assert.equal(disabled.members.length, 3);

    const again = await sharing.setSharing(db, ADMIN, 1, { enabled: true });
    assert.equal(again.token, firstToken);
});

test('setSharing rejects a non-boolean enabled with 400 and a missing list is null', async () => {
    const db = seed();
    for (const body of [{}, { enabled: 'true' }, { enabled: 1 }, null]) {
        await assert.rejects(sharing.setSharing(db, ADMIN, 1, body), (e) => e instanceof AdminPartListError && e.status === 400);
    }
    assert.equal(await sharing.setSharing(db, ADMIN, 99, { enabled: true }), null);
    assert.equal(await sharing.getSharing(db, 99), null);
});

test('getSharing lists members and, per part, the member companies that cannot see it', async () => {
    const db = seed();
    const reply = await sharing.getSharing(db, 1);
    assert.deepEqual(reply, {
        enabled: false,
        token: null,
        members: [
            { company_id: 1, company_name: 'Acme', joined_at: '2025-01-01' },
            { company_id: 2, company_name: 'Bolt', joined_at: '2025-01-02' },
            { company_id: 3, company_name: 'Cog', joined_at: '2025-01-03' },
        ],
        parts: [
            { part_id: 1, hidden_from: [3] },
            { part_id: 3, hidden_from: [1, 2, 3] },
            { part_id: 4, hidden_from: [1, 3] },
        ],
    });
});

test('removing a member keeps its added parts and lets it rejoin only while the link is on', async () => {
    const db = seed();
    const token = (await sharing.setSharing(db, ADMIN, 1, { enabled: true })).token;
    const reply = await sharing.removeMember(db, ADMIN, 1, 2);
    assert.deepEqual(reply.members.map((m) => m.company_id), [1, 3]);
    assert.ok(reply.parts.some((p) => p.part_id === 4));

    const rejoined = await shared.joinList(db, B, token);
    assert.equal(rejoined.joined, true);

    await sharing.removeMember(db, ADMIN, 1, 2);
    await sharing.setSharing(db, ADMIN, 1, { enabled: false });
    assert.equal(await shared.joinList(db, B, token), null);
    assert.equal((await sharing.getSharing(db, 1)).members.some((m) => m.company_id === 2), false);
});

test('removeMember on a missing list is null', async () => {
    assert.equal(await sharing.removeMember(seed(), ADMIN, 99, 2), null);
});

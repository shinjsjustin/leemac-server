/**
 * Find the existing, enabled admin for a Google profile and refresh its Google data.
 * Never creates an admin.
 * @returns {Promise<object|null>} the admin row, or null when unknown or disabled
 */
async function findGoogleAdmin({ db, profile, accessToken, refreshToken }) {
    const googleId = profile.id;
    const email = profile.emails[0].value;
    const picture = profile.photos[0].value;

    const [byGoogleId] = await db.execute('SELECT * FROM admin WHERE google_id = ?', [googleId]);
    if (byGoogleId.length > 0) {
        if (byGoogleId[0].disabled) return null;
        await db.execute(
            'UPDATE admin SET profile_picture = ?, google_access_token = ?, google_refresh_token = ? WHERE google_id = ?',
            [picture, accessToken, refreshToken, googleId]
        );
        const [updated] = await db.execute('SELECT * FROM admin WHERE google_id = ?', [googleId]);
        return updated[0];
    }

    const [byEmail] = await db.execute('SELECT * FROM admin WHERE email = ?', [email]);
    if (byEmail.length === 0 || byEmail[0].disabled) return null;
    await db.execute(
        'UPDATE admin SET google_id = ?, profile_picture = ?, google_access_token = ?, google_refresh_token = ? WHERE email = ?',
        [googleId, picture, accessToken, refreshToken, email]
    );
    const [updated] = await db.execute('SELECT * FROM admin WHERE email = ?', [email]);
    return updated[0];
}

module.exports = { findGoogleAdmin };

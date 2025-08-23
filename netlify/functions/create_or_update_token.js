const admin = require("firebase-admin");

// Initialize Firebase Admin SDK
const serviceAccount = require("../../portal-services-zalo-firebase-adminsdk-kni5o-4f5fde7cd9.json");

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`,
    });
}

const db = admin.firestore();

const { commonHeaders, } = require("./shared");

exports.handler = async function (event, context) {
    const db_oa_token = 'oa-token';

    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers: commonHeaders,
            body: '',
        };
    }

    try {
        // Parse request body
        const data = JSON.parse(event.body);
        const { id, project, refresh_token, token, userCreated, userUpdated } = data;

        const timeNow = new Date().toISOString();
        let docRef;

        if (id) {
            // Update existing document
            docRef = db.collection(db_oa_token).doc(id);
            const doc = await docRef.get();

            if (doc.exists) {
                await docRef.update({
                    project,
                    refresh_token: refresh_token || "",
                    token,
                    userUpdated: userUpdated || 'SERVER',
                    timeUpdated: timeNow,
                });

                return {
                    statusCode: 200,
                    headers: commonHeaders,
                    body: JSON.stringify({ message: 'Updated successfully' }),
                };
            } else {
                // If `id` exists but document is missing, create it
                await docRef.set({
                    id,
                    project,
                    refresh_token: refresh_token || "",
                    token,
                    userCreated: userCreated || 'unknown',
                    userUpdated: userUpdated || 'SERVER',
                    timeCreated: timeNow,
                    timeUpdated: timeNow,
                });

                return {
                    statusCode: 201,
                    headers: commonHeaders,
                    body: JSON.stringify({ message: 'Document created successfully (with provided id)', id }),
                };
            }
        } else {
            const oaTokenRef = db.collection(db_oa_token);

            // Lấy ID mới
            const snapshot = await oaTokenRef.orderBy("id", "desc").limit(1).get();
            let newId = 1;
            if (!snapshot.empty) {
                const lastUserId = snapshot.docs[0].data().id;
                newId = parseInt(lastUserId.split("-").pop()) + 1;
            }

            const id = `[${project}]-${db_oa_token}-` + newId;

            const request = {
                id: id,
                project,
                token,
                userCreated: userCreated || 'unknown',
                userUpdated: userUpdated || 'SERVER',
                timeCreated: timeNow,
                timeUpdated: timeNow,
            }

            await oaTokenRef.doc(id).set(request);

            return {
                statusCode: 201,
                headers: commonHeaders,
                body: JSON.stringify({ message: 'Create successfully' }),
            };
        }
    } catch (error) {
        return {
            statusCode: 500,
            headers: commonHeaders,
            body: JSON.stringify({ error: `Error: ${error.message}` }),
        };
    }
};
